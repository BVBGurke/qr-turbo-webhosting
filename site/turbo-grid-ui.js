/* QR Turbo V2 — explicit capability presets. Does not change decoder internals. */
(() => {
  'use strict';
  if(!document.body.classList.contains('oil-app'))return;
  const $=id=>document.getElementById(id);
  const mode=$('qrMode'),fps=$('fps'),payload=$('chunkSize');
  const info=$('turboProfileInfo');
  const profiles={
    safe:{mode:'single',fps:'24',bytes:'1465',name:'Reliable single QR'},
    quad:{mode:'quad',fps:'30',bytes:'1465',name:'Balanced four-code transfer'},
    octa:{mode:'octa',fps:'30',bytes:'1273',name:'Turbo V2 eight-code transfer'},
    hexadeca:{mode:'hexadeca',fps:'30',bytes:'1003',name:'Extreme sixteen-code transfer'},
    overdrive:{mode:'hexadeca',fps:'120',bytes:'1003',name:'Overdrive 16 QR / 120 FPS (experimental)'}
  };
  function selected(){return Object.entries(profiles).find(([,p])=>p.mode===mode?.value&&p.fps===fps?.value&&p.bytes===payload?.value)?.[0]||'';}
  function note(text){if(info)info.textContent=text;}
  function highlight(){
    const active=selected();
    for(const button of document.querySelectorAll('[data-turbo-profile]'))
      button.setAttribute('aria-pressed',String(button.dataset.turboProfile===active));
  }
  if(mode&&fps&&payload){
    for(const button of document.querySelectorAll('[data-turbo-profile]')){
      button.addEventListener('click',()=>{
        const p=profiles[button.dataset.turboProfile];
        if(!p)return;
        const playing=$('playBtn');
        if(playing&&/^pause$/i.test(playing.textContent.trim()))playing.click();
        mode.value=p.mode;
        mode.dispatchEvent(new Event('change',{bubbles:true}));
        const has=(el,v)=>[...el.options].some(option=>option.value===v);
        if(!has(fps,p.fps)||!has(payload,p.bytes)){
          note('Selected mode not available in this build.');return;
        }
        fps.value=p.fps;payload.value=p.bytes;
        fps.dispatchEvent(new Event('change',{bubbles:true}));
        payload.dispatchEvent(new Event('change',{bubbles:true}));
        highlight();
        note(p.name+' selected. '+(p.mode==='octa'||p.mode==='hexadeca'
          ?'Set your receiver to the matching QR grid. High FPS uses rotating groups of 4 QR codes. '
          :'')+'Prepare the QR stream after changing settings.');
      });
    }
    for(const el of [mode,fps,payload])el.addEventListener('change',highlight);
    highlight();
  }
})();
