import {PRESETS,DEFAULT_CONFIG,applyPreset,validateConfig,createMatrix,runCodecBenchmark,
 deterministicBytes,compareRuns,makeEnvironment,makeId} from './benchmark-core.mjs';
import {createStore,exportRuns} from './benchmark-store.mjs';
const $=id=>document.getElementById(id);
const all=(css,root=document)=>[...root.querySelectorAll(css)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
const ratio=x=>Number.isFinite(x)?(x*100).toFixed(1)+' %':'—';
const env=makeEnvironment();
const H=globalThis.AirFerryHighSpeed;
const preferencesKey='qrt-benchmark-preferences-v1';
let store=null,source='synthetic',preset='balanced',version='unbekannt',busy=false,paused=false,
 abortController=null,activeQueue=[],completed=0,selectedFilter='all',selectedIds=new Set(),
 history=[],samples=[],stream=null,streamFrames=0,streamSince=0,wasCancelled=false;
const currentConfig=()=>({
 ...DEFAULT_CONFIG,source,preset,grid:Number($('grid').value),fps:Number($('fps').value),
 resolution:$('resolution').value,bytesPerQR:Number($('bytesPerQR').value),
 fileSize:Number($('fileKiB').value)*1024,pattern:$('pattern').value,
 seed:Number($('seed').value),redundancy:Number($('redundancy').value),
 lossPercent:Number($('lossPercent').value),duplicateEvery:Number($('duplicateEvery').value),
 engine:$('engine').value,headless:$('headless').checked,
 repetitions:Number($('repetitions').value),warmups:Number($('warmups').value),
 timeoutMs:Number($('timeoutSec').value)*1000,
 regressionLimit:Number($('regressionLimit').value)
});
function showMessage(text,error=false){$('notice').textContent=text;$('notice').dataset.error=String(error);}
function showState(name,mode='ready'){$('runState').textContent=name;$('runState').dataset.state=mode;$('previewIndicator').textContent=name;}
function controls(){
 $('startBenchmark').disabled=busy;$('runMatrix').disabled=busy||source!=='synthetic';
 $('pauseBenchmark').disabled=!busy||paused;$('resumeBenchmark').disabled=!busy||!paused;
 $('cancelBenchmark').disabled=!busy;
}
function savePreferences(){
 try{localStorage.setItem(preferencesKey,JSON.stringify({config:currentConfig(),
   advanced:!$('advancedSettings').hidden}));}catch{}
}
function updatePreset(){
 const c=currentConfig();
 const found=Object.keys(PRESETS).find(p=>['grid','fps','bytesPerQR','redundancy']
  .every(k=>Number(c[k])===PRESETS[p][k]));
 preset=found||'custom';
 all('[data-preset]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.preset===preset)));
 const changing=c.grid>=8&&c.fps>=90? ' Bei hohen FPS werden nur vier QR-Kacheln pro Schritt aktualisiert.':
  ' Ziel-FPS sind keine gemessenen Display-FPS.';
 $('presetNotice').textContent=(PRESETS[preset]?.label||'Eigene Einstellungen')+
  ' · '+c.grid+' QR · '+c.fps+' FPS · '+c.bytesPerQR+' Bytes.'+changing;
 savePreferences();
}
function setPreset(name){
 if(name==='custom'){
  setView('advanced');$('bytesPerQR').focus({preventScroll:true});return;
 }
 const c=applyPreset(currentConfig(),name);
 $('grid').value=String(c.grid);$('fps').value=String(c.fps);
 $('bytesPerQR').value=String(c.bytesPerQR);$('redundancy').value=String(c.redundancy);
 updatePreset();
}
function setView(name){
 const expert=name==='advanced';$('advancedSettings').hidden=!expert;
 $('simpleMode').setAttribute('aria-pressed',String(!expert));
 $('advancedMode').setAttribute('aria-pressed',String(expert));
 savePreferences();
}
const sourceMessage={
 synthetic:'Echter QR-Turbo-V1/V2-Codec: FEC-Pakete erzeugen, rekonstruieren und die Originaldatei prüfen. Keine optische Kameramessung.',
 camera:'Echter Kamera-Scanner aus QR Turbo. Hardware-Fokus und Zoom sind hier bedienbar. Kamera-Messwerte werden noch nicht automatisch ins Lab übernommen.',
 video:'Originaler Videoimport für QR-Turbo-Aufzeichnungen. Die Decodierung erfolgt in der eingebetteten Originalanwendung.',
 screen:'Originaler Bildschirmempfänger mit Tab-/Fensteraufnahme. Browserfreigaben und Decoder bleiben unverändert.',
 stream:'Lokaler MediaStream mit tatsächlichen Vorschau-Frames. Kein Netzwerk-URL-Decoder und keine QR-Stream-Rekonstruktion.'
};
function setSource(value){
 if(busy)return;
 source=value;
 all('[data-source]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.source===value)));
 $('sourceExplanation').textContent=sourceMessage[value];
 $('appModeBadge').textContent={
  synthetic:'Synthetischer Codec-Test',camera:'Echte Kamera',video:'Lokale Videodatei',
  screen:'Bildschirmaufnahme',stream:'Lokaler MediaStream'
 }[value];
 const previewRoutes={synthetic:'../send/',camera:'../receive/',video:'../import/',screen:'../screen/'};
 $('toolFrame').hidden=value==='stream';$('streamWorkspace').hidden=value!=='stream';
 if(previewRoutes[value]&&$('toolFrame').getAttribute('src')!==previewRoutes[value])
  $('toolFrame').src=previewRoutes[value];
 $('previewLabel').textContent={synthetic:'Originaler QR-Turbo-Sender',camera:'Kamera-Studio',
  video:'Originaler Videoimport',screen:'Bildschirmempfänger',stream:'Lokaler Videostream'}[value];
 $('preparePreview').hidden=value!=='synthetic';
 $('previewHelp').querySelector('p').textContent=value==='synthetic'
  ?'Die Vorschau verwendet den originalen Sender. Der Codec-Test misst die Paketverarbeitung unabhängig vom sichtbaren QR-Bild.'
  :'Die originale QR-Turbo-Funktion bleibt in dieser Vorschau bedienbar. Ihre Hardwarewerte werden nicht als synthetischer Benchmark ausgegeben.';
 $('startBenchmark').textContent=value==='synthetic'?'Benchmark starten ↗':'Originalscanner verwenden ↗';
 controls();savePreferences();
}
function matrixOptions(){
 return Object.fromEntries([['grid','matrixGrids'],['fps','matrixFps'],['resolution','matrixRes']]
  .map(([key,id])=>[key,all('input:checked',$(id)).map(el=>key==='resolution'?el.value:Number(el.value))]));
}
function makeMatrix(){
 try{
  const c={...currentConfig(),source:'synthetic',engine:'cpu'},dimensions=matrixOptions();
  if(Object.values(dimensions).some(a=>!a.length))throw Error('Jede Matrix-Kategorie braucht mindestens eine Auswahl.');
  const matrix=createMatrix(c,dimensions,120);
  $('matrixCount').textContent=String(matrix.length*c.repetitions)+' Läufe';
  $('matrixRows').innerHTML=matrix.slice(0,80).map((r,i)=>'<tr><td>#'+
   String(i+1).padStart(3,'0')+'</td><td>'+r.grid+'</td><td>'+r.fps+'</td><td>'+
   esc(r.resolution)+'</td><td>CPU</td></tr>').join('')||'<tr><td colspan="5">Keine Läufe</td></tr>';
  if(matrix.length>80)$('matrixRows').insertAdjacentHTML('beforeend','<tr><td colspan="5">'+
   (matrix.length-80)+' weitere Kombinationen …</td></tr>');
  return matrix;
 }catch(e){
  $('matrixCount').textContent='Ungültige Matrix';
  $('matrixRows').innerHTML='<tr><td colspan="5">'+esc(e.message)+'</td></tr>';
  return null;
 }
}
function drawGraph(canvas,data,label){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const w=canvas.width,h=canvas.height,left=45,top=18,right=w-20,bottom=h-30;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1b17';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#315443';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const y=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
 const values=data.filter(Number.isFinite).slice(-90);
 ctx.fillStyle='#94af9b';ctx.font='12px sans-serif';
 if(!values.length){ctx.fillText('Keine Messdaten vorhanden',left+15,(top+bottom)/2);return;}
 const max=Math.max(.01,...values)*1.15;
 ctx.fillText(max.toFixed(2),3,top+10);ctx.fillText('0',30,bottom);
 ctx.strokeStyle='#c8f56f';ctx.lineWidth=2.5;ctx.beginPath();
 values.forEach((v,i)=>{
  const x=left+(i+.5)/values.length*(right-left);
  const y=bottom-(v/max)*(bottom-top);
  if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
 });ctx.stroke();ctx.fillStyle='#b7d3b6';ctx.fillText(label,left,bottom+19);
}
function progressLive(p,c){
 const elapsed=Math.max(1,p.elapsedMs||1);
 $('metricSymbols').textContent=String(p.generated||0);
 $('metricRecovery').textContent=String(p.solved||0)+' / '+String(p.required||'—');
 const fraction=(p.solved||0)/Math.max(1,p.required||1);
 $('runProgress').value=100*Math.min(1,fraction);
 $('runProgressPercent').textContent=Math.round($('runProgress').value)+' %';
 $('runProgressLabel').textContent=(completed+1)+' / '+activeQueue.length+
  ' · '+p.generated+' Pakete · '+(elapsed/1000).toFixed(2)+' s';
 const current=(p.generated*c.bytesPerQR)/(1024*1024)/(elapsed/1000);
 $('metricSpeed').textContent=number(current);
 if(!samples.length||Date.now()-samples[samples.length-1].at>120){
  samples.push({at:Date.now(),value:current});
  drawGraph($('liveChart'),samples.map(x=>x.value),'Codec MiB/s, vorläufig');
 }
}
function finishView(result){
 const m=result.metrics||{};
 $('metricSpeed').textContent=number(m.codecMiBs);
 $('metricSymbols').textContent=String(m.packets??'—');
 $('metricLatency').textContent=number(m.p95DecodeMs);
 $('metricRecovery').textContent=String(m.recoveredBlocks??0)+' / '+String(m.requiredBlocks??'—');
 $('runProgress').value=Math.round(100*(m.recoveredBlocks??0)/Math.max(1,m.requiredBlocks||1));
 $('runProgressPercent').textContent=Math.round($('runProgress').value)+' %';
 $('metricCaveat').textContent='Dateiintegrität: '+(m.sha256Verified?'SHA-256 / Bytevergleich bestanden':'nicht vollständig')+
  ' · Optischer Goodput, QR-Kamerafrequenz, CPU-/GPU-Auslastung: Nicht verfügbar.';
 showState(result.status==='erfolgreich'?'BESTANDEN':'FEHLGESCHLAGEN',result.status==='erfolgreich'?'ready':'failed');
}
function updateComparison(){
 const pick=[...selectedIds].map(id=>history.find(x=>x.id===id)).filter(Boolean);
 if(pick.length!==2){
  $('comparisonResult').textContent='Markiere zwei Läufe für den Vergleich.';
  drawGraph($('comparisonChart'),[],'');return;
 }
 pick.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const [before,after]=pick,result=compareRuns(after,before,Number($('regressionLimit').value)||15);
 if(!result.comparable)$('comparisonResult').textContent='Nicht vergleichbar wegen: '+
  result.differences.join(', ')+'.';
 else $('comparisonResult').textContent='Codec-Durchsatz '+(result.declinePercent>0?'-':'+')+
  number(Math.abs(result.declinePercent))+' % · '+(result.regression?'Regression erkannt.':'Keine Regression über dem Schwellenwert.');
 drawGraph($('comparisonChart'),[before.metrics?.codecMiBs,after.metrics?.codecMiBs],'Codec MiB/s: älter → neuer');
}
function renderHistory(){
 const sorted=[...history].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 $('resultCount').textContent=sorted.length+' Ergebnisse';
 const visible=sorted.filter(r=>selectedFilter==='all'||r.status===selectedFilter||
  selectedFilter==='wiederholt'&&r.attempt>0);
 $('resultRows').innerHTML=visible.slice(0,200).map(r=>{
  const c=r.config||{},m=r.metrics||{};
  return '<tr><td><input type="checkbox" data-id="'+esc(r.id)+'" aria-label="Lauf vergleichen" '+
   (selectedIds.has(r.id)?'checked':'')+'></td>'+
   '<td><b>'+esc(r.createdAt.replace('T',' ').slice(0,19))+'</b><br><small>'+esc(r.id.slice(0,12))+
   (r.attempt>0?' · Wiederholung '+r.attempt:'')+'</small></td>'+
   '<td>'+esc(c.grid??'—')+' / '+esc(c.fps??'—')+'</td>'+
   '<td>'+number(m.codecMiBs,3)+'</td><td>'+number(m.p95DecodeMs)+'</td>'+
   '<td>'+esc(m.duplicates??'—')+'</td><td>'+ratio(m.fecOverhead)+'</td>'+
   '<td><span class="status-text" data-ok="'+(r.status==='erfolgreich')+'">'+esc(r.status)+'</span></td></tr>';
 }).join('')||'<tr><td colspan="8">Keine Ergebnisse in dieser Kategorie.</td></tr>';
 all('#resultRows input[data-id]').forEach(el=>el.addEventListener('change',()=>{
  if(el.checked){selectedIds.add(el.dataset.id);if(selectedIds.size>2)selectedIds.delete([...selectedIds][0]);}
  else selectedIds.delete(el.dataset.id);
  renderHistory();
 }));
 updateComparison();
}
async function pauseGate(){
 while(paused&&!abortController.signal.aborted)await new Promise(resolve=>setTimeout(resolve,50));
 if(abortController.signal.aborted)throw new DOMException('Abgebrochen','AbortError');
}
async function execute(batch,{retry=false}={}){
 if(busy||source!=='synthetic')return;
 if(!H?.LTDecoder){showMessage('Der originale QR-Turbo-Codec ist nicht geladen.',true);return;}
 busy=true;paused=false;wasCancelled=false;abortController=new AbortController();
 samples=[];completed=0;const group=makeId(),expanded=[];
 for(const item of batch){
  const repeats=Number(item.repetitions)||1;
  for(let n=0;n<Number(item.warmups||0);n++)expanded.push({c:item,warmup:true,attempt:0});
  for(let n=0;n<repeats;n++)expanded.push({c:item,warmup:false,attempt:retry?n+1:n});
 }
 activeQueue=expanded;controls();showState('LÄUFT','running');
 showMessage('Codec-Benchmark läuft. Paketstatistiken werden wirklich gemessen.');
 let passed=0,failed=0,skipped=0;
 for(const item of expanded){
  if(abortController.signal.aborted){wasCancelled=true;break;}
  let c;
  try{c=validateConfig({...item.c,source:'synthetic'});}
  catch(e){
   skipped++;completed++;
   if(!item.warmup){
    const r={id:makeId(),createdAt:new Date().toISOString(),
     status:'übersprungen',error:e.message,config:item.c,group,attempt:item.attempt,
     version,source:'synthetic',executionType:'synthetischer Codec-End-to-End-Test',
     browser:env.browser,device:env.device,metrics:{}};
    await store.save(r);history=store.rows;renderHistory();
   }
   continue;
  }
  try{
   const r=await runCodecBenchmark(c,H,{
    signal:abortController.signal,gate:pauseGate,onProgress:p=>progressLive(p,c),
    version,environment:env
   });
   if(!item.warmup){
    r.group=group;r.attempt=item.attempt;
    await store.save(r);history=store.rows;renderHistory();
    r.status==='erfolgreich'?passed++:failed++;finishView(r);
   }
  }catch(e){
   if(e.name==='AbortError'){wasCancelled=true;break;}
   failed++;
   const r={id:makeId(),createdAt:new Date().toISOString(),status:'fehlgeschlagen',
    error:String(e.message||e),config:c,group,attempt:item.attempt,version,source:'synthetic',
    executionType:'synthetischer Codec-End-to-End-Test',browser:env.browser,device:env.device,metrics:{}};
   await store.save(r);history=store.rows;renderHistory();finishView(r);
   showMessage('Benchmark-Fehler: '+r.error,true);
  }
  completed++;
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 busy=false;paused=false;controls();
 showState(wasCancelled?'ABGEBROCHEN':failed?'MIT FEHLERN':'FERTIG',failed?'failed':'ready');
 showMessage('Fertig: '+passed+' erfolgreich · '+failed+' fehlgeschlagen · '+skipped+
  ' übersprungen'+(wasCancelled?' · manuell abgebrochen':'')+'.');
}
async function senderPreview(){
 $('previewInfo').textContent='Bereite echten QR-Sender vor …';
 try{
  const frame=$('toolFrame');
  if(!frame.contentWindow?.QRTurboOfflineFrames)await new Promise((resolve,reject)=>{
   frame.addEventListener('load',resolve,{once:true});
   setTimeout(()=>reject(Error('Der Sender benötigt zu lange.')),14000);
  });
  const w=frame.contentWindow,d=w.document;
  const file=d.getElementById('fileInput'),mode=d.getElementById('qrMode'),
   fps=d.getElementById('fps'),payload=d.getElementById('chunkSize'),
   prepare=d.getElementById('prepareBtn'),play=d.getElementById('playBtn');
  if(!file||!mode||!fps||!payload||!prepare)throw Error('Sender-Steuerung ist nicht verfügbar.');
  const c=currentConfig();
  mode.value=({1:'single',4:'quad',8:'octa',16:'hexadeca'})[c.grid];
  mode.dispatchEvent(new w.Event('change',{bubbles:true}));
  if(![...fps.options].some(x=>Number(x.value)===c.fps))
   throw Error(c.fps+' FPS sind im Live-Sender nicht verfügbar.');
  if(![...payload.options].some(x=>Number(x.value)===c.bytesPerQR))
   throw Error(c.bytesPerQR+' Bytes werden im Live-Sender nicht angeboten.');
  fps.value=String(c.fps);fps.dispatchEvent(new w.Event('change',{bubbles:true}));
  payload.value=String(c.bytesPerQR);payload.dispatchEvent(new w.Event('change',{bubbles:true}));
  const transfer=new w.DataTransfer();
  transfer.items.add(new w.File([deterministicBytes(1024,c.seed,c.pattern)],
   'benchmark-vorschau.bin',{type:'application/octet-stream'}));
  file.files=transfer.files;file.dispatchEvent(new w.Event('change',{bubbles:true}));
  const wait=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Die QR-Vorschau konnte nicht vorbereitet werden.')),22000);
   w.addEventListener('qr-turbo:prepared',()=>{clearTimeout(timer);resolve();},{once:true});
   w.addEventListener('qr-turbo:prepare-error',e=>{clearTimeout(timer);reject(Error(String(e.detail)));},{once:true});
  });
  prepare.click();await wait;
  if(play&&!play.disabled&&!/pause/i.test(play.textContent))play.click();
  $('previewInfo').textContent='Echte QR-Vorschau: '+c.grid+' QR · '+c.fps+' Ziel-FPS.';
 }catch(e){$('previewInfo').textContent='Vorschaufehler: '+String(e.message||e);}
}
async function stopStream(){
 if(stream)stream.getTracks().forEach(t=>t.stop());
 stream=null;$('streamVideo').srcObject=null;
 $('startStream').disabled=false;$('stopStream').disabled=true;
 $('streamMetrics').textContent='Stream gestoppt. Es wurden keine QR-Codes decodiert.';
}
async function startStream(){
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
  const video=$('streamVideo');video.srcObject=stream;
  $('startStream').disabled=true;$('stopStream').disabled=false;
  streamFrames=0;streamSince=performance.now();
  if('requestVideoFrameCallback' in video){
   const tick=()=>{
    if(!stream)return;
    streamFrames++;
    if(streamFrames%30===0)$('streamMetrics').textContent='Video-Frames: '+streamFrames+
     ' · gemessene Vorschau-FPS: '+number(streamFrames/((performance.now()-streamSince)/1000),1)+
     ' · QR-Decodierung: Nicht verfügbar';
    video.requestVideoFrameCallback(tick);
   };video.requestVideoFrameCallback(tick);
  }else $('streamMetrics').textContent='Stream läuft, aber die Browser-Framezählung ist nicht verfügbar.';
 }catch(e){showMessage('Lokaler Stream: '+e.message,true);}
}
function renderEnvironment(){
 const entries=[
 ['Browser',env.browser.split(' ').slice(-4).join(' ')],
 ['Prozessor-Threads',env.cores??'Nicht verfügbar'],
 ['WebCodecs',env.webCodecs?'API vorhanden':'Nicht verfügbar'],
 ['WebGPU',env.webGPU?'API vorhanden, kein GPU-Codec':'Nicht verfügbar'],
 ['Kamera',env.camera?'API vorhanden':'Nicht verfügbar'],
 ['Bildschirmaufnahme',env.screen?'API vorhanden':'Nicht verfügbar'],
 ['CPU-Auslastung','Nicht verfügbar'],['Thermische Drosselung','Nicht verfügbar']];
 $('environmentSummary').innerHTML=entries.map(([k,v])=>'<div><span>'+esc(k)+
  '</span><strong>'+esc(v)+'</strong></div>').join('');
 $('compatibility').innerHTML=entries.map(([k,v])=>'<p>'+esc(k)+': '+esc(v)+'</p>').join('');
}
function bindEvents(){
 all('[data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.preset)));
 $('simpleMode').addEventListener('click',()=>setView('simple'));
 $('advancedMode').addEventListener('click',()=>setView('advanced'));
 all('[data-source]').forEach(b=>b.addEventListener('click',()=>setSource(b.dataset.source)));
 all('#konfiguration input,#konfiguration select').forEach(el=>el.addEventListener('change',updatePreset));
 all('#matrix input').forEach(el=>el.addEventListener('change',makeMatrix));
 $('buildMatrix').addEventListener('click',makeMatrix);
 $('startBenchmark').addEventListener('click',()=>source==='synthetic'?void execute([currentConfig()]):$('toolFrame').focus());
 $('runMatrix').addEventListener('click',()=>{
  const matrix=makeMatrix();if(matrix)void execute(matrix);
 });
 $('retryFailures').addEventListener('click',()=>{
  const failed=history.filter(r=>r.status==='fehlgeschlagen'||r.status==='übersprungen').slice(-30);
  if(!failed.length){showMessage('Keine fehlgeschlagenen Läufe vorhanden.');return;}
  void execute(failed.map(r=>({...r.config,source:'synthetic',repetitions:1,warmups:0})),{retry:true});
 });
 $('pauseBenchmark').addEventListener('click',()=>{paused=true;controls();showState('PAUSIERT');});
 $('resumeBenchmark').addEventListener('click',()=>{paused=false;controls();showState('LÄUFT','running');});
 $('cancelBenchmark').addEventListener('click',()=>{abortController?.abort();paused=false;wasCancelled=true;});
 $('preparePreview').addEventListener('click',()=>void senderPreview());
 $('startStream').addEventListener('click',()=>void startStream());
 $('stopStream').addEventListener('click',()=>void stopStream());
 all('[data-filter]').forEach(b=>b.addEventListener('click',()=>{
  selectedFilter=b.dataset.filter;
  all('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  renderHistory();
 }));
 all('[data-export]').forEach(b=>b.addEventListener('click',()=>{
  try{exportRuns(b.dataset.export,history);}catch(e){showMessage(e.message,true);}
 }));
 $('clearResults').addEventListener('click',async()=>{
  if(!confirm('Alle lokal gespeicherten Benchmark-Ergebnisse löschen?'))return;
  await store.clear();history=store.rows;selectedIds.clear();renderHistory();
 });
 addEventListener('pagehide',()=>{if(stream)stream.getTracks().forEach(t=>t.stop());},{once:true});
}
async function main(){
 bindEvents();renderEnvironment();drawGraph($('liveChart'),[],'Codec MiB/s');
 drawGraph($('comparisonChart'),[],'');
 try{
  const info=await (await fetch('../build-info.json',{cache:'no-store'})).json();
  version=String(info.upstreamRef||'unbekannt');
  $('buildVersion').textContent=version.slice(0,14);
 }catch{$('buildVersion').textContent='Lokaler Build';}
 try{
  const prefs=JSON.parse(localStorage.getItem(preferencesKey)||'null');
  if(prefs?.config){
   const names={grid:'grid',fps:'fps',bytesPerQR:'bytesPerQR',fileSize:'fileKiB',
    pattern:'pattern',seed:'seed',redundancy:'redundancy',
    lossPercent:'lossPercent',duplicateEvery:'duplicateEvery',
    resolution:'resolution',engine:'engine',repetitions:'repetitions',
    warmups:'warmups',timeoutMs:'timeoutSec',regressionLimit:'regressionLimit'};
   for(const [key,id] of Object.entries(names)){
    const node=$(id);if(!node||prefs.config[key]===undefined)continue;
    let value=prefs.config[key];
    if(key==='fileSize')value=Math.max(1,Math.round(value/1024));
    if(key==='timeoutMs')value=Math.round(value/1000);
    if(node.options&&!Array.from(node.options).some(o=>o.value===String(value)))continue;
    node.value=String(value);
   }
   $('headless').checked=!!prefs.config.headless;
  }
  if(prefs?.advanced)setView('advanced');
 }catch{}
 updatePreset();setSource('synthetic');makeMatrix();
 store=await createStore();history=store.rows;renderHistory();
 if(!H?.LTDecoder)showMessage('QR-Turbo-Codec nicht geladen; automatische Tests können nicht starten.',true);
}
void main();
