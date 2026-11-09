(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const canvas = byId('qrCanvas');
  const viewer = canvas?.closest('.viewer');
  const record = byId('exportRecord'), stop = byId('exportStop');
  const prepare = byId('prepareBtn'), play = byId('playBtn');
  const status = byId('exportStatus'), progress = byId('exportProgress');
  const download = byId('exportDownload'), preview = byId('exportPreview');
  const duration = byId('exportDuration'), preset = byId('exportPreset');
  if (!canvas || !record || !prepare || !play) return;
  let recorder, mediaStream, chunks = [], startedAt = 0, interval = 0, maxSeconds = 60, lastUrl = null;
  const log = message => { status.textContent = message; };
  const formats = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const availableFormat = () => formats.find(x => MediaRecorder.isTypeSupported(x));
  const readableBytes = size => size >= 1024 * 1024 ? (size / 1048576).toFixed(1) + ' MB' : (size / 1024).toFixed(0) + ' KB';
  const previewToggle = byId('exportTogglePreview');
  const previewState = byId('exportPreviewState');
  function updatePreview() {
    viewer?.classList.toggle('preview-hidden', !preview.checked);
    if (previewToggle) {
      previewToggle.textContent = preview.checked ? 'Hide preview' : 'Show preview';
      previewToggle.setAttribute('aria-pressed', String(preview.checked));
    }
    viewer?.setAttribute('aria-label', preview.checked ? 'Animated QR preview visible' : 'Animated QR preview hidden; export continues');
  }
  previewToggle?.addEventListener('click', () => {
    preview.checked = !preview.checked;
    updatePreview();
  });
  preview.addEventListener('change', updatePreview);
  updatePreview();
  function applyPreset() {
    const [bytes, rate] = {quality:[1273,20],balanced:[1465,24],fast:[2068,30]}[preset.value] || [1465,24];
    byId('qrMode').value = 'quad';
    byId('qrMode').dispatchEvent(new Event('change', {bubbles:true}));
    byId('chunkSize').value = String(bytes);
    byId('fps').value = String(rate);
    byId('chunkSize').dispatchEvent(new Event('change', {bubbles:true}));
    byId('fps').dispatchEvent(new Event('change', {bubbles:true}));
  }
  preset.addEventListener('change', () => {
    applyPreset();
    log('Preset updated. Click Prepare QR stream again to apply it to your file.');
  });
  applyPreset();
  function cleanupTracks() {
    if (mediaStream) for (const track of mediaStream.getTracks()) track.stop();
    mediaStream = null;
  }
  function clearIntervalSafely() {
    if (interval) clearInterval(interval);
    interval = 0;
  }
  function finish() {
    clearIntervalSafely();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stop.disabled = true;
    record.disabled = false;
    if (!play.disabled && play.textContent.toLowerCase().includes('pause')) play.click();
    if (previewState) previewState.textContent = 'Encoding';
    log('Encoding video…');
  }
  record.addEventListener('click', () => {
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      log('This browser does not support canvas video recording. Try recent Chrome or Edge.');
      return;
    }
    if (play.disabled) { log('Choose a file and click Prepare QR stream first.'); return; }
    const type = availableFormat();
    if (!type) { log('No supported video recording format. Try Chrome or Edge.'); return; }
    try {
      const fps = Number(byId('fps').value) || 24;
      mediaStream = canvas.captureStream(fps);
      if (!mediaStream.getVideoTracks().length) throw new Error('Canvas capture did not provide a video track.');
      recorder = new MediaRecorder(mediaStream, {mimeType:type, videoBitsPerSecond:32_000_000});
      chunks = [];
      if (lastUrl) {URL.revokeObjectURL(lastUrl);lastUrl=null;}
      download.hidden = true;
      download.removeAttribute('href');
      recorder.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
      recorder.onerror = event => {log('Recording failed: ' + (event.error?.message || 'unknown error'));clearIntervalSafely();cleanupTracks();record.disabled=false;stop.disabled=true;};
      recorder.onstop = () => {
        if (previewState) previewState.textContent = 'Video ready';
        cleanupTracks();
        clearIntervalSafely();
        if (!chunks.length) {log('No video data was recorded. Try another browser.');return;}
        const videoBlob = new Blob(chunks,{type:recorder.mimeType || type});
        lastUrl = URL.createObjectURL(videoBlob);
        const extension = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
        download.href = lastUrl;
        download.download = 'qr-turbo-transfer.' + extension;
        download.hidden = false;
        download.textContent = 'Download video (' + readableBytes(videoBlob.size) + ')';
        log('Video ready. Share the file, then open Import Video to decode it.');
      };
      maxSeconds = Number(duration.value) || 60;
      startedAt = performance.now();
      progress.value = 0;
      recorder.start(1000);
      if (previewState) previewState.textContent = 'Recording';
      record.disabled = true;
      stop.disabled = false;
      if (!play.textContent.toLowerCase().includes('pause')) play.click();
      interval = setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        progress.value = Math.min(100, Math.round(elapsed / maxSeconds * 100));
        log('Recording QR frames: ' + elapsed.toFixed(1) + ' / ' + maxSeconds + ' seconds · ' + chunks.length + ' video chunks');
        if (elapsed >= maxSeconds) finish();
      }, 200);
    } catch (error) {
      cleanupTracks();clearIntervalSafely();record.disabled=false;stop.disabled=true;
      if (previewState) previewState.textContent = 'Recording failed';
      log('Unable to record video: ' + error.message);
    }
  });
  stop.addEventListener('click', finish);
  window.addEventListener('pagehide', () => {clearIntervalSafely();cleanupTracks();if(lastUrl)URL.revokeObjectURL(lastUrl);});
})();