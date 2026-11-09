/* QR Turbo Camera Studio
 * Capability-driven hardware controls. No server, no assumed phone-model mapping.
 * The BeamFerry decoder retains ownership of the MediaStream and scan lifecycle.
 */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  if(!$('video')||!$('cameraStudio'))return;
  const video=$('video'), status=$('cameraStudioStatus'), cameraSelect=$('cameraDevice'),
    map=$('cameraDeviceMap'), advanced=$('cameraAdvanced'),
    lensButtons=[...document.querySelectorAll('[data-lens]')],
    simple=$('cameraSimpleBtn'), expert=$('cameraAdvancedBtn'),
    zoom=$('cameraZoom'), zoomOutput=$('cameraZoomValue'),
    exposure=$('cameraExposure'), exposureOutput=$('cameraExposureValue'),
    focus=$('cameraFocusDistance'), focusOutput=$('cameraFocusValue'),
    focusMode=$('cameraFocusMode'), torch=$('cameraTorch'),
    quality=$('cameraQualityHint'), qualityLevel=$('cameraQualityLevel'),
    autoExposure=$('cameraAutoExposure'),
    flip=$('cameraFlip'), refocus=$('cameraRefocus'), focusMarker=$('cameraFocusMarker'),
    resolution=$('cameraActualResolution'), capabilitiesInfo=$('cameraCapabilityList');
  let track=null, devices=[], selectedId='', facing='environment', locked=false, torchOn=false,
    caps={}, settings={}, requestSerial=0;
  const knownRoles=[
    [/ultra[\s-]?wide|ultrawide|0[.,]5\s*[x×]|0[.,]6\s*[x×]|超广角/i,'ultra','Ultra-wide'],
    [/telephoto|periscope|optical.?zoom|tele.?camera|长焦/i,'tele','Telephoto'],
    [/macro|微距/i,'macro','Macro'],
    [/front|facing.?front|selfie|facetime|user.?facing|前置/i,'front','Front'],
    [/back|rear|environment|world|后置/i,'back','Rear']
  ];
  function cameraRole(label=''){
    for(const [regexp,id,name] of knownRoles)if(regexp.test(label))return {id,name};
    return {id:'unknown',name:'Camera'};
  }
  function readableName(device,index){
    const label=(device?.label||'').trim();
    const role=cameraRole(label);
    if(!label)return 'Camera '+(index+1)+' (permission needed)';
    // Keep hardware's actual label visible: don't claim a specific optical lens
    // simply from enumeration order or a browser-assigned index.
    return role.id==='unknown'?label:role.name+' · '+label;
  }
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const hasRange=x=>x&&Number.isFinite(x.min)&&Number.isFinite(x.max)&&x.max>x.min;
  const inRange=(range,n)=>clamp(n,range.min,range.max);
  function note(message,warning=false){
    status.textContent=message;
    status.dataset.warning=String(warning);
  }
  function disable(el,reason){
    if(!el)return;
    el.disabled=true;el.title=reason;
  }
  function enable(el){if(el){el.disabled=false;el.removeAttribute('title');}}
  function setView(mode){
    const advancedVisible=mode==='advanced';
    advanced.hidden=!advancedVisible;
    simple.setAttribute('aria-pressed',String(!advancedVisible));
    expert.setAttribute('aria-pressed',String(advancedVisible));
    document.body.classList.toggle('camera-advanced-mode',advancedVisible);
    try{localStorage.setItem('qrt-camera-view',mode);}catch{}
  }
  simple.addEventListener('click',()=>setView('simple'));
  expert.addEventListener('click',()=>setView('advanced'));
  try{setView(localStorage.getItem('qrt-camera-view')==='advanced'?'advanced':'simple');}catch{setView('simple');}

  async function listCameras(){
    if(!navigator.mediaDevices?.enumerateDevices) {
      note('Your browser cannot list cameras. Default camera access may still work.',true);
      return [];
    }
    const serial=++requestSerial;
    try{
      const all=await navigator.mediaDevices.enumerateDevices();
      if(serial!==requestSerial)return devices;
      devices=all.filter(d=>d.kind==='videoinput');
      const current=track?.getSettings?.().deviceId||selectedId;
      cameraSelect.replaceChildren();
      if(!devices.length){
        cameraSelect.add(new Option('Camera access unavailable',''));
        cameraSelect.disabled=true;
      } else {
        devices.forEach((device,i)=>cameraSelect.add(new Option(readableName(device,i),device.deviceId)));
        const found=devices.find(d=>d.deviceId===current);
        cameraSelect.value=found?.deviceId||devices[0].deviceId;
        cameraSelect.disabled=false;
      }
      updateMap();
      updateLensButtons();
      return devices;
    }catch(err){
      note('Camera list unavailable: '+(err?.message||'permission denied'),true);
      return [];
    }
  }
  function updateMap(){
    map.replaceChildren();
    const desc=document.createElement('p');
    desc.textContent='Device names come from your browser after permission. Lens roles are inferred only when the camera label identifies them; unknown lenses are not guessed.';
    map.append(desc);
    for(let i=0;i<devices.length;i++){
      const d=devices[i],role=cameraRole(d.label);
      const row=document.createElement('div');row.className='camera-map-entry';
      const title=document.createElement('strong');title.textContent=readableName(d,i);
      const sub=document.createElement('small');
      sub.textContent='Detected type: '+(role.id==='unknown'?'Not identified':role.name)+
        (d.deviceId===(track?.getSettings?.().deviceId||selectedId)?' · Active':'');
      row.append(title,sub);map.append(row);
    }
  }
  function currentCapabilities(){
    if(!track||track.readyState!=='live')return {};
    try{return track.getCapabilities?.()||{};}catch{return {};}
  }
  function updateCapabilities(){
    caps=currentCapabilities();
    settings=track?.getSettings?.()||{};
    const zoomCap=hasRange(caps.zoom);
    if(zoomCap){
      zoom.min=String(caps.zoom.min);zoom.max=String(caps.zoom.max);
      zoom.step=String(caps.zoom.step||.1);
      zoom.value=String(inRange(caps.zoom,Number(settings.zoom)||1));
      enable(zoom);
      zoomOutput.textContent=Number(zoom.value).toFixed(1)+'×';
    }else{disable(zoom,'This camera does not expose hardware zoom.');zoomOutput.textContent='Unavailable';}
    const expose=hasRange(caps.exposureCompensation);
    if(autoExposure){autoExposure.disabled=!expose;if(!expose)autoExposure.checked=false;}
    if(expose){
      exposure.min=String(caps.exposureCompensation.min);
      exposure.max=String(caps.exposureCompensation.max);
      exposure.step=String(caps.exposureCompensation.step||.1);
      exposure.value=String(inRange(caps.exposureCompensation,Number(settings.exposureCompensation)||0));
      enable(exposure);
      exposureOutput.textContent=Number(exposure.value).toFixed(1)+' EV';
    }else{disable(exposure,'No hardware exposure compensation is provided by this browser.');exposureOutput.textContent='Unavailable';}
    if(hasRange(caps.focusDistance) && Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')){
      focus.min=String(caps.focusDistance.min);focus.max=String(caps.focusDistance.max);
      focus.step=String(caps.focusDistance.step||.05);
      focus.value=String(inRange(caps.focusDistance,Number(settings.focusDistance)||caps.focusDistance.min));
      enable(focus);focusOutput.textContent=Number(focus.value).toFixed(2);
    }else{disable(focus,'Manual focus distance is not exposed by this camera.');focusOutput.textContent='Unavailable';}
    focusMode.replaceChildren();
    const available=Array.isArray(caps.focusMode)?caps.focusMode:[];
    if(available.includes('continuous'))focusMode.add(new Option('Continuous autofocus','continuous'));
    if(available.includes('single-shot'))focusMode.add(new Option('Single-shot autofocus','single-shot'));
    if(available.includes('manual'))focusMode.add(new Option('Manual focus','manual'));
    if(!focusMode.options.length)focusMode.add(new Option('Automatic (browser controlled)',''));
    focusMode.value=available.includes(settings.focusMode)?settings.focusMode:focusMode.options[0].value;
    focusMode.disabled=!available.length;
    const canTorch=caps.torch===true||(Array.isArray(caps.torch)&&caps.torch.includes(true));
    if(canTorch)enable(torch);
    else {torchOn=false;torch.setAttribute('aria-pressed','false');disable(torch,'Torch is not supported by the current camera/browser.');}
    const width=settings.width||video.videoWidth||0,height=settings.height||video.videoHeight||0;
    resolution.textContent=width&&height?width+' × '+height+' · '+(Math.round(settings.frameRate)||'?')+' FPS':'Waiting for video';
    capabilitiesInfo.textContent=[
      'Zoom: '+(zoomCap?'hardware':'unavailable'),
      'Focus: '+(available.length?available.join(', '):'browser controlled'),
      'Exposure: '+(expose?'adjustable':'unavailable'),
      'Torch: '+(canTorch?'available':'unavailable')
    ].join(' · ');
    updateLensButtons();
    updateMap();
  }
  function updateLensButtons(){
    const roleOf=d=>cameraRole(d.label).id;
    const ultrawide=devices.find(d=>roleOf(d)==='ultra');
    const tele=devices.find(d=>roleOf(d)==='tele');
    const currentRole=cameraRole(devices.find(d=>d.deviceId===settings.deviceId)?.label||'').id;
    const z=hasRange(caps.zoom)?caps.zoom:null;
    for(const button of lensButtons){
      const lens=button.dataset.lens;
      const possible=lens==='1'||(lens==='0.5' && (ultrawide||z?.min<=.5))||
        (lens==='2' && (tele||z?.max>=2));
      button.disabled=!possible;
      if(!possible)button.title=lens==='0.5'?'No ultra-wide camera or 0.5× hardware zoom detected':
        '2× not supported by the current camera or available lenses';
      else button.removeAttribute('title');
      const active=lens==='0.5'?currentRole==='ultra'||
          (z?.min<=.5&&Math.abs((settings.zoom||1)-.5)<.1):
        lens==='2'?currentRole==='tele'||Math.abs((settings.zoom||1)-2)<.1:
          currentRole!=='ultra'&&currentRole!=='tele'&&Math.abs((settings.zoom||1)-1)<.15;
      button.setAttribute('aria-pressed',String(!!active));
    }
  }
  let updating=Promise.resolve();
  async function applyAdvanced(value){
    if(!track||track.readyState!=='live') {note('Start scanning to adjust camera hardware.',true);return false;}
    const target=track;
    updating=updating.catch(()=>{}).then(async()=>{
      if(target.readyState!=='live')return false;
      try{
        await target.applyConstraints({advanced:[value]});
        const applied=target.getSettings?.()||{};
        if('torch' in value&&typeof applied.torch==='boolean'&&applied.torch!==value.torch){
          if(target===track)note('Camera ignored the torch request.',true);
          return false;
        }
        if(target===track){settings=applied;updateCapabilities();note('Camera settings updated.');}
        return true;
      }catch(e){
        if(target===track)note('This camera rejected the setting: '+(e.message||e.name||'unsupported'),true);
        return false;
      }
    });
    return updating;
  }
  zoom.addEventListener('change',()=>void applyAdvanced({zoom:Number(zoom.value)}));
  zoom.addEventListener('input',()=>zoomOutput.textContent=Number(zoom.value).toFixed(1)+'×');
  exposure.addEventListener('change',()=>{if(autoExposure)autoExposure.checked=false;void applyAdvanced({exposureCompensation:Number(exposure.value)});});
  exposure.addEventListener('input',()=>exposureOutput.textContent=Number(exposure.value).toFixed(1)+' EV');
  focus.addEventListener('change',()=>void applyAdvanced({focusMode:'manual',focusDistance:Number(focus.value)}));
  focus.addEventListener('input',()=>focusOutput.textContent=Number(focus.value).toFixed(2));
  focusMode.addEventListener('change',()=>{
    if(focusMode.value)void applyAdvanced({focusMode:focusMode.value});
  });
  torch.addEventListener('click',async()=>{
    if(torch.disabled)return;
    const wanted=!torchOn;
    if(await applyAdvanced({torch:wanted})){
      torchOn=wanted;torch.setAttribute('aria-pressed',String(wanted));
      torch.textContent=wanted?'Flashlight on':'Flashlight';
    }
  });
  async function selectDevice(id){
    selectedId=id||'';
    if(window.QRTurboCameraBridge?.isRunning()){
      locked=true;
      note('Switching camera…');
      try{
        await window.QRTurboCameraBridge.switch();
      }catch(e){note('Could not switch camera: '+(e.message||'device unavailable'),true);}
      finally{locked=false;}
    }else note('Camera selected. Press Start scanning to open it.');
  }
  cameraSelect.addEventListener('change',()=>void selectDevice(cameraSelect.value));
  flip.addEventListener('click',async()=>{
    if(locked)return;
    const active=devices.find(d=>d.deviceId===(track?.getSettings?.().deviceId||selectedId));
    const activeRole=cameraRole(active?.label||'').id;
    const toFront=activeRole!=='front' && facing==='environment';
    const target=devices.find(d=>cameraRole(d.label).id===(toFront?'front':'back'));
    facing=toFront?'user':'environment';
    selectedId=target?.deviceId||'';
    if(window.QRTurboCameraBridge?.isRunning())await selectDevice(selectedId);
    else note('Camera preference: '+(toFront?'front':'rear')+'. Press Start scanning.');
  });
  lensButtons.forEach(button=>button.addEventListener('click',async()=>{
    if(button.disabled||locked)return;
    const value=Number(button.dataset.lens),role=value===.5?'ultra':value===2?'tele':'back';
    const candidate=devices.find(d=>cameraRole(d.label).id===role);
    if(candidate && candidate.deviceId!==(track?.getSettings?.().deviceId||selectedId)){
      await selectDevice(candidate.deviceId);
      return;
    }
    const range=caps.zoom;
    if(hasRange(range)&&value>=range.min&&value<=range.max){
      await applyAdvanced({zoom:value});
      return;
    }
    if(value===1 && candidate)note('Standard camera selected.');
    else note('This optical zoom setting is not available with the selected camera.',true);
  }));
  refocus.addEventListener('click',()=>{
    const modes=caps.focusMode||[];
    if(modes.includes('continuous'))void applyAdvanced({focusMode:'continuous'});
    else if(modes.includes('single-shot'))void applyAdvanced({focusMode:'single-shot'});
    else note('Focus is automatic and managed by your browser.');
  });
  video.addEventListener('pointerdown',async e=>{
    if(!track||video.readyState<2)return;
    const rect=video.getBoundingClientRect();
    const x=clamp((e.clientX-rect.left)/rect.width,0,1);
    const y=clamp((e.clientY-rect.top)/rect.height,0,1);
    focusMarker.style.left=(x*100)+'%';focusMarker.style.top=(y*100)+'%';
    focusMarker.hidden=false;
    focusMarker.classList.remove('camera-focus-pulse');
    void focusMarker.offsetWidth;
    focusMarker.classList.add('camera-focus-pulse');
    setTimeout(()=>focusMarker.hidden=true,900);
    if('pointsOfInterest' in caps && (caps.focusMode||[]).includes('single-shot')){
      await applyAdvanced({focusMode:'single-shot',pointsOfInterest:[{x,y}]});
    }else if((caps.focusMode||[]).includes('continuous')){
      await applyAdvanced({focusMode:'continuous'});
      note('Autofocus active. This browser does not expose precise tap-to-focus.');
    }else note('Tap-to-focus is not supported here; hold the QR codes steady.',true);
  });
  $('cameraRefreshDevices')?.addEventListener('click',()=>void listCameras());
  $('cameraResetControls')?.addEventListener('click',async()=>{
    if(!track)return;
    const values=[];
    if((caps.focusMode||[]).includes('continuous'))values.push({focusMode:'continuous'});
    if(hasRange(caps.zoom))values.push({zoom:inRange(caps.zoom,1)});
    if(hasRange(caps.exposureCompensation))values.push({exposureCompensation:inRange(caps.exposureCompensation,0)});
    if(caps.torch===true)values.push({torch:false});
    for(const v of values)await applyAdvanced(v);
    torchOn=false;torch.setAttribute('aria-pressed','false');torch.textContent='Flashlight';
    note('Camera controls reset.');
  });
  // The scanner's existing FPS and grid controls retain their original IDs.
  const advancedFps=$('cameraAdvancedFps');
  for(const selector of ['.turbo-grid-picker','.fps-switch']){
    const el=document.querySelector('main.app > .actions '+selector);
    if(el&&advancedFps)advancedFps.append(el);
  }
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>void listCameras());
  async function request(media){
    try{return await navigator.mediaDevices.getUserMedia(media);}
    catch(e){
      if(!media?.video?.deviceId?.exact||!['OverconstrainedError','NotFoundError','NotReadableError'].includes(e?.name))throw e;
      selectedId='';
      const fallback={...media.video};
      delete fallback.deviceId;
      fallback.facingMode={ideal:facing};
      note('Preferred lens unavailable. Trying another camera.');
      return navigator.mediaDevices.getUserMedia({...media,video:fallback});
    }
  }
  function constraints(base){
    const c={...base};
    if(selectedId){delete c.facingMode;c.deviceId={exact:selectedId};}
    else c.facingMode={ideal:facing};
    return c;
  }
  function onTrack(next){
    track=next||null;torchOn=false;
    if(track){
      facing=track.getSettings?.().facingMode||facing;
      settings=track.getSettings?.()||{};
      if(settings.deviceId)selectedId=settings.deviceId;
      updateCapabilities();
      void listCameras();
      note('Camera active · '+(settings.width||'?')+' × '+(settings.height||'?')+
        '. Keep the full QR pattern inside the frame.');
    }
  }
  function onStop(){
    track=null;caps={};settings={};torchOn=false;
    torch.textContent='Flashlight';torch.setAttribute('aria-pressed','false');
    disable(torch,'Start scanning to use flashlight.');
    disable(zoom,'Start scanning to adjust zoom.');
    disable(exposure,'Start scanning to adjust exposure.');
    disable(focus,'Start scanning to adjust focus.');
    resolution.textContent='Camera off';
    quality.textContent='Start scanning for local image assessment.';
    qualityLevel.textContent='Image: waiting';qualityLevel.dataset.quality='idle';
    lensButtons.forEach(b=>{if(b.dataset.lens!=='1')b.disabled=true;});
    note('Camera off. Choose a camera and press Start scanning.');
  }
  function onError(err){
    const name=err?.name||'';
    note(name==='NotAllowedError'?'Camera permission denied. Allow camera access in your browser settings.':
      name==='NotFoundError'?'No camera detected. Connect a camera or select another device.':
      name==='OverconstrainedError'?'Camera setting unsupported. Choose another camera or lower the requested FPS.':
      'Camera error: '+(err?.message||name||'Unavailable'),true);
  }

  // Sample a 160x90 camera frame once per second; QR decoding stays unchanged.
  // The exposure assistant is opt-in and uses real hardware constraints only.
  const qCanvas=document.createElement('canvas');qCanvas.width=160;qCanvas.height=90;
  const qCtx=qCanvas.getContext('2d',{alpha:false,willReadFrequently:true});
  let qState='idle',qCount=0,lastExposureAdjust=0;
  function qualityTick(){
    if(document.hidden||!qCtx||!track||track.readyState!=='live'||video.readyState<2)return;
    try{
      qCtx.drawImage(video,0,0,160,90);
      const data=qCtx.getImageData(0,0,160,90).data;
      let sum=0,detail=0,n=0;
      for(let y=6;y<84;y+=3)for(let x=6;x<154;x+=3){
        const i=4*(y*160+x);
        const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
        const right=.2126*data[i+4]+.7152*data[i+5]+.0722*data[i+6];
        sum+=lum;detail+=Math.abs(lum-right);n++;
      }
      const mean=sum/n,edge=detail/n;
      const state=mean<58?'dark':mean>218?'bright':edge<6?'soft':'good';
      qCount=state===qState?qCount+1:1;qState=state;
      qualityLevel.dataset.quality=state;
      qualityLevel.textContent={dark:'Image: dark',bright:'Image: too bright',
        soft:'Image: low detail',good:'Image: readable'}[state];
      if(qCount===1)quality.textContent={
        dark:'Image looks dark. Add light, enable a flashlight or increase exposure.',
        bright:'Image looks too bright. Reduce glare or lower exposure.',
        soft:'Image has little detail. Move closer, hold steady and refocus.',
        good:'Usable brightness and detail. Keep the complete QR grid in view.'
      }[state];
      if(autoExposure?.checked&&hasRange(caps.exposureCompensation)&&qCount>=4&&
         (state==='dark'||state==='bright')&&Date.now()-lastExposureAdjust>6500){
        lastExposureAdjust=Date.now();
        const range=caps.exposureCompensation,current=Number(track.getSettings?.().exposureCompensation)||0;
        const next=clamp(current+(state==='dark'?1:-1)*Math.max(.2,range.step||.1),range.min,range.max);
        if(Math.abs(next-current)>.01)void applyAdvanced({exposureCompensation:next});
      }
    }catch{
      quality.textContent='Image analysis not available in this browser.';
      qualityLevel.textContent='Image analysis unavailable';
      qualityLevel.dataset.quality='unknown';
    }
  }
  setInterval(qualityTick,1000);

  window.QRTurboCamera={
    constraints,request,onTrack,onStop,onError,listCameras,cameraRole,readableName,
    get state(){return {selectedId,facing,devices:devices.map(d=>({label:d.label,role:cameraRole(d.label).id})),settings,caps};}
  };
  disable(torch,'Start scanning first.');disable(zoom,'Start scanning first.');
  disable(exposure,'Start scanning first.');disable(focus,'Start scanning first.');
  note('Camera ready. Tap Start scanning to grant access.');
  void listCameras();
})();
