/* QR Turbo: navigational affordances, transfer method switch, and accessible file picker. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const route = location.pathname.replace(/\/+$/, '').split('/').pop();

  if (route === 'send') {
    const live = $('turboLiveMode');
    const video = $('turboVideoMode');
    const hint = $('turboWorkflowHint');
    const chooser = $('fileInput');
    const record = $('exportRecord');
    const recordStop = $('exportStop');
    const play = $('playBtn');
    const status = $('statusText');
    let mode = 'live';

    const readStored = () => {
      try { return sessionStorage.getItem('qr-turbo:send-mode'); } catch { return null; }
    };
    const storeMode = value => {
      try { sessionStorage.setItem('qr-turbo:send-mode', value); } catch {}
    };
    function applyMode(next, opts = {}) {
      if (!['live', 'video'].includes(next)) return;
      if (next === 'live' && recordStop && !recordStop.disabled) {
        hint.textContent = 'Finish recording before switching back to Live QR.';
        return;
      }
      if (next === 'video' && play && /^pause$/i.test(play.textContent.trim())) play.click();
      mode = next;
      document.body.classList.toggle('mode-video', next === 'video');
      document.body.classList.toggle('mode-live', next === 'live');
      live.setAttribute('aria-pressed', String(next === 'live'));
      video.setAttribute('aria-pressed', String(next === 'video'));
      hint.textContent = next === 'video'
        ? 'Choose a file, select a video quality preset, then record. The QR preview stays on this page.'
        : 'Choose a file, prepare the codes, then press Play. Scan them on the other device.';
      if (!opts.silent) storeMode(next);
      if (next === 'video' && opts.focus) $('videoExportPanel')?.focus({preventScroll: true});
    }
    live?.addEventListener('click', () => applyMode('live'));
    video?.addEventListener('click', () => applyMode('video', {focus:true}));
    function hashSync() {
      if (location.hash.toLowerCase().includes('video')) applyMode('video');
    }
    window.addEventListener('hashchange', hashSync);
    applyMode(location.hash.toLowerCase().includes('video') ? 'video' : (readStored() || 'live'), {silent: true});
    hashSync();

    const format = bytes => {
      if (!Number.isFinite(bytes)) return '';
      return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MiB' :
        bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KiB' : bytes + ' bytes';
    };
    chooser?.addEventListener('change', () => {
      const files = Array.from(chooser.files || []);
      if (!files.length) return;
      const size = files.reduce((sum, file) => sum + file.size, 0);
      hint.textContent = files.length === 1 ? 'Selected ' + files[0].name + ' (' + format(size) + '). ' +
        (mode === 'video' ? 'Choose a preset and record below.' : 'Click Prepare QR stream to continue.') :
        files.length + ' files selected (' + format(size) + '). ' +
        (mode === 'video' ? 'Choose a preset and record below.' : 'Click Prepare QR stream to continue.');
    });
    window.addEventListener('qr-turbo:prepared', () => {
      if (mode === 'live') hint.textContent = 'QR codes are ready. Press Play and scan the screen using Camera or Screen receiver.';
    });
    const drop = $('dropZone');
    ['dragenter','dragover'].forEach(type => drop?.addEventListener(type, () => drop.classList.add('turbo-drag-over')));
    ['dragleave','drop'].forEach(type => drop?.addEventListener(type, () => drop.classList.remove('turbo-drag-over')));
    if (status) status.setAttribute('role', 'status');
  }

  if (route === 'import') {
    const drop = $('turboVideoDrop');
    const picker = $('videoImportFile');
    if (drop && picker) {
      ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, ev => {
        ev.preventDefault();
        drop.classList.add('turbo-drag-over');
      }));
      ['dragleave', 'dragend'].forEach(type => drop.addEventListener(type, () => drop.classList.remove('turbo-drag-over')));
      drop.addEventListener('drop', ev => {
        ev.preventDefault();
        drop.classList.remove('turbo-drag-over');
        const file = Array.from(ev.dataTransfer?.files || []).find(f => f.type.startsWith('video/') ||
          /\.(webm|mp4|mov|m4v|ogv)$/i.test(f.name));
        if (!file) {
          $('videoImportInfo').textContent = 'Please drop a supported video file.';
          return;
        }
        try {
          const transfer = new DataTransfer();
          transfer.items.add(file);
          picker.files = transfer.files;
          picker.dispatchEvent(new Event('change', {bubbles:true}));
        } catch {
          $('videoImportInfo').textContent = 'Drag-and-drop is not supported here. Use Choose file instead.';
        }
      });
    }
  }
})();
