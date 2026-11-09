// Small UI enhancements; transfer protocol remains unchanged.
(() => {
  'use strict';
  const path = location.pathname.replace(/\/$/, '');
  const isExport = path.endsWith('/export');
  const isImport = path.endsWith('/import');
  const isSender = path.endsWith('/send') || isExport;
  const main = document.querySelector('main');
  const help = document.createElement('div');
  help.className = 'turbo-help';
  help.setAttribute('role','note');
  help.innerHTML = isExport
    ? '<strong>Export:</strong> Choose a file, prepare QR codes, then click Record video. Hide playback if you prefer, without stopping the recording.'
    : isImport
    ? '<strong>Import:</strong> Select a QR video and click Analyze. The video timeline, recovered blocks, and arrival log update locally.'
    : isSender
    ? '<strong>Step 1:</strong> Choose a file. <strong>Step 2:</strong> Prepare the QR stream. <strong>Step 3:</strong> Press Play and scan it on the other device. <a href="../receive/">Open camera receiver ↗</a>'
    : location.pathname.includes('/screen/')
    ? '<strong>Step 1:</strong> Open the sender on another screen. <strong>Step 2:</strong> Select the screen or tab showing the QR codes. <strong>Step 3:</strong> Wait for the download.'
    : '<strong>Step 1:</strong> Allow camera access. <strong>Step 2:</strong> Point at all four QR codes. <strong>Step 3:</strong> Keep the phone steady until the file is ready.';
  if (main) {
    const first = main.querySelector('.brand,header,.actions,.camera-card');
    if (first) first.insertAdjacentElement('afterend',help); else main.prepend(help);
  }
  document.querySelectorAll('.turbo-advanced').forEach(el=>{
    const key='qr-turbo-'+location.pathname+'-advanced';
    el.open=sessionStorage.getItem(key)==='1';
    el.addEventListener('toggle',()=>sessionStorage.setItem(key,el.open?'1':'0'));
  });
})();
