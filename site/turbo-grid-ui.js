/* QR Turbo — tap-to-configure Live presets; Advanced settings expose every field. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const mode=$('qrMode'),fps=$('fps'),bytes=$('chunkSize'),info=$('turboProfileInfo');
  if(!mode||!fps||!bytes||!info)return;
  const advanced=$('liveAdvancedSettings')||document.querySelector('.turbo-advanced');
  const presets={
    safe:{mode:'single',fps:'24',bytes:'1465',label:'Reliable'},
    quad:{mode:'quad',fps:'30',bytes:'1465',label:'Balanced'},
    octa:{mode:'octa',fps:'30',bytes:'1273',label:'Turbo'},
    hexadeca:{mode:'hexadeca',fps:'30',bytes:'1003',label:'Extreme'},
    overdrive:{mode:'hexadeca',fps:'120',bytes:'1003',label:'Overdrive'}
  };
  const buttons=[...document.querySelectorAll('[data-turbo-profile]')];
  const custom=document.querySelector('[data-turbo-custom]');
  const summary=(p)=>p.mode==='hexadeca'?'16 QR':p.mode==='octa'?'8 QR':p.mode==='quad'?'4 QR':p.mode==='dual'?'2 QR':'1 QR';
  const current=()=>({mode:mode.value,fps:fps.value,bytes:bytes.value});
  const currentKey=()=>{
    const p=current();
    return Object.keys(presets).find(k=>['mode','fps','bytes'].every(key=>presets[k][key]===p[key]))||'custom';
  };
  function highlight(message){
    const active=currentKey();
    buttons.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.turboProfile===active)));
    custom?.setAttribute('aria-pressed',String(active==='custom'));
    const p=current();
    const selected=presets[active];
    info.textContent=message||(selected?selected.label+' selected · ':'Custom · ')+
      summary(p)+' / '+p.fps+' FPS / '+p.bytes+' bytes per QR. '+
      (p.mode==='hexadeca'||p.mode==='octa'?'Set your receiver to the matching QR grid. ':'')+
      'Press Prepare QR stream after changing settings.';
  }
  function choose(key){
    const p=presets[key];if(!p)return;
    const play=$('playBtn');
    if(play && /^pause$/i.test(play.textContent.trim()))play.click();
    // Let the sender rebuild its supported options first.
    mode.value=p.mode;
    mode.dispatchEvent(new Event('change',{bubbles:true}));
    if(![...fps.options].some(o=>o.value===p.fps)||
       ![...bytes.options].some(o=>o.value===p.bytes)){
      highlight('This preset is unavailable in the current build.');return;
    }
    fps.value=p.fps;fps.dispatchEvent(new Event('change',{bubbles:true}));
    bytes.value=p.bytes;bytes.dispatchEvent(new Event('change',{bubbles:true}));
    if(advanced)advanced.open=false;
    highlight();
  }
  buttons.forEach(btn=>btn.addEventListener('click',()=>choose(btn.dataset.turboProfile)));
  custom?.addEventListener('click',()=>{
    if(advanced){
      advanced.open=true;
      mode.focus({preventScroll:true});
      advanced.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
    }
    highlight('Advanced settings opened · choose layout, FPS and bytes per QR, then prepare the stream.');
  });
  [mode,fps,bytes].forEach(el=>el.addEventListener('change',()=>highlight()));
  highlight();
})();
