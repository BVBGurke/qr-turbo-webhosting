/* QR Turbo video export: offline WebCodecs, no realtime MediaRecorder.
 * Files, packetization, WebM muxing and downloading run entirely locally.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('exportEncodedPreview');
  const picker = $('fileInput');
  const record = $('exportRecord');
  const cancel = $('exportStop');
  const prepare = $('prepareBtn');
  const play = $('playBtn');
  const preset = $('exportPreset');
  const durationSelect = $('exportDuration');
  const modulesSelect = $('exportModulePx');
  const bitrateInput = $('exportBitrate');
  const visible = $('exportPreview');
  const previewToggle = $('exportTogglePreview');
  const previewState = $('exportPreviewState');
  const stage = $('encodedPreviewStage');
  const placeholder = $('exportPreviewPlaceholder');
  const progress = $('exportProgress');
  const estimate = $('exportEstimatedSize');
  const status = $('exportStatus');
  const link = $('exportDownload');
  if(!canvas || !picker || !record || !prepare || !preset) return;

  const previewCtx = canvas.getContext('2d', {alpha:false});
  if(!previewCtx) return;
  const gpuToggle = $('exportUseGPU');
  const headlessToggle = $('exportHeadless');
  const engineInfo = $('exportEngineInfo');
  const rendererControls = [gpuToggle,headlessToggle];
  const lockableControls = () => [gpuToggle,headlessToggle,preset,durationSelect,modulesSelect,bitrateInput,
    $('exportLayout'),$('exportFPS'),$('exportPayload'),picker,visible,previewToggle].filter(Boolean);
  function updateEngineInfo() {
    if(!gpuToggle || !headlessToggle)return;
    if(!gpuToggle.checked)headlessToggle.checked=true;
    if(!active)headlessToggle.disabled=!gpuToggle.checked;
    if(engineInfo)engineInfo.textContent = !gpuToggle.checked
      ? 'CPU/software encoding requested · headless rendering. WebCodecs hardware usage is determined by your browser and cannot be guaranteed.'
      : headlessToggle.checked
        ? 'GPU preferred · offscreen rendering. No preview overhead; hardware usage depends on your browser.'
        : 'GPU preferred · preview updates only a few times per second. Export remains offline.';
  }
  gpuToggle?.addEventListener('change',()=>{updateEngineInfo();showPreview();});
  headlessToggle?.addEventListener('change',()=>{updateEngineInfo();showPreview();});
  const profiles = Object.freeze({
    tiny:{mode:'single',bytes:1003,fps:10,px:2,kbps:260,redundancy:3.6},
    compact:{mode:'single',bytes:1003,fps:12,px:3,kbps:700,redundancy:3.0},
    balanced:{mode:'quad',bytes:1003,fps:12,px:3,kbps:2200,redundancy:2.8},
    fast:{mode:'quad',bytes:1465,fps:20,px:4,kbps:6000,redundancy:2.6},
    grid8:{mode:'octa',bytes:1003,fps:24,px:2,kbps:6500,redundancy:2.5},
    grid16:{mode:'hexadeca',bytes:1003,fps:20,px:3,kbps:12000,redundancy:2.8},
    grid16x120:{mode:'hexadeca',bytes:1003,fps:120,px:3,kbps:24000,redundancy:3.0}
  });
  const BYTES = n => n >= 1048576 ? (n/1048576).toFixed(2)+' MiB' : n >= 1024 ? (n/1024).toFixed(1)+' KiB' : Math.floor(n)+' B';
  const tiles = new WeakMap();
  const QUIET = 4;
  const MAX_FRAMES=120000; // 15 minutes at up to 120 FPS; long exports need substantial browser memory.
  const MODE_PIXELS={single:[1,1],dual:[2,2],quad:[2,2],octa:[4,2],hexadeca:[4,4]};
  let active=false, controller=null, linkUrl=null, meta=null, lastFrame=null, generationStart=0;
  let savedPreparingDisabled=false;
  let renderCanvas=null,renderCtx=null,renderedPatterns=[];
  let lockedGpu=true,lockedHeadless=true;
  let lastPreviewFrame=-1;
  const setText = t => {if(status)status.textContent=t;};
  const setState = t => {if(previewState)previewState.textContent=t;};
  const yieldUI = () => new Promise(resolve => setTimeout(resolve,0));
  function selectedSettings() {
    let p = profiles[preset.value] || profiles.compact;
    if(preset.value==='custom') {
      p = {mode:['single','dual','quad','octa','hexadeca'].includes($('exportLayout')?.value) ? $('exportLayout').value : 'quad',
        bytes:Number($('exportPayload')?.value)||1003,
        fps:Number($('exportFPS')?.value)||30,
        px:3,kbps:($('exportLayout')?.value==='hexadeca'?24000:6000),redundancy:3.0};
    }
    const px = Math.max(2,Math.min(5,Number(modulesSelect?.value)||p.px));
    const kbps = Math.max(160,Math.min(80000,Number(bitrateInput?.value)||p.kbps));
    return {...p,px,kbps};
  }
  function updateProfile() {
    const p=profiles[preset.value];
    const custom=$('exportCustomSettings');
    if(custom)custom.hidden=preset.value!=='custom';
    if(p){if(modulesSelect)modulesSelect.value=String(p.px);if(bitrateInput)bitrateInput.value=String(p.kbps);}
    if(preset.value==='custom'){
      const mode=$('exportLayout')?.value;
      if(mode==='hexadeca' && bitrateInput && Number(bitrateInput.value)<15000)bitrateInput.value='24000';
    }
    updateEstimate();
  }
  function estimatedSeconds(m,p) {
    const files=Array.from(picker.files||[]);
    const total=files.reduce((n,f)=>n+f.size,0);
    const packets= m?.k || (files.length ? Math.ceil((total+512)/Math.max(1,p.bytes-(p.mode==='octa'||p.mode==='hexadeca'?24:20))) : 0);
    if(!packets)return null;
    const count=({single:1,dual:2,quad:4,octa:8,hexadeca:16})[p.mode] || 1;
    const codesPerFrame = p.fps>60&&count>=8?4:p.fps>60&&count===4?2:count===2&&p.fps<50?1:count;
    return Math.max(12,Math.ceil((packets*p.redundancy)/(p.fps*codesPerFrame) + 5));
  }
  function updateEstimate() {
    const p=selectedSettings();
    const calculated=estimatedSeconds(meta,p);
    const seconds=durationSelect?.value==='auto' ? calculated : Number(durationSelect?.value);
    const count=lastFrame?.find(Boolean)?.count || (p.bytes<=1003?105:p.bytes<=1273?117:p.bytes<=1465?125:149);
    const [columns,rows]=MODE_PIXELS[p.mode]||[1,1];
    const width=(count+QUIET*2)*p.px*columns;
    const height=(count+QUIET*2)*p.px*rows;
    const size=seconds ? BYTES(seconds*p.kbps*1000/8):'—';
    if(estimate)estimate.textContent=width+' × '+height+' pixels · '+p.fps+' FPS · '+p.kbps+' kbps target · '+
      (seconds?seconds+' seconds':'select a file')+' · estimated '+size+
      ' · generated locally, without realtime recording';
    return {settings:p,seconds,calculated,width,height};
  }
  function tile(pattern) {
    let image=tiles.get(pattern);
    if(image)return image;
    const side=pattern.count+2*QUIET;
    image=document.createElement('canvas');image.width=image.height=side;
    const context=image.getContext('2d',{alpha:false});
    const pixels=context.createImageData(side,side);
    pixels.data.fill(255);
    for(let y=0;y<pattern.count;y++)for(let x=0;x<pattern.count;x++){
      if(!pattern.dark[y*pattern.count+x])continue;
      const pos=((y+QUIET)*side+x+QUIET)*4;
      pixels.data[pos]=pixels.data[pos+1]=pixels.data[pos+2]=0;
    }
    context.putImageData(pixels,0,0);
    tiles.set(pattern,image);
    return image;
  }
  function paint(patterns,p,frameIndex=0) {
    const first=patterns?.find(Boolean);
    if(!first)throw Error('No QR frames generated');
    lastFrame=patterns;
    const cols=patterns.length>=8?4:patterns.length>=4?2:1;
    const rows=patterns.length===8?2:patterns.length===4?2:cols;
    const tileSide=(first.count+QUIET*2)*p.px;
    const width=tileSide*cols,height=tileSide*rows;
    const evenWidth=width+(width%2),evenHeight=height+(height%2);
    const resize=!renderCanvas||renderCanvas.width!==evenWidth||renderCanvas.height!==evenHeight;
    if(resize){
      // Prefer a detached OffscreenCanvas; nothing is painted into the visible UI during headless export.
      renderCanvas=typeof OffscreenCanvas==='function'
        ? new OffscreenCanvas(evenWidth,evenHeight)
        : document.createElement('canvas');
      renderCanvas.width=evenWidth;renderCanvas.height=evenHeight;
      renderCtx=renderCanvas.getContext('2d',{alpha:false,willReadFrequently:!lockedGpu});
      if(!renderCtx)throw Error('Could not create an offline drawing surface');
      renderCtx.imageSmoothingEnabled=false;
      renderCtx.fillStyle='#fff';renderCtx.fillRect(0,0,evenWidth,evenHeight);
      renderedPatterns=Array(patterns.length).fill(null);
    }
    // Dirty-tile rendering avoids redrawing twelve unchanged codes in 16 QR / 120 FPS mode.
    for(let i=0;i<patterns.length;i++){
      const item=patterns[i];if(item===renderedPatterns[i])continue;
      const x=(i%cols)*tileSide,y=Math.floor(i/cols)*tileSide;
      renderCtx.fillStyle='#fff';renderCtx.fillRect(x,y,tileSide,tileSide);
      if(item)renderCtx.drawImage(tile(item),x,y,tileSide,tileSide);
      renderedPatterns[i]=item;
    }
    const show=!lockedHeadless && !!visible?.checked;
    // UI preview is throttled to ~3 FPS; the WebCodecs source still receives every QR frame.
    if(show && (frameIndex===0 || frameIndex-lastPreviewFrame>=Math.max(1,Math.ceil(p.fps/3)))){
      if(canvas.width!==evenWidth||canvas.height!==evenHeight){
        canvas.width=evenWidth;canvas.height=evenHeight;
      }
      previewCtx.imageSmoothingEnabled=false;
      previewCtx.drawImage(renderCanvas,0,0,evenWidth,evenHeight);
      lastPreviewFrame=frameIndex;
      if(placeholder)placeholder.hidden=true;
    }
    return renderCanvas;
  }
  function showPreview() {
    const show=!!visible?.checked && !(active?lockedHeadless:!!headlessToggle?.checked);
    stage?.classList.toggle('preview-hidden',!show);
    if(previewToggle){previewToggle.textContent=show?'Hide preview':'Show preview';previewToggle.setAttribute('aria-pressed',String(show));}
  }
  visible?.addEventListener('change',showPreview);
  previewToggle?.addEventListener('click',()=>{visible.checked=!visible.checked;if(visible.checked&&headlessToggle&&!active&&gpuToggle?.checked)headlessToggle.checked=false;updateEngineInfo();showPreview();});
  const presetButtons=[...document.querySelectorAll('[data-video-preset]')];
  const advanced=$('exportAdvancedSettings');
  const presetSummary=$('exportPresetSummary');
  function syncPresetButtons(){
    presetButtons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.videoPreset===preset.value)));
    const p=selectedSettings();
    const tiles=({single:1,dual:2,quad:4,octa:8,hexadeca:16})[p.mode]||1;
    if(presetSummary)presetSummary.textContent=(preset.value==='custom'?'Custom':'Preset: '+preset.value)+
      ' · '+tiles+' QR codes · '+p.fps+' FPS · '+p.bytes+' bytes per QR'+
      (p.fps>60?' · experimental':'')+'.';
  }
  presetButtons.forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.videoPreset;
    if(id==='custom'&&preset.value!=='custom'){
      const p=selectedSettings();
      const layout=$('exportLayout'),fps=$('exportFPS'),payload=$('exportPayload');
      if(layout)layout.value=p.mode;
      if(fps)fps.value=String(p.fps);
      if(payload)payload.value=String(p.bytes);
    }
    preset.value=id;
    preset.dispatchEvent(new Event('change',{bubbles:true}));
    if(advanced)advanced.open=id==='custom';
    if(id==='custom')$('exportLayout')?.focus({preventScroll:true});
  }));
  preset.addEventListener('change',()=>{updateProfile();syncPresetButtons();});
  for(const el of [$('exportLayout'),$('exportFPS'),$('exportPayload')])
    el?.addEventListener('change',syncPresetButtons);
  modulesSelect?.addEventListener('change',updateEstimate);
  bitrateInput?.addEventListener('input',updateEstimate);
  durationSelect?.addEventListener('change',updateEstimate);
  for(const id of ['exportLayout','exportFPS','exportPayload'])$(id)?.addEventListener('change',updateEstimate);
  $('exportLayout')?.addEventListener('change',()=>{
    const mode=$('exportLayout').value;
    if(bitrateInput && mode==='hexadeca' && Number(bitrateInput.value)<15000)bitrateInput.value='24000';
    updateEstimate();
  });
  picker.addEventListener('change',()=>{
    meta=null;lastFrame=null;
    if(linkUrl){URL.revokeObjectURL(linkUrl);linkUrl=null;}
    link.hidden=true;progress.value=0;
    setText(picker.files?.length?'File selected. Choose video quality and create your video.':'Select a file to get started.');
    updateEstimate();
  });
  updateEngineInfo();showPreview();updateProfile();syncPresetButtons();
  record.textContent='Create and download video';
  if(cancel)cancel.textContent='Cancel generation';

  function applySender(p) {
    const qrMode=$('qrMode'),fps=$('fps'),chunkSize=$('chunkSize');
    if(!qrMode || !fps || !chunkSize)throw Error('Sender settings are unavailable');
    qrMode.value=p.mode;
    qrMode.dispatchEvent(new Event('change',{bubbles:true}));
    fps.value=String(p.fps);
    chunkSize.value=String(p.bytes);
    if(fps.value!==String(p.fps)||chunkSize.value!==String(p.bytes)) {
      throw Error('This QR layout / FPS / payload combination is not supported.');
    }
    fps.dispatchEvent(new Event('change',{bubbles:true}));
    chunkSize.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function prepareSequence(signal) {
    return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{clearTimeout(timer);window.removeEventListener('qr-turbo:prepared',ready);window.removeEventListener('qr-turbo:prepare-error',failed);signal.removeEventListener('abort',aborted);};
      const finish=(error,info)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(info);};
      const ready=e=>finish(null,e.detail);
      const failed=e=>finish(new Error(String(e.detail||'Could not prepare QR frames')));
      const aborted=()=>finish(new DOMException('Export cancelled','AbortError'));
      const timer=setTimeout(()=>finish(new Error('QR preparation timed out')),90000);
      window.addEventListener('qr-turbo:prepared',ready);
      window.addEventListener('qr-turbo:prepare-error',failed);
      signal.addEventListener('abort',aborted,{once:true});
      prepare.disabled=false;
      prepare.click();
    });
  }
  async function encoderConfig(width,height,options,preferGPU) {
    if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined'){
      throw Error('Offline video export requires WebCodecs. Use current Chrome or Edge on HTTPS.');
    }
    // Hardware preference is not a hard requirement: headless Chrome and some
    // phones only provide software codecs for specific dimensions/FPS.
    const choices=preferGPU?['prefer-hardware','prefer-software','no-preference']:['prefer-software','no-preference'];
    for(const preference of choices)for(const [codec,id] of [['vp8','vp8'],['vp09.00.10.08','vp9']]){
      const config={codec,width,height,bitrate:options.kbps*1000,
        framerate:options.fps,latencyMode:'realtime'};
      if(preference!=='no-preference')config.hardwareAcceleration=preference;
      try {
        const result=await VideoEncoder.isConfigSupported(config);
        if(result.supported)return {...result.config,webmCodec:id};
      }catch{}
    }
    throw Error('No supported WebCodecs VP8/VP9 encoder for '+width+' × '+height+' at '+options.fps+
      ' FPS. Try fewer QR codes, smaller QR modules, or a lower FPS preset.');
  }
  function safeName(name){
    return String(name||'transfer').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65)||'transfer';
  }
  async function createVideo() {
    if(active)return;
    if(!picker.files?.length){setText('Choose a file first.');return;}
    if(typeof window.QRTurboOfflineFrames!=='function'){
      setText('Offline export is unavailable. Refresh the page and try again.');return;
    }
    if(!('isSecureContext' in window)||!window.isSecureContext){
      setText('WebCodecs requires HTTPS or localhost.');return;
    }
    active=true;
    controller=new AbortController();
    const {signal}=controller;
    record.disabled=true;cancel.disabled=false;link.hidden=true;
    lockedGpu=!!gpuToggle?.checked;
    lockedHeadless=!lockedGpu||!!headlessToggle?.checked;
    // Lock the GPU/CPU decision and all export settings for this run.
    const lockedInputs=lockableControls().map(el=>({el,wasDisabled:el.disabled}));
    for(const {el} of lockedInputs)el.disabled=true;
    $('exportEngineSettings')?.classList.add('is-locked');
    showPreview();
    if(linkUrl){URL.revokeObjectURL(linkUrl);linkUrl=null;}
    setState('Preparing');
    progress.value=0;
    window.dispatchEvent(new CustomEvent('qr-turbo:video-start'));
    let encoder=null;
    const originallyDisabled=prepare.disabled;
    try {
      if(play && /^pause$/i.test(play.textContent.trim()))play.click();
      meta=null;lastFrame=null;renderCanvas=null;renderCtx=null;renderedPatterns=[];lastPreviewFrame=-1;
      const desired=selectedSettings();
      applySender(desired);
      setText('Packing your file and preparing QR codes…');
      meta=await prepareSequence(signal);
      if(signal.aborted)throw new DOMException('Export cancelled','AbortError');
      prepare.disabled=true;
      const estimateInfo=updateEstimate();
      const p=selectedSettings();
      const seconds=estimateInfo.seconds;
      if(!seconds||!Number.isFinite(seconds)||seconds>900)throw Error('Invalid video duration. Limit: 15 minutes.');
      const codeCount=({single:1,dual:2,quad:4,octa:8,hexadeca:16})[p.mode]||1;
      const coverage=p.fps>60&&codeCount>=8?4:p.fps>60&&codeCount===4?2:codeCount===2&&p.fps<50?1:codeCount;
      const minSeconds=Math.ceil(meta.k/(p.fps*coverage))+1;
      if(seconds<minSeconds)throw Error('Video duration is too short to include the whole file. Choose Auto or a longer duration.');
      const frames=Math.ceil(seconds*p.fps);
      if(frames>MAX_FRAMES)throw Error('This export requires too many frames. Reduce FPS or video duration.');
      const generator=window.QRTurboOfflineFrames(frames,{signal});
      const first=await generator.next();
      if(first.done)throw Error('No QR frames produced');
      const source=paint(first.value.patterns,p,0);
      const config=await encoderConfig(source.width,source.height,p,lockedGpu);
      const {WebMWriter}=await import(new URL('../webm-writer.js',location.href).href);
      const muxer=new WebMWriter({width:source.width,height:source.height,fps:p.fps,codec:config.webmCodec,duration:frames/p.fps});
      let encodeError=null;
      encoder=new VideoEncoder({
        output:chunk=>{try{muxer.add(chunk);}catch(error){encodeError=error;}},
        error:error=>{encodeError=error;}
      });
      const {webmCodec,...actualConfig}=config;
      encoder.configure(actualConfig);
      setState(lockedGpu?'Encoding · GPU preferred':'Encoding · software preferred');
      generationStart=performance.now();
      let done=0;
      const pushFrame=async item=>{
        if(signal.aborted)throw new DOMException('Export cancelled','AbortError');
        if(encodeError)throw encodeError;
        if(done>0)paint(item.patterns,p,done);
        const timestamp=Math.round(done*1_000_000/p.fps);
        const frame=new VideoFrame(renderCanvas,{timestamp,duration:Math.round(1_000_000/p.fps)});
        try{encoder.encode(frame,{keyFrame:done%(p.fps*5)===0});}finally{frame.close();}
        done++;
        // Keep a bounded codec queue, without a full encoder.flush() every 20 frames.
        let spins=0;
        while(encoder.encodeQueueSize>12){
          if(signal.aborted)throw new DOMException('Export cancelled','AbortError');
          if(encodeError)throw encodeError;
          await new Promise(resolve=>setTimeout(resolve,0));
          if(++spins>64){await encoder.flush();break;}
        }
        if(done%12===0||done===frames){
          progress.value=done/frames*100;
          const elapsed=Math.max(.001,(performance.now()-generationStart)/1000);
          setText('Encoding QR frames locally: '+done.toLocaleString('en-US')+' / '+frames.toLocaleString('en-US')+
            ' ('+Math.round(done/frames*100)+'%) · '+Math.round(done/elapsed)+' frames/sec');
          if(done%48===0)await yieldUI();
        }
      };
      await pushFrame(first.value);
      for await(const item of generator)await pushFrame(item);
      if(signal.aborted)throw new DOMException('Export cancelled','AbortError');
      setState('Finalizing');
      setText('Finalizing WebM container and seek points…');
      await encoder.flush();
      if(encodeError)throw encodeError;
      encoder.close();encoder=null;
      const blob=muxer.finish();
      linkUrl=URL.createObjectURL(blob);
      link.href=linkUrl;
      link.download='qr-turbo-'+safeName(meta.name)+'.webm';
      link.textContent='Download QR video · '+BYTES(blob.size);
      link.hidden=false;
      progress.value=100;
      window.dispatchEvent(new CustomEvent('qr-turbo:video-ready', {
        detail:{url:linkUrl,name:link.download,size:blob.size,tiles:codeCount,
          fps:p.fps,duration:frames/p.fps}
      }));
      // Keep the explicit link if the browser blocks a programmatic download.
      try{link.click();}catch{}
      setState('Ready to download');
      const wall=((performance.now()-generationStart)/1000).toFixed(1);
      setText('Video ready · '+BYTES(blob.size)+' · '+frames.toLocaleString('en-US')+' frames generated in '+wall+
        ' seconds. Test the file with Import Video before sharing.');
    }catch(error){
      window.dispatchEvent(new CustomEvent('qr-turbo:video-error', {
        detail:{message:error?.message||String(error)}
      }));
      if(error?.name==='AbortError'){setState('Cancelled');setText('Video generation cancelled.');}
      else {setState('Error');setText('Could not create video: '+(error?.message||String(error)));}
    }finally{
      try{encoder?.close();}catch{}
      prepare.disabled=originallyDisabled;
      active=false;record.disabled=false;cancel.disabled=true;controller=null;
      for(const {el,wasDisabled} of lockedInputs)el.disabled=wasDisabled;
      $('exportEngineSettings')?.classList.remove('is-locked');
      renderCanvas=null;renderCtx=null;renderedPatterns=[];
      updateEngineInfo();showPreview();
    }
  }
  record.addEventListener('click',()=>{void createVideo();});
  cancel?.addEventListener('click',()=>controller?.abort());
  window.addEventListener('pagehide',()=>{controller?.abort();if(linkUrl)URL.revokeObjectURL(linkUrl);});
})();
