/* QR Turbo transfer previews — entirely client-side, no uploads.
 * Source picker / imported recording / downloaded file / completed QR video.
 * Panels reveal progressively from top to bottom and respect reduced motion.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const route = location.pathname.replace(/\/+$/, '').split('/').pop();
  const ownedUrls = new Set();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(2)+' MiB' :
    n >= 1024 ? (n / 1024).toFixed(1)+' KiB' : n+' B';
  const extension = name => String(name || '').split('.').pop().toLowerCase();
  const mediaType = (name, mime='') => {
    const ext = extension(name);
    if (mime.startsWith('image/') || ['png','jpg','jpeg','gif','webp','avif','bmp','svg'].includes(ext)) return 'image';
    if (mime.startsWith('video/') || ['mp4','webm','mov','m4v','ogv'].includes(ext)) return 'video';
    if (mime.startsWith('audio/') || ['mp3','wav','ogg','flac','m4a','aac'].includes(ext)) return 'audio';
    if (mime.startsWith('text/') || ['txt','md','json','csv','log','xml'].includes(ext)) return 'text';
    return 'file';
  };
  function ownURL(blob) {
    const url = URL.createObjectURL(blob);
    ownedUrls.add(url);
    return url;
  }
  function revoke(url) {
    if (url && ownedUrls.delete(url)) URL.revokeObjectURL(url);
  }
  function node(tag, className='', value='') {
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(value)el.textContent=value;
    return el;
  }
  function panel(type,title,description) {
    const el=node('section','transfer-preview transfer-preview--'+type);
    el.setAttribute('aria-label',title);
    const heading=node('header','transfer-preview__header');
    heading.append(node('span','transfer-preview__eyebrow',type==='ready'?'READY TO DOWNLOAD':'LOCAL PREVIEW'));
    heading.append(node('h3','transfer-preview__title',title));
    if(description)heading.append(node('p','transfer-preview__description',description));
    el.append(heading);
    return el;
  }
  function reveal(el) {
    if(!el)return;
    el.classList.remove('transfer-preview--reveal');
    // Force only the animation state to reset; no layout read in the encoder loop.
    void el.offsetWidth;
    el.classList.add('transfer-preview--reveal');
    if(!reduceMotion.matches && el.classList.contains('transfer-preview--ready')) {
      requestAnimationFrame(()=>el.scrollIntoView({block:'nearest',behavior:'smooth'}));
    }
  }
  function renderMedia({file,url,name,mime,controls=false}) {
    const kind=mediaType(name,mime);
    const media=node('div','transfer-preview__media transfer-preview__media--'+kind);
    let child=null;
    if(kind==='image'){
      child=node('img');
      child.src=url;child.alt='Preview of '+name;child.loading='lazy';
    } else if(kind==='video') {
      child=node('video');
      child.src=url;child.controls=controls;child.muted=true;child.playsInline=true;
      child.preload='metadata';child.setAttribute('aria-label','Video preview of '+name);
    } else if(kind==='audio') {
      child=node('audio');
      child.src=url;child.controls=true;child.preload='metadata';
      child.setAttribute('aria-label','Audio preview of '+name);
    } else {
      child=node('span','transfer-preview__file-icon',
        kind==='text'?'TXT':'FILE');
      child.setAttribute('aria-hidden','true');
    }
    media.append(child);
    if(kind==='text' && file && file.size<=128*1024){
      const preview=node('pre','transfer-preview__text','Loading text preview…');
      file.slice(0,4096).text().then(text=>{if(preview.isConnected)preview.textContent=text||'(empty file)';})
        .catch(()=>{if(preview.isConnected)preview.textContent='Text preview unavailable';});
      media.append(preview);
    }
    return media;
  }
  let selectionUrls=[];
  function clearSelection(){
    for(const url of selectionUrls)revoke(url);
    selectionUrls=[];
  }
  function selectionCard(files,location,source) {
    clearSelection();
    let existing=$('transferSourcePreview');
    if(!files.length){existing?.remove();return;}
    if(!existing){
      existing=panel('selected','Your selected file','Preview before you start the transfer.');
      existing.id='transferSourcePreview';
      location.insertAdjacentElement('afterend',existing);
    }
    existing.replaceChildren();
    const heading=node('header','transfer-preview__header');
    heading.append(node('span','transfer-preview__eyebrow','SELECTED / '+source));
    heading.append(node('h3','transfer-preview__title',
      files.length===1?'File selected':files.length+' files selected'));
    heading.append(node('p','transfer-preview__description',
      'Processed locally · '+fmt(files.reduce((sum,f)=>sum+f.size,0))+' total'));
    existing.append(heading);
    const gallery=node('div','transfer-preview__gallery');
    for(const file of files.slice(0,8)){
      const item=node('div','transfer-preview__item');
      const url=ownURL(file);selectionUrls.push(url);
      const kind=mediaType(file.name,file.type);
      if(['image','video','audio','text'].includes(kind)){
        const thumb=renderMedia({file,url,name:file.name,mime:file.type,controls:files.length===1});
        item.append(thumb);
      } else item.append(node('span','transfer-preview__fallback','▧'));
      const details=node('div','transfer-preview__item-details');
      details.append(node('strong','transfer-preview__filename',file.name));
      details.append(node('small','transfer-preview__filesize',fmt(file.size)+(file.type?' · '+file.type:'')));
      item.append(details);gallery.append(item);
    }
    if(files.length>8)gallery.append(node('div','transfer-preview__extra','+'+(files.length-8)+' more files'));
    existing.append(gallery);
    reveal(existing);
  }
  function sourcePreview(){
    if(route==='send'){
      const input=$('fileInput'),target=$('dropZone');
      if(input&&target)input.addEventListener('change',()=>selectionCard(
        [...(input.files||[])],target,'SOURCE'));
    }
    if(route==='import'){
      const input=$('videoImportFile');
      if(!input)return;
      const target=input.closest('.video-tool-panel')?.querySelector('#videoImportInfo')||input.closest('label');
      if(!target)return;
      input.addEventListener('change',()=>{
        const files=[...(input.files||[])];
        // The import page already uses its main video element as a full playback/decoding preview.
        // This card displays lightweight metadata, avoiding two competing video decoders.
        clearSelection();
        let card=$('transferSourcePreview');
        if(!files.length){card?.remove();return;}
        const f=files[0];
        if(!card){
          card=panel('selected','Video selected','Preview and decoding appear in the player below.');
          card.id='transferSourcePreview';target.insertAdjacentElement('afterend',card);
        }
        card.replaceChildren();
        const header=node('header','transfer-preview__header');
        header.append(node('span','transfer-preview__eyebrow','IMPORT / LOCAL VIDEO'));
        header.append(node('h3','transfer-preview__title',f.name));
        header.append(node('p','transfer-preview__description',fmt(f.size)+' · '+(f.type||'video file')));
        card.append(header);
        reveal(card);
      });
    }
  }
  function exportPreview(){
    const download=$('exportDownload'),host=$('videoExportPanel');
    if(!download||!host)return;
    let card=null;
    window.addEventListener('qr-turbo:video-start',()=>{
      if(card)card.remove();
      card=panel('processing','Generating your QR video',
        'Your file is encoded locally. The finished recording will appear here.');
      card.id='transferOutputPreview';
      download.insertAdjacentElement('afterend',card);
      const progress=node('div','transfer-preview__pending');
      progress.append(node('span','transfer-preview__spinner'));
      progress.append(node('span','','No real-time recording or upload. Rendering QR frames offscreen.'));
      card.append(progress);
      reveal(card);
    });
    window.addEventListener('qr-turbo:video-ready',event=>{
      const detail=event.detail||{};
      const url=detail.url;
      if(typeof url!=='string'||!url.startsWith('blob:'))return;
      if(!card){
        card=panel('ready','Your QR video is ready','Preview the exact WebM before sharing.');
        card.id='transferOutputPreview';download.insertAdjacentElement('afterend',card);
      }
      card.className='transfer-preview transfer-preview--ready';
      card.replaceChildren();
      const header=node('header','transfer-preview__header');
      header.append(node('span','transfer-preview__eyebrow','VIDEO GENERATED / LOCAL'));
      header.append(node('h3','transfer-preview__title','Preview your QR video'));
      header.append(node('p','transfer-preview__description',
        fmt(detail.size||0)+' · '+(detail.tiles||1)+' QR codes · '+(detail.fps||30)+' FPS · '+Math.round(detail.duration||0)+' sec'));
      card.append(header);
      card.append(renderMedia({url,name:detail.name||'qr-video.webm',mime:'video/webm',controls:true}));
      card.append(node('p','transfer-preview__note','Playback is local. Use Import video to verify the file before sharing.'));
      reveal(card);
    });
    window.addEventListener('qr-turbo:video-error',event=>{
      if(!card)return;
      card.classList.add('transfer-preview--error');
      const message=String(event.detail?.message||'Unknown export error');
      card.querySelector('.transfer-preview__pending')?.replaceChildren(
        node('span','','Export failed: '+message));
    });
  }
  function receiverPreview(){
    if(route!=='receive'&&route!=='screen'&&route!=='import')return;
    const result=$('result'),download=$('download');
    if(!result||!download||typeof MutationObserver==='undefined')return;
    let previous='';
    function update(){
      const url=download.getAttribute('href')||'';
      if(result.hidden||!url.startsWith('blob:')||url===previous)return;
      previous=url;
      const name=download.getAttribute('download')||$('fileName')?.textContent||'Received file';
      let card=$('transferReceivedPreview');
      if(!card){
        card=panel('ready','File recovered','The transfer has finished. Preview before downloading.');
        card.id='transferReceivedPreview';
        result.insertAdjacentElement('afterend',card);
      }
      card.replaceChildren();
      const header=node('header','transfer-preview__header');
      header.append(node('span','transfer-preview__eyebrow','RECEIVED / VERIFIED'));
      header.append(node('h3','transfer-preview__title',name));
      header.append(node('p','transfer-preview__description','Download the recovered file using the button above.'));
      card.append(header);
      card.append(renderMedia({url,name,controls:true}));
      reveal(card);
    }
    const observer=new MutationObserver(update);
    observer.observe(result,{attributes:true,attributeFilter:['hidden']});
    observer.observe(download,{attributes:true,attributeFilter:['href','download']});
    update();
  }
  sourcePreview();
  exportPreview();
  receiverPreview();
  window.addEventListener('pagehide',clearSelection,{once:true});
})();
