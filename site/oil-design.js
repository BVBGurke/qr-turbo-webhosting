/* QR Turbo: shared accessible navigation, illustrated optical transfer, user flows. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const route = location.pathname.replace(/\/+$/, '').split('/').pop();
  const save = (key,value) => { try { sessionStorage.setItem(key,value); } catch {} };
  const load = (key) => { try { return sessionStorage.getItem(key); } catch { return null; } };

  if (document.body.classList.contains('oil-home')) {
    // Four matrix illustrations, not an actual transfer or encoded file.
    const qrNodes = [...document.querySelectorAll('canvas[data-oil-qr]')];
    function pattern(seed) {
      return (x,y) => {
        const finder = (cx,cy) => {
          const dx=x-cx,dy=y-cy;
          if (dx>=0 && dx<7 && dy>=0 && dy<7) {
            return dx===0||dy===0||dx===6||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4);
          }
          return null;
        };
        for (const [cx,cy] of [[0,0],[18,0],[0,18]]) {
          const v=finder(cx,cy);
          if(v!==null)return v;
          if(x>=cx-1&&x<=cx+7&&y>=cy-1&&y<=cy+7)return false;
        }
        let n=((x*9781+y*6271+seed*8999) ^ ((x+seed)*173+(y*367))) >>> 0;
        n=Math.imul(n^n>>>15,2246822519)>>>0;
        return (n&3)===0 || (n&7)===2;
      };
    }
    function draw(seed) {
      qrNodes.forEach((node,i)=>{
        const ctx=node.getContext('2d',{alpha:false});
        const n=25,cell=Math.floor(node.width/n);
        ctx.fillStyle='#fff';ctx.fillRect(0,0,node.width,node.height);
        const dark=pattern(seed+i*17);
        ctx.fillStyle='#0c1a17';
        for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(dark(x,y))ctx.fillRect(x*cell,y*cell,cell,cell);
      });
    }
    if(qrNodes.length){
      draw(7);
      const reduce=matchMedia('(prefers-reduced-motion: reduce)');
      let timer=null;
      const change=()=>{if(timer)clearInterval(timer);if(!reduce.matches)timer=setInterval(()=>draw(Math.floor(Date.now()/1600)),1600);};
      change();reduce.addEventListener?.('change',change);
      document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(timer);timer=null;}else change();});
    }
  }
  if (document.body.classList.contains('oil-app')) {
    const status=$('statusText')||$('status');
    if(status){status.setAttribute('role','status');status.setAttribute('aria-live','polite');}
  }
  if(route==='send' && document.body.classList.contains('oil-app')) {
    const live=$('oilModeLive'), video=$('oilModeVideo');
    const info=$('oilModeHint');
    const play=$('playBtn'),rec=$('exportRecord'),stop=$('exportStop');
    const file=$('fileInput');
    if(!live||!video)return;
    let mode='live';
    const setMode=(next,quiet=false)=>{
      if(next==='live'&&stop&&!stop.disabled){if(info)info.textContent='Finish your video export before switching to live transmission.';return;}
      if(next==='video'&&play&&/^pause$/i.test(play.textContent.trim()))play.click();
      mode=next==='video'?'video':'live';
      document.body.classList.toggle('oil-mode-live',mode==='live');
      document.body.classList.toggle('oil-mode-video',mode==='video');
      live.setAttribute('aria-pressed',String(mode==='live'));
      video.setAttribute('aria-pressed',String(mode==='video'));
      if(info)info.textContent=mode==='live'?'Select a file → Prepare QR stream → Play. Scan from another device.':'Select a file → Choose video quality → Create QR video. Save it and import it later.';
      if(!quiet)save('qr-turbo:send-mode',mode);
    };
    live.addEventListener('click',()=>setMode('live'));
    video.addEventListener('click',()=>setMode('video'));
    const syncHash=()=>{if(location.hash.includes('videoExport'))setMode('video');};
    setMode(location.hash.includes('videoExport')?'video':(load('qr-turbo:send-mode')||'live'),true);
    addEventListener('hashchange',syncHash);
    file?.addEventListener('change',()=>{const names=Array.from(file.files||[]);if(names.length&&info){const bytes=names.reduce((s,f)=>s+f.size,0);info.textContent=(names.length===1?names[0].name:names.length+' files')+' · '+(bytes/1048576).toFixed(2)+' MiB selected. '+(mode==='video'?'Choose a video quality preset.':'Press Prepare QR stream.');}});
    addEventListener('qr-turbo:prepared',()=>{if(mode==='live'&&info)info.textContent='QR stream ready. Press Play and scan all codes with your receiver.';});
    const drop=$('dropZone');
    ['dragenter','dragover'].forEach(type=>drop?.addEventListener(type,()=>drop.classList.add('oil-drop-active')));
    ['dragleave','drop'].forEach(type=>drop?.addEventListener(type,()=>drop.classList.remove('oil-drop-active')));
    const high=$('oilFast120');
    high?.addEventListener('click',()=>{
      const layout=$('qrMode'),fps=$('fps'),chunk=$('chunkSize');
      if(!layout||!fps||!chunk)return;
      layout.value='quad';layout.dispatchEvent(new Event('change',{bubbles:true}));
      fps.value='120';fps.dispatchEvent(new Event('change',{bubbles:true}));
      if(![...chunk.options].some(o=>o.value===chunk.value))chunk.value='1465';
      if(info)info.textContent=fps.value==='120'?'Four QR codes at 120 FPS selected (experimental). Your display and receiver determine actual throughput.':'120 FPS is not available in the current build.';
    });
  }
  if(route==='import'&&document.body.classList.contains('oil-app')) {
    const input=$('videoImportFile');
    input?.closest('label')?.classList.add('oil-file-picker');
    const drop=input?.closest('label');
    if(drop&&input){
      for(const type of ['dragenter','dragover'])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('oil-drop-active');});
      for(const type of ['dragleave','drop'])drop.addEventListener(type,()=>drop.classList.remove('oil-drop-active'));
      drop.addEventListener('drop',e=>{
        e.preventDefault();drop.classList.remove('oil-drop-active');
        const candidate=Array.from(e.dataTransfer?.files||[]).find(f=>f.type.startsWith('video/')||/\.(mp4|m4v|mov|webm|ogv)$/i.test(f.name));
        if(!candidate){const hint=$('videoImportInfo');if(hint)hint.textContent='Drop a supported video file.';return;}
        try{const dt=new DataTransfer();dt.items.add(candidate);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}catch{input.focus();}
      });
    }
  }
})();