(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const videoCanvas = $('exportEncodedPreview');
  const liveCanvas = $('qrCanvas');
  const liveViewer = liveCanvas?.closest('.viewer');
  const previewStage = $('encodedPreviewStage');
  const previewPlaceholder = $('exportPreviewPlaceholder');
  const recordButton = $('exportRecord');
  const stopButton = $('exportStop');
  const prepareButton = $('prepareBtn');
  const playButton = $('playBtn');
  const fileInput = $('fileInput');
  const presetInput = $('exportPreset');
  const durationInput = $('exportDuration');
  const moduleInput = $('exportModulePx');
  const bitrateInput = $('exportBitrate');
  const visibleInput = $('exportPreview');
  const previewToggle = $('exportTogglePreview');
  const previewState = $('exportPreviewState');
  const status = $('exportStatus');
  const estimate = $('exportEstimatedSize');
  const progress = $('exportProgress');
  const download = $('exportDownload');
  if (!videoCanvas || !recordButton || !fileInput || !prepareButton || !playButton) return;

  const PROFILES = Object.freeze({
    tiny: { mode: 'single', bytes: 1003, fps: 10, px: 2, kbps: 260, redundancy: 3.5 },
    compact: { mode: 'single', bytes: 1003, fps: 12, px: 3, kbps: 700, redundancy: 3.0 },
    balanced: { mode: 'quad', bytes: 1003, fps: 12, px: 3, kbps: 2200, redundancy: 2.7 },
    fast: { mode: 'quad', bytes: 1465, fps: 20, px: 4, kbps: 6000, redundancy: 2.5 }
  });
  const MIN_SECONDS = 12;
  const MAX_AUTO_SECONDS = 900;
  const QUIET_MODULES = 4;
  const imageCache = new WeakMap();
  const ctx = videoCanvas.getContext('2d', { alpha: false });
  let latestPatterns = null;
  let track = null;
  let stream = null;
  let recorder = null;
  let recorderChunks = [];
  let recording = false;
  let preparing = false;
  let startedAt = 0;
  let targetSeconds = 0;
  let elapsedTimer = 0;
  let paintedFrames = 0;
  let finalUrl = null;
  let fileLabel = '';
  let lastMeta = null;

  const formatBytes = n => n >= 1048576 ? (n / 1048576).toFixed(2) + ' MiB'
    : n >= 1024 ? (n / 1024).toFixed(1) + ' KiB' : Math.round(n) + ' B';
  function message(text) { status.textContent = text; }
  function setState(text) { if (previewState) previewState.textContent = text; }
  function currentProfile() { return PROFILES[presetInput.value] || PROFILES.compact; }
  function readSettings() {
    const profile = currentProfile();
    const px = Math.max(2, Math.min(5, Number(moduleInput.value) || profile.px));
    const kbps = Math.max(160, Math.min(16000, Number(bitrateInput.value) || profile.kbps));
    return { ...profile, px, kbps, bitrate: kbps * 1000 };
  }
  function supportedMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    const formats = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    return formats.find(mime => MediaRecorder.isTypeSupported?.(mime)) || '';
  }
  function updatePreview() {
    const visible = Boolean(visibleInput.checked);
    liveViewer?.classList.toggle('preview-hidden', !visible);
    previewStage?.classList.toggle('preview-hidden', !visible);
    if (previewToggle) {
      previewToggle.textContent = visible ? 'Hide preview' : 'Show preview';
      previewToggle.setAttribute('aria-pressed', String(visible));
    }
  }
  visibleInput?.addEventListener('change', updatePreview);
  previewToggle?.addEventListener('click', () => {
    visibleInput.checked = !visibleInput.checked;
    updatePreview();
  });
  updatePreview();

  function applyProfileToInputs() {
    const p = currentProfile();
    moduleInput.value = String(p.px);
    bitrateInput.value = String(p.kbps);
    updateEstimatedSize();
  }
  function estimateSeconds(meta, p) {
    if (!meta?.k) return null;
    const payloadsPerScreen = p.mode === 'quad' ? 4 : 1;
    return Math.max(MIN_SECONDS, Math.ceil((meta.k * p.redundancy) / (p.fps * payloadsPerScreen) + 6));
  }
  function updateEstimatedSize() {
    const p = readSettings();
    const automatic = estimateSeconds(lastMeta, p);
    const chosen = durationInput.value === 'auto' ? automatic : Number(durationInput.value);
    const modules = latestPatterns?.find(Boolean)?.count ?? (p.bytes <= 1003 ? 105 : p.bytes <= 1273 ? 117 : 125);
    const width = (modules + 2 * QUIET_MODULES) * p.px * (p.mode === 'quad' ? 2 : 1);
    const pixels = width % 2 ? width + 1 : width;
    const secondsText = chosen === null ? 'after preparation' : `${chosen} s`;
    const estimateBytes = chosen === null ? '—' : formatBytes(p.bitrate * chosen / 8);
    estimate.textContent = `${pixels} × ${pixels} px · ${p.kbps} kbps requested · ${p.fps} FPS · ${secondsText} · est. ${estimateBytes}`;
    return { p, chosen };
  }
  presetInput?.addEventListener('change', applyProfileToInputs);
  moduleInput?.addEventListener('change', updateEstimatedSize);
  bitrateInput?.addEventListener('input', updateEstimatedSize);
  durationInput?.addEventListener('change', updateEstimatedSize);
  applyProfileToInputs();

  function tileCanvas(pattern) {
    let tile = imageCache.get(pattern);
    if (tile) return tile;
    const side = pattern.count + QUIET_MODULES * 2;
    tile = document.createElement('canvas');
    tile.width = side;
    tile.height = side;
    const tc = tile.getContext('2d', { alpha: false });
    const image = tc.createImageData(side, side);
    image.data.fill(255);
    for (let y = 0; y < pattern.count; y++) {
      for (let x = 0; x < pattern.count; x++) {
        if (!pattern.dark[y * pattern.count + x]) continue;
        const index = ((y + QUIET_MODULES) * side + x + QUIET_MODULES) * 4;
        image.data[index] = image.data[index + 1] = image.data[index + 2] = 0;
      }
    }
    tc.putImageData(image, 0, 0);
    imageCache.set(pattern, tile);
    return tile;
  }
  function paintQrFrame(patterns) {
    if (!patterns?.length) return;
    latestPatterns = patterns;
    const valid = patterns.find(Boolean);
    if (!valid) return;
    if (!recording && !preparing) return; // no extra encoding overhead during normal live playback
    const p = readSettings();
    const columns = patterns.length === 4 ? 2 : 1;
    const rows = columns;
    const tileSize = (valid.count + QUIET_MODULES * 2) * p.px;
    const side = tileSize * columns;
    const evenSide = side + (side % 2);
    if (videoCanvas.width !== evenSide || videoCanvas.height !== evenSide) {
      videoCanvas.width = evenSide;
      videoCanvas.height = evenSide;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, videoCanvas.width, videoCanvas.height);
    for (let index = 0; index < patterns.length; index++) {
      const pattern = patterns[index];
      if (!pattern) continue;
      const x = (index % columns) * tileSize;
      const y = Math.floor(index / columns) * tileSize;
      const tile = tileCanvas(pattern);
      ctx.drawImage(tile, x, y, tileSize, tileSize);
    }
    if (previewPlaceholder) previewPlaceholder.hidden = true;
    if (recording && recorder?.state === 'recording') {
      paintedFrames++;
      try { track?.requestFrame?.(); } catch (_) {} // supported browsers: exact frame sequence
    }
  }
  window.QRTurboOnQRRender = paintQrFrame;
  function applySenderSettings(p) {
    const qrMode = $('qrMode'), fps = $('fps'), chunkSize = $('chunkSize');
    qrMode.value = p.mode;
    qrMode.dispatchEvent(new Event('change', { bubbles: true }));
    fps.value = String(p.fps);
    chunkSize.value = String(p.bytes);
    if (fps.value !== String(p.fps) || chunkSize.value !== String(p.bytes)) {
      throw new Error('This sender does not support the selected compact video profile.');
    }
    fps.dispatchEvent(new Event('change', { bubbles: true }));
    chunkSize.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function prepareFreshSequence() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => cleanup(new Error('QR preparation timed out.')), 60000);
      function cleanup(error, meta) {
        clearTimeout(timer);
        window.removeEventListener('qr-turbo:prepared', onReady);
        window.removeEventListener('qr-turbo:prepare-error', onError);
        if (error) reject(error); else resolve(meta);
      }
      const onReady = event => cleanup(null, event.detail);
      const onError = event => cleanup(new Error(String(event.detail || 'Preparation failed.')));
      window.addEventListener('qr-turbo:prepared', onReady);
      window.addEventListener('qr-turbo:prepare-error', onError);
      prepareButton.click();
    });
  }
  function stopStream() {
    try { stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    track = null;
    stream = null;
  }
  function stopLivePlayback() {
    if (playButton && /^pause$/i.test(playButton.textContent.trim())) playButton.click();
  }
  function stopRecording() {
    if (!recording) return;
    recording = false;
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
    stopButton.disabled = true;
    stopLivePlayback();
    setState('Finishing');
    message(`Finalizing video · ${paintedFrames} QR updates captured…`);
    if (recorder?.state === 'recording' || recorder?.state === 'paused') {
      try { recorder.stop(); } catch (error) { message('Failed to finish video: ' + error.message); stopStream(); recordButton.disabled = false; }
    } else { stopStream(); recordButton.disabled = false; }
  }
  async function recordVideo() {
    if (preparing || recording) return;
    if (!fileInput.files?.length && prepareButton.disabled) { message('Choose a file first.'); return; }
    if (typeof MediaRecorder === 'undefined' || typeof videoCanvas.captureStream !== 'function') {
      message('Video export requires MediaRecorder and canvas capture. Try a current desktop browser.');
      return;
    }
    preparing = true;
    recordButton.disabled = true;
    download.hidden = true;
    download.removeAttribute('href');
    if (finalUrl) { URL.revokeObjectURL(finalUrl); finalUrl = null; }
    setState('Preparing');
    const settings = readSettings();
    const mime = supportedMime();
    try {
      stopLivePlayback();
      latestPatterns = null;
      lastMeta = null;
      applySenderSettings(settings);
      message('Preparing the QR stream from packet 0…');
      lastMeta = await prepareFreshSequence();
      const automatic = estimateSeconds(lastMeta, settings);
      targetSeconds = durationInput.value === 'auto' ? automatic : Number(durationInput.value);
      if (durationInput.value === 'auto' && targetSeconds > MAX_AUTO_SECONDS) {
        throw new Error('Auto video would exceed 15 minutes. Use a faster preset or a smaller input file.');
      }
      if (!targetSeconds || !Number.isFinite(targetSeconds)) throw new Error('Invalid recording duration.');
      const fileName = String(lastMeta.name || 'transfer').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
      fileLabel = fileName || 'transfer';
      updateEstimatedSize();
      recorderChunks = [];
      paintedFrames = 0;
      // requestFrame() captures each native QR update when supported; fallback captures changed frames at FPS.
      stream = videoCanvas.captureStream(0);
      track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Canvas capture track unavailable.');
      if (typeof track.requestFrame !== 'function') {
        stopStream();
        stream = videoCanvas.captureStream(settings.fps);
        track = stream.getVideoTracks()[0];
      }
      const options = { videoBitsPerSecond: settings.bitrate };
      if (mime) options.mimeType = mime;
      recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = event => { if (event.data?.size) recorderChunks.push(event.data); };
      recorder.onerror = event => {
        message('Video recording failed: ' + (event.error?.message || 'encoder error'));
        setState('Error');
        recording = false;
        stopStream();
        clearInterval(elapsedTimer);
        recordButton.disabled = false;
        stopButton.disabled = true;
      };
      recorder.onstop = () => {
        clearInterval(elapsedTimer);
        stopStream();
        recordButton.disabled = false;
        stopButton.disabled = true;
        if (!recorderChunks.length) { message('No video data was produced. Try another browser.'); setState('No data'); return; }
        const blob = new Blob(recorderChunks, { type: recorder.mimeType || mime || 'video/webm' });
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        finalUrl = URL.createObjectURL(blob);
        download.href = finalUrl;
        download.download = `qr-turbo-${fileLabel}.${ext}`;
        download.textContent = `Download QR video · ${formatBytes(blob.size)}`;
        download.hidden = false;
        setState('Ready');
        message(`Video ready: ${formatBytes(blob.size)} · ${paintedFrames} QR updates · ${videoCanvas.width}×${videoCanvas.height} · ${Math.round(recorder.videoBitsPerSecond / 1000)} kbps configured. Test it in Import Video.`);
      };
      recorder.start(1000);
      recording = true;
      preparing = false;
      startedAt = performance.now();
      stopButton.disabled = false;
      setState('Recording');
      progress.value = 0;
      paintQrFrame(latestPatterns); // capture the first systematic QR codes before playback advances
      try { track.requestFrame?.(); } catch (_) {}
      playButton.click();
      elapsedTimer = setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        progress.value = Math.min(100, elapsed / targetSeconds * 100);
        message(`Recording QR sequence: ${elapsed.toFixed(1)} / ${targetSeconds} s · ${paintedFrames} QR updates · requested ${settings.kbps} kbps`);
        if (elapsed >= targetSeconds) stopRecording();
      }, 200);
    } catch (error) {
      preparing = false;
      recording = false;
      stopStream();
      stopButton.disabled = true;
      recordButton.disabled = false;
      setState('Error');
      message('Could not record QR video: ' + error.message);
    }
  }
  recordButton.addEventListener('click', () => void recordVideo());
  stopButton?.addEventListener('click', stopRecording);
  window.addEventListener('pagehide', () => {
    clearInterval(elapsedTimer);
    if (recorder?.state === 'recording') recorder.stop();
    stopStream();
    if (finalUrl) URL.revokeObjectURL(finalUrl);
  });
})();