(() => {
  'use strict';
  const status = document.getElementById('secureStatus');
  if (status) {
    const secure = window.isSecureContext;
    const camera = !!navigator.mediaDevices?.getUserMedia;
    status.textContent = !secure ? 'HTTPS required for camera access' : camera ? 'HTTPS active · camera available' : 'HTTPS active · camera not available on this device';
    status.classList.toggle('warn', !secure || !camera);
  }
  const copyButton = document.getElementById('copyLink');
  copyButton?.addEventListener('click', async () => {
    const url = new URL('receive/', location.href).href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      copyButton.textContent = 'Link copied!';
      window.setTimeout(() => { copyButton.textContent = 'Copy receiver link'; }, 2300);
    } catch {
      window.prompt('Copy receiver link:', url);
    }
  });
})();
