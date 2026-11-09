import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function mustReplace(content, needle, replacement, file) {
  if (!content.includes(needle)) throw new Error('Video feature patch missing in ' + file + ': ' + needle.slice(0, 80));
  return content.replace(needle, replacement);
}

function insertVideoReceiverHooks(source) {
  // Upstream source contains mixed CRLF/LF line endings; normalize before editing.
  source = source.replace(/\r\n/g, '\n');
  source = mustReplace(source,
    '  async function start() {',
    String.raw`  async function startLocalVideoImport() {
    const selected = document.getElementById("videoImportFile")?.files?.[0];
    if (!selected) throw new Error("Choose a video first.");
    if (selected.size > 1024 * 1024 * 1024) throw new Error("Videos over 1 GB are not supported.");
    if (window.QRTurboVideoURL) URL.revokeObjectURL(window.QRTurboVideoURL);
    window.QRTurboVideoURL = URL.createObjectURL(selected);
    stream = { getTracks: () => [], getVideoTracks: () => [] };
    lastUsedLuma = false;
    lumaUnavailable = false;
    resetScanStats();
    video.srcObject = null;
    video.src = window.QRTurboVideoURL;
    video.playsInline = true;
    video.muted = true;
    video.preload = "auto";
    video.controls = true;
    video.loop = !!document.getElementById("videoLoop")?.checked;
    await waitForCameraVideo();
    await video.play();
    lastCameraLiveAt = performance.now();
    if (cameraFreeze) cameraFreeze.hidden = true;
    hint.classList.add("hidden");
    startBtn.disabled = false;
    stopBtn.disabled = false;
    startHighSpeedWorkers();
    scheduleScan();
    status.textContent = "Analyzing video QR frames…";
    window.QRTurboVideoStarted?.({duration: video.duration, width: video.videoWidth, height: video.videoHeight});
  }

  async function start() {`,
    'import/app.js');
  source = mustReplace(source,
    '      await setupDetector();',
    '      await setupDetector();\n      if (window.QRTurboVideoImport) { await startLocalVideoImport(); return; }',
    'import/app.js');
  source = mustReplace(source,
    '    if (stream) stream.getTracks().forEach((track) => track.stop());',
    String.raw`    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (window.QRTurboVideoImport) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (window.QRTurboVideoURL) { URL.revokeObjectURL(window.QRTurboVideoURL); window.QRTurboVideoURL = null; }
    }`,
    'import/app.js');
  source = mustReplace(source,
    '        recordHighSequence(parsed.header);',
    String.raw`        recordHighSequence(parsed.header);
        if (window.QRTurboVideoImport) {
          const b = parsed.block;
          window.QRTurboOnFrame?.({
            seq: parsed.header.seq >>> 0, bytes: b.length,
            solved: highDecoder?.solvedCount ?? 0,
            total: highDecoder?.k ?? 0,
            unique: highDecoder?.framesNew ?? 0,
            sample: Array.from(b.subarray(0, 8), n => n.toString(16).padStart(2, "0")).join(" ")
          });
        }`,
    'import/app.js');
  source = mustReplace(source,
    '      result.hidden = false;\n      progressText.textContent = "100%',
    '      result.hidden = false;\n      window.QRTurboVideoComplete?.({name: opticalFile.name, size: opticalFile.bytes.length});\n      progressText.textContent = "100%',
    'import/app.js');
  source = mustReplace(source,
    '      hint.textContent = err.message === "DecoderUnavailable"',
    '      if (window.QRTurboVideoImport) window.QRTurboVideoError?.(err?.message || "Could not analyze this video.");\n      hint.textContent = err.message === "DecoderUnavailable"',
    'import/app.js');
  return source;
}

export function addVideoRoutes(output) {
  // Video recording now lives inside Send.
  cpSync(join(output, 'receive'), join(output, 'import'), { recursive: true });
  const exportPath = join(output, 'send', 'index.html');
  let exp = readFileSync(exportPath, 'utf8');
  exp = mustReplace(exp, '<body>', '<body class="video-export-page">', exportPath);
  exp = mustReplace(exp, '</head>', '<link rel="stylesheet" href="../video.css"></head>', exportPath);
  exp = mustReplace(exp, '<div class="status">', String.raw`<section class="video-tool-panel" id="videoExportPanel" aria-label="Export QR video">
    <h2>Save the QR sequence as a video</h2>
    <p>Send files live using the controls above, or save the same QR transfer as a compact video. The exported video can be decoded under Import Video.</p>
    <div class="video-field-grid">
      <label>File size / reliability<select id="exportPreset">
        <option value="tiny">Smallest · experimental</option>
        <option value="compact" selected>Compact · recommended</option>
        <option value="balanced">Balanced · four QR codes</option>
        <option value="fast">Faster · larger video</option>
      </select></label>
      <label>Record duration<select id="exportDuration">
        <option value="auto" selected>Auto · with redundancy</option><option value="30">30 seconds</option><option value="60">60 seconds</option>
        <option value="120">2 minutes</option><option value="240">4 minutes</option>
      </select></label>
    </div>
    <details class="video-settings"><summary>Advanced compression</summary>
      <div class="video-field-grid">
        <label>QR pixels per module<select id="exportModulePx"><option value="2">2 px · minimum, fragile</option><option value="3" selected>3 px · compact</option><option value="4">4 px · clearer</option><option value="5">5 px · robust</option></select></label>
        <label>Video bitrate (kbps)<input id="exportBitrate" type="number" min="160" max="16000" step="20" value="700" inputmode="numeric"></label>
      </div><p class="video-warning">Too few pixels or a low bitrate can make QR codes unreadable. Smallest is experimental. Some messaging services recompress videos.</p>
    </details>
    <div class="video-preview-controls" role="group" aria-label="Export playback preview">
      <div class="video-preview-title"><span class="video-preview-indicator" aria-hidden="true"></span><strong>QR playback preview</strong><span class="video-preview-state" id="exportPreviewState">Ready</span></div>
      <label class="video-check"><input type="checkbox" id="exportPreview" checked> Show preview</label>
      <button type="button" class="video-preview-toggle" id="exportTogglePreview" aria-pressed="true">Hide preview</button>
    </div>
    <div class="encoded-preview-stage" id="encodedPreviewStage"><canvas id="exportEncodedPreview" width="340" height="340" aria-label="Exact QR recording preview"></canvas><span id="exportPreviewPlaceholder">Select a file to see the encoded video frames</span></div>
    <div class="video-buttons"><button type="button" id="exportRecord">Prepare and record video</button><button type="button" id="exportStop" disabled>Stop recording</button></div>
    <progress id="exportProgress" value="0" max="100"></progress>
    <output id="exportEstimatedSize">Compact video profile · estimate after file preparation.</output>
    <output id="exportStatus" role="status">Choose a file above and click Prepare and record video.</output>
    <a id="exportDownload" class="video-download" hidden download>Download QR video</a>
  </section>
  <div class="status">`, exportPath);
  exp = mustReplace(exp, '</body>', '<script src="../video-export.js" defer></script></body>', exportPath);
  writeFileSync(exportPath, exp);
  mkdirSync(join(output, "export"), { recursive: true });
  writeFileSync(join(output, "export", "index.html"), "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0;url=../send/\"><meta name=\"robots\" content=\"noindex\"></head><body><a href=\"../send/\">Video export is in Send</a></body></html>");

  const importPath = join(output, 'import', 'index.html');
  let imp = readFileSync(importPath, 'utf8');
  imp = mustReplace(imp, '<body>', '<body class="video-import-page">', importPath);
  imp = mustReplace(imp, '</head>', '<link rel="stylesheet" href="../video.css"></head>', importPath);
  imp = mustReplace(imp, '</header>', String.raw`</header>
  <section class="video-tool-panel" aria-label="Import recorded QR video">
    <h2>Import and decode a QR video</h2>
    <p>Open an animated QR recording made by QR Turbo. Everything is decoded locally, with visual progress and detailed incoming-data logs.</p>
    <label>Video file (WebM / MP4)<input type="file" id="videoImportFile" accept="video/webm,video/mp4,video/quicktime,video/*"></label>
    <p id="videoImportInfo" class="video-metadata">No video selected.</p>
    <div class="video-preview-controls" role="group" aria-label="Video analysis preview">
      <div class="video-preview-title"><span class="video-preview-indicator" aria-hidden="true"></span><strong>Video analysis preview</strong><span class="video-preview-state" id="importPreviewState">Waiting for video</span></div>
      <label class="video-check"><input type="checkbox" id="videoImportPreview" checked> Show preview</label>
      <button type="button" class="video-preview-toggle" id="importTogglePreview" aria-pressed="true">Hide preview</button>
    </div>
    <div class="video-preview-placement" id="videoPreviewPlacement"></div>
    <div class="video-options">
      
      <label class="video-check"><input type="checkbox" id="videoLoop" checked> Loop for missed QR frames</label>
    </div>
    <div class="video-buttons">
      <button type="button" id="videoImportStart">Analyze video</button>
      <button type="button" id="videoImportStop" disabled>Stop</button>
      <button type="button" id="videoImportReset">Clear</button>
    </div>
    <div class="video-metrics" aria-label="Decoded data counters">
      <div><span>Unique packets</span><strong id="importPackets">0</strong></div>
      <div><span>Received payload</span><strong id="importBytes">0 B</strong></div>
      <div><span>Blocks recovered</span><strong id="importBlocks">0 / —</strong></div>
      <div><span>Video position</span><strong id="importTime">0:00 / —</strong></div>
    </div>
    <label for="importVideoProgress">Video analysis progress</label>
    <progress id="importVideoProgress" value="0" max="100"></progress>
    <canvas id="importGraph" width="520" height="110" aria-label="Recent QR packets per second"></canvas>
    <details class="video-log-details" open><summary>Live data log <span id="logCount">0 packets</span></summary>
      <div class="video-log-toolbar"><span>Local packet metadata + first 8 payload bytes (hex)</span><button type="button" id="downloadLog">Download log</button></div>
      <pre id="videoDataLog" role="log" aria-live="off">Select a video to begin.</pre>
    </details>
  </section>`, importPath);
  // Move the actual receiver video element into the import controls, so it is visible
  // immediately next to the file picker instead of far below diagnostics.
  const cameraMarkup = imp.match(/<section class="camera-card">[\s\S]*?<\/section>/);
  if (!cameraMarkup) throw new Error('Could not locate upstream camera preview stage');
  imp = imp.replace(cameraMarkup[0], '');
  const movedMarkup = cameraMarkup[0].replace('<section class="camera-card">', '<section class="camera-card" id="videoImportStage" aria-label="QR video preview">');
  imp = mustReplace(imp, '<div class="video-preview-placement" id="videoPreviewPlacement"></div>', movedMarkup, importPath);
    imp = mustReplace(imp, '<script src="vendor/jsQR.js"></script>', '<script>window.QRTurboVideoImport = true;</script><script src="vendor/jsQR.js"></script>', importPath);
  imp = mustReplace(imp, '</body>', '<script src="../video-import.js" defer></script></body>', importPath);
  writeFileSync(importPath, imp);

  const receiverJS = join(output, 'import', 'app.js');
  writeFileSync(receiverJS, insertVideoReceiverHooks(readFileSync(receiverJS, 'utf8')));
}
