/* Monitor verified downloads from the existing QR Turbo camera/screen/video receiver.
 * Collects only genuinely completed original-scanner sessions.
 * Does not infer camera FPS, QR detector success, GPU/CPU percentage or a sender hash.
 */
import {makeId} from './benchmark-core.mjs';
const $=id=>document.getElementById(id);
const safeText=el=>String(el?.textContent||'').trim();
const number=x=>Number.isFinite(x)?x:null;
export function createReceiverMonitor({getSource,getConfig,getVersion,getEnvironment,onResult,onProgress,onNotice}){
 const frame=$('toolFrame');
 let observer=null,armed=false,startedAt=0,completedUrl=null,lastDocument=null;
 function reset(){observer?.disconnect();observer=null;startedAt=0;completedUrl=null;lastDocument=null;}
 function arm(){
  const src=getSource();
  if(!['camera','screen','video'].includes(src))return false;
  armed=true;reset();attach();
  onNotice('Empfangsmessung aktiviert: Starte den originalen Scanner im Vorschaufenster. Ein Ergebnis wird erst nach vollständigem Download gespeichert.');
  return true;
 }
 function detach(){armed=false;reset();}
 async function completed(doc){
  if(!armed||!startedAt||doc!==lastDocument)return;
  const result=doc.getElementById('result'),anchor=doc.getElementById('download');
  if(!result||result.hidden||!anchor?.href.startsWith('blob:')||anchor.href===completedUrl)return;
  completedUrl=anchor.href;
  try{
   const res=await fetch(anchor.href);
   if(!res.ok)throw Error('Blob-Daten konnten nicht gelesen werden.');
   const bytes=new Uint8Array(await res.arrayBuffer());
   if(!bytes.length)throw Error('Die wiederhergestellte Datei ist leer.');
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   const now=performance.now();
   const durationMs=Math.max(1,now-startedAt);
   const info=safeText(doc.getElementById('resultInfo'));
   const verifiedSha=/SHA-256/i.test(info);
   const verifiedCrc=/CRC[\s-]?32/i.test(info);
   // In the original receiver, result.hidden becomes false only after its own
   // SHA-256 (V2) or CRC-32 (V1) success, not after a mere symbol detection.
   const data={
    id:makeId(),createdAt:new Date().toISOString(),status:'erfolgreich',
    source:getSource(),executionType:getSource()==='video'?
      'Realer Dateidecode aus Video':'Realer optischer Empfängerlauf',
    browser:getEnvironment().browser,device:getEnvironment().device,
    version:getVersion(),config:{...getConfig(),source:getSource()},
    metrics:{
     elapsedMs:durationMs,codecMiBs:null,
     goodputMiBs:(bytes.length/(1024*1024))/(durationMs/1000),
     opticalGoodputType:getSource()==='video'?'Videodecoder-Durchsatz':'Empfangsgoodput inklusive Aufnahmevorbereitung',
     fileBytes:bytes.length,outputSHA256:hash,
     sha256Verified:verifiedSha,crc32Verified:verifiedCrc,
     frames:null,renderedFPS:null,qrDecodeFPS:null,
     meanDecodeMs:null,p95DecodeMs:null,p99DecodeMs:null,
     packets:null,duplicates:null,requiredBlocks:null,recoveredBlocks:null,
     fecOverhead:null,cpuPercent:null,gpuPercent:null,thermalThrottling:null
    },
    notes:[
     'Das Originalempfänger-UI hat eine vollständige Datei bereitgestellt.',
     verifiedSha?'Die Originalanwendung meldet SHA-256-Verifikation.':
       verifiedCrc?'Die Originalanwendung meldet CRC-32-Verifikation.':
       'Prüfsummenstatus aus dem UI nicht sicher auslesbar.',
     'Der zusätzlich berechnete SHA-256-Fingerabdruck ist keine unabhängige Prüfung gegen eine Sender-Referenz.',
     'Empfangszeit beginnt beim Klick auf Start und umfasst gegebenenfalls Kamera-/Capture-Startaufwand.'
    ]
   };
   await onResult(data);
   onNotice('Empfang abgeschlossen: '+anchor.download+' · '+bytes.length+' Bytes · '+
     (verifiedSha?'SHA-256 durch Empfänger bestätigt':verifiedCrc?'CRC-32 durch Empfänger bestätigt':'Hash berechnet, keine Senderreferenz')+'.');
   armed=false;reset();
  }catch(e){
   onNotice('Der Empfänger meldet eine Datei, aber die Überprüfung im Lab ist fehlgeschlagen: '+String(e.message||e));
  }
 }
 function attach(){
  if(!armed)return;
  let doc;
  try{doc=frame.contentDocument;}catch{return;}
  if(!doc?.getElementById('result'))return;
  if(doc===lastDocument&&observer)return;
  reset();lastDocument=doc;
  const start=()=>{startedAt=performance.now();completedUrl=null;
    onNotice('Live-Empfang gestartet. Warte auf Dateirekonstruktion …');};
  // This event listener lives only as long as the iframe document; do not
  // replace or interfere with the scanner's own handlers.
  for(const id of ['startBtn','videoImportStart'])doc.getElementById(id)?.addEventListener('click',start);
  observer=new MutationObserver(()=>{
   const progress=safeText(doc.getElementById('progressText'));
   if(progress && startedAt)onProgress(progress);
   void completed(doc);
  });
  const result=doc.getElementById('result'),link=doc.getElementById('download');
  if(result)observer.observe(result,{attributes:true,attributeFilter:['hidden']});
  if(link)observer.observe(link,{attributes:true,attributeFilter:['href','download']});
  const progress=doc.getElementById('progressText');
  if(progress)observer.observe(progress,{childList:true,subtree:true});
 }
 frame.addEventListener('load',()=>{if(armed)attach();});
 return {arm,detach,get armed(){return armed;}};
}
