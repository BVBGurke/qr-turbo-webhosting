/* QR Turbo Camera Viewer V2
 * Full sensor-frame preview, native fullscreen with an iOS-compatible fallback,
 * receiver-aware transport controls and QR hit overlays.
 * It does NOT replace the original WASM binary QR decoder.
 */
(() => {
 'use strict';
 const stage=document.querySelector('main.app .camera-card');
 const video=document.getElementById('video');
 const status=document.getElementById('status');
 const start=document.getElementById('startBtn');
 const stop=document.getElementById('stopBtn');
 if(!stage||!video||!start||!stop)return;
 stage.id='cameraStage';
 stage.setAttribute('aria-label','Live camera preview · full sensor image');
 video.setAttribute('aria-label','Live camera video');
 video.setAttribute('playsinline','');
 video.setAttribute('autoplay','');
 video.muted=true;
 let cssFullscreen=false,scanHits=0,lastHit=0,renderFrameCount=0,lastFpsAt=0,actualFps=0,
   screenshot=null,rafId=0,readingFrames=false;
 const nativeFullscreen=()=>document.fullscreenElement===stage ||
   document.webkitFullscreenElement===stage;
 const fullscreen=()=>nativeFullscreen()||cssFullscreen;
 const elt=(tag,cls,label)=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(label)e.textContent=label;return e;
 };
 const controls=elt('div','camera-stage-ui');
 const top=elt('div','camera-stage-ui__top');
 const live=elt('div','camera-stage-ui__live');
 const pulse=elt('span','camera-live-dot');
 pulse.setAttribute('aria-hidden','true');
 const liveText=elt('span','','LIVE CAMERA');
 const detail=elt('span','camera-stage-details','Kamera bereit');
 live.append(pulse,liveText,detail);
 const button=(id,title,icon)=>{
  const b=elt('button','camera-stage-btn',icon);
  b.type='button';b.id=id;b.title=title;b.setAttribute('aria-label',title);
  return b;
 };
 const full=button('cameraFullscreen','Show full camera view','⛶ Vollbild');
 full.setAttribute('aria-pressed','false');
 const right=elt('div','camera-stage-ui__top-right');
 right.append(full);
 top.append(live,right);
 const bottom=elt('div','camera-stage-ui__bottom');
 const liveStats=elt('div','camera-stage-ui__stats');
 const statText=elt('span','', 'Noch keine QR-Daten');
 liveStats.append(statText);
 const actions=elt('div','camera-stage-ui__actions');
 const actionStart=button('cameraOverlayStart','Start or stop the QR scanner','Scan starten');
 const actionFlip=button('cameraOverlayFlip','Switch between front and rear camera','⇄');
 const actionFocus=button('cameraOverlayFocus','Restore autofocus','AF');
 const actionTorch=button('cameraOverlayTorch','Turn flashlight on or off','Licht');
 actions.append(actionStart,actionFlip,actionFocus,actionTorch);
 bottom.append(liveStats,actions);
 controls.append(top,bottom);
 const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
 overlay.id='cameraDetectionOverlay';overlay.setAttribute('class','camera-detection-overlay');
 overlay.setAttribute('viewBox','0 0 1 1');overlay.setAttribute('preserveAspectRatio','xMidYMid meet');
 overlay.setAttribute('aria-hidden','true');
 stage.append(overlay,controls);
 function syncActions(){
  const running=!!window.QRTurboCameraBridge?.isRunning?.();
  actionStart.textContent=running?'Scan stoppen':'Scan starten';
  actionStart.setAttribute('aria-label',running?'Stop scanning':'Start scanning');
  actionStart.disabled=running?stop.disabled:start.disabled;
  const torch=document.getElementById('cameraTorch');
  actionTorch.disabled=!torch||torch.disabled;
  actionTorch.setAttribute('aria-pressed',torch?.getAttribute('aria-pressed')||'false');
  const refocus=document.getElementById('cameraRefocus');
  actionFocus.disabled=!running||!!refocus?.disabled;
 }
 function updateDetails(){
  const bridge=window.QRTurboCameraBridge;
  const track=bridge?.track?.();
  const settings=track?.getSettings?.()||{};
  if(bridge?.isRunning?.()){
   const w=settings.width||video.videoWidth,h=settings.height||video.videoHeight;
   const fps=Math.round(actualFps)||Math.round(settings.frameRate)||0;
   detail.textContent=(w&&h?w+'×'+h:'Kamera aktiv')+(fps?' · '+fps+' FPS':'');
   liveText.textContent='LIVE · SCANNING';
   pulse.classList.add('active');
  }else{
   detail.textContent='Kamera aus';
   liveText.textContent='KAMERA BEREIT';
   pulse.classList.remove('active');
  }
  const progress=document.getElementById('progressText')?.textContent?.trim()||'';
  const text=status?.textContent?.trim()||'';
  statText.textContent=(progress&&progress!=='0%'?progress+' · ':'')+
    (text.slice(0,105)||'Warte auf QR-Signal')+
    (scanHits?' · Treffer: '+scanHits:'');
  if(lastHit&&performance.now()-lastHit>1100){
   overlay.replaceChildren();lastHit=0;
  }
  syncActions();
 }
 async function enterFullscreen(){
  if(fullscreen())return;
  // Safari on iPhone does not consistently allow fullscreen on arbitrary elements.
  // CSS fallback keeps QR indicators and camera controls available.
  try{
   if(stage.requestFullscreen){
    await stage.requestFullscreen({navigationUI:'hide'});
    if(nativeFullscreen()){applyFullscreen(true);return;}
   }
  }catch{}
  cssFullscreen=true;applyFullscreen(true);
 }
 async function exitFullscreen(){
  if(nativeFullscreen()){
   try{await (document.exitFullscreen?.()||document.webkitExitFullscreen?.());}catch{}
  }
  cssFullscreen=false;applyFullscreen(false);
 }
 function applyFullscreen(active){
  stage.classList.toggle('camera-stage--fullscreen',active);
  document.body.classList.toggle('camera-fullscreen-mode',active);
  document.documentElement.classList.toggle('camera-fullscreen-scrolllock',active);
  full.textContent=active?'⤢ Schließen':'⛶ Vollbild';
  full.setAttribute('aria-label',active?'Close fullscreen camera':'Open fullscreen camera');
  full.setAttribute('aria-pressed',String(active));
  if(active){full.focus({preventScroll:true});}
 }
 full.addEventListener('click',()=>void(fullscreen()?exitFullscreen():enterFullscreen()));
 const syncFullscreen=()=>{
  // Only disable CSS scroll-lock when both full-screen implementations are off.
  const active=nativeFullscreen()||cssFullscreen;
  applyFullscreen(active);
 };
 document.addEventListener('fullscreenchange',syncFullscreen);
 document.addEventListener('webkitfullscreenchange',syncFullscreen);
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&cssFullscreen)void exitFullscreen();
 });
 actionStart.addEventListener('click',()=>{const running=window.QRTurboCameraBridge?.isRunning?.();
  (running?stop:start).click();});
 actionFlip.addEventListener('click',()=>document.getElementById('cameraFlip')?.click());
 actionFocus.addEventListener('click',()=>document.getElementById('cameraRefocus')?.click());
 actionTorch.addEventListener('click',()=>document.getElementById('cameraTorch')?.click());
 start.addEventListener('click',()=>{scanHits=0;lastHit=0;overlay.replaceChildren();});
 function fromVideoCoords(hit){
  const w=Number(hit.videoWidth)||video.videoWidth,h=Number(hit.videoHeight)||video.videoHeight;
  if(!(w>0&&h>0)||!Array.isArray(hit.corners)||hit.corners.length<3)return null;
  const path=hit.corners.map(p=>({x:Number(p.x),y:Number(p.y)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(path.length<3)return null;
  return {w,h,path};
 }
 let lastOverlayAt=0;
 window.addEventListener('qr-turbo:scan-hit',e=>{
  const data=e.detail||{},hits=Array.isArray(data.hits)?data.hits:[];
  if(!hits.length)return;
  scanHits+=hits.length;lastHit=performance.now();
  if(lastHit-lastOverlayAt<90)return;
  lastOverlayAt=lastHit;
  const w=video.videoWidth,h=video.videoHeight;
  if(!(w>0&&h>0))return;
  overlay.setAttribute('viewBox','0 0 '+w+' '+h);
  overlay.replaceChildren();
  for(const hit of hits.slice(0,16)){
   const p=fromVideoCoords(hit);if(!p)continue;
   const polygon=document.createElementNS('http://www.w3.org/2000/svg','polygon');
   polygon.setAttribute('points',p.path.map(pt=>pt.x+','+pt.y).join(' '));
   polygon.setAttribute('class','camera-detection-box');
   polygon.setAttribute('vector-effect','non-scaling-stroke');
   overlay.append(polygon);
  }
 });
 let frameObserverActive=false;
 function countCameraFrames(){
  if(frameObserverActive)return;frameObserverActive=true;
  const measure=(time,metadata)=>{
   if(!document.getElementById('cameraStage')){frameObserverActive=false;return;}
   if(video.readyState>=2&&window.QRTurboCameraBridge?.isRunning?.()){
    renderFrameCount++;
    if(!lastFpsAt)lastFpsAt=time;
    if(time-lastFpsAt>=1000){
     actualFps=renderFrameCount/Math.max((time-lastFpsAt)/1000,.001);
     renderFrameCount=0;lastFpsAt=time;
    }
   }else{actualFps=0;renderFrameCount=0;lastFpsAt=0;}
   video.requestVideoFrameCallback(measure);
  };
  if(typeof video.requestVideoFrameCallback==='function')video.requestVideoFrameCallback(measure);
  else frameObserverActive=false;
 }
 countCameraFrames();
 // Visible when users scan; does not copy or upload video frames.
 const poll=setInterval(updateDetails,380);
 window.addEventListener('pagehide',()=>{clearInterval(poll);},{once:true});
 updateDetails();
 window.QRTurboCameraViewer={
  enter:enterFullscreen,exit:exitFullscreen,
  get active(){return fullscreen();},
  get lastFps(){return actualFps;},
  get hits(){return scanHits;}
 };
})();
