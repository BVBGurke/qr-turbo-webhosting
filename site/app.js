(() => {
  'use strict';
  const status = document.getElementById('secureStatus');
  if (status) {
    const secure = window.isSecureContext;
    const camera = !!navigator.mediaDevices?.getUserMedia;
    status.textContent = !secure ? 'HTTPS für Kamerazugriff erforderlich' : camera ? 'HTTPS aktiv · Kamera-API verfügbar' : 'HTTPS aktiv · Kamera-API auf diesem Gerät nicht verfügbar';
    status.classList.toggle('warn', !secure || !camera);
  }
  const copyButton = document.getElementById('copyLink');
  copyButton?.addEventListener('click', async () => {
    const url = new URL('receive/', location.href).href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      copyButton.textContent = 'Link kopiert!';
      window.setTimeout(() => { copyButton.textContent = 'Empfänger-Link kopieren'; }, 2300);
    } catch {
      window.prompt('Empfänger-Link kopieren:', url);
    }
  });
})();
