import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
function replaceOnce(text,old,newText,label){
  if(text.split(old).length!==2)throw new Error('Camera Studio build anchor changed: '+label);
  return text.replace(old,newText);
}
const CAMERA_BRIDGE="\n  // Switch lenses without resetting the fountain decoder or previously received blocks.\n  let cameraSwitchPromise=null;\n  async function switchCameraStudio() {\n    if (startInFlight) throw new Error(\"Camera is still starting\");\n    if (cameraSwitchPromise) return cameraSwitchPromise;\n    cameraSwitchPromise=(async()=>{\n      if(!stream)return;\n      const requested=previewFps===30?30:60;\n      const android=/Android/i.test(navigator.userAgent||\"\");\n      const base={facingMode:{ideal:\"environment\"},\n        width:{ideal:android?1440:1920},height:{ideal:android?1920:1440},\n        frameRate:{ideal:requested,max:requested}};\n      const constraints=window.QRTurboCamera?.constraints(base)||base;\n      closeCamera();\n      try{\n        stream=await (window.QRTurboCamera?.request||((media)=>navigator.mediaDevices.getUserMedia(media)))({video:constraints,audio:false});\n        cameraRequestedFps=requested;\n        lastUsedLuma=false;lumaUnavailable=false;\n        highScanRoi=null;highTrackedTiles=null;highMultiLayout=false;\n        turboGridRect=null;\n        configureCameraTrack(stream);\n        video.playsInline=true;video.muted=true;video.srcObject=stream;\n        await waitForCameraVideo();\n        await video.play();\n        lastCameraLiveAt=performance.now();\n        cameraEndedWhileStarting=false;\n        if(cameraFreeze)cameraFreeze.hidden=true;\n        hint.classList.add(\"hidden\");\n        startBtn.disabled=false;stopBtn.disabled=false;\n        startHighSpeedWorkers();\n        scheduleScan();\n        status.textContent=\"Camera changed. Existing received data preserved.\";\n      }catch(error){\n        closeCamera();\n        window.QRTurboCamera?.onError(error);\n        status.textContent=\"Could not switch camera. Press Start to try again.\";\n        throw error;\n      }\n    })();\n    try{return await cameraSwitchPromise;}\n    finally{cameraSwitchPromise=null;}\n  }\n  window.QRTurboCameraBridge={\n    switch:switchCameraStudio,\n    start:()=>start(),\n    stop:()=>stop(),\n    isRunning:()=>!!stream&&stream.getVideoTracks?.()[0]?.readyState===\"live\",\n    track:()=>stream?.getVideoTracks?.()[0]||null\n  };\n";
const studio="<section id=\"cameraStudio\" class=\"camera-studio\" aria-label=\"Camera studio\">\n    <div class=\"camera-studio__header\"><div><strong>Camera Studio</strong><small>Point at the QR codes and keep them sharp</small></div>\n      <div class=\"camera-mode-tabs\" role=\"group\" aria-label=\"Camera settings mode\">\n        <button type=\"button\" id=\"cameraSimpleBtn\" aria-pressed=\"true\">Simple</button>\n        <button type=\"button\" id=\"cameraAdvancedBtn\" aria-pressed=\"false\">Advanced</button>\n      </div>\n    </div>\n    <div class=\"camera-camera-row\">\n      <label class=\"camera-field\"><span>Camera lens</span><select id=\"cameraDevice\" aria-label=\"Choose camera\"><option>Detecting cameras…</option></select></label>\n      <button id=\"cameraFlip\" type=\"button\" class=\"camera-row-button\" aria-label=\"Switch between front and rear cameras\" title=\"Flip camera\">⇄</button>\n      <button id=\"cameraRefreshDevices\" type=\"button\" class=\"camera-row-button\" aria-label=\"Refresh detected cameras\" title=\"Refresh camera list\">↻</button>\n    </div>\n    <p id=\"cameraStudioStatus\" class=\"camera-studio-status\" role=\"status\" aria-live=\"polite\">Camera access is needed to detect lenses.</p>\n    <section id=\"cameraAdvanced\" class=\"camera-advanced\" aria-label=\"Advanced camera settings\" hidden>\n      <h3>Camera hardware controls</h3>\n      <div class=\"camera-setting-group\">\n        <div class=\"camera-range-row\"><label for=\"cameraZoom\">Optical / hardware zoom</label><output id=\"cameraZoomValue\">Unavailable</output><input id=\"cameraZoom\" type=\"range\" min=\"1\" max=\"4\" step=\".1\" value=\"1\" disabled></div>\n        <div class=\"camera-range-row\"><label for=\"cameraExposure\">Exposure / brightness</label><output id=\"cameraExposureValue\">Unavailable</output><input id=\"cameraExposure\" type=\"range\" min=\"-2\" max=\"2\" step=\".1\" value=\"0\" disabled></div>\n        <label class=\"camera-field\"><span>Focus mode</span><select id=\"cameraFocusMode\"><option value=\"\">Browser controlled</option></select></label>\n        <div class=\"camera-range-row\"><label for=\"cameraFocusDistance\">Manual focus distance</label><output id=\"cameraFocusValue\">Unavailable</output><input id=\"cameraFocusDistance\" type=\"range\" min=\"0\" max=\"1\" step=\".05\" disabled></div>\n      </div>\n      <div id=\"cameraAdvancedFps\" class=\"camera-advanced-actions\" aria-label=\"Advanced scan settings\"></div>\n      <div class=\"camera-advanced-actions\"><button type=\"button\" id=\"cameraResetControls\">Reset camera controls</button></div>\n      <p class=\"camera-setting-tip\">Focus and brightness use actual camera controls when available. Unsupported controls are disabled, not replaced with cosmetic preview effects.</p>\n      <p class=\"camera-preview-live-label\">Actual stream: <strong id=\"cameraActualResolution\">Camera off</strong></p>\n      <p id=\"cameraCapabilityList\" class=\"camera-setting-tip\">Start scanning to detect supported settings.</p>\n      <details class=\"camera-map\"><summary>Detected camera / lens map</summary><div id=\"cameraDeviceMap\"><p>Grant access to see actual browser-provided camera labels.</p></div></details>\n    </section>\n  </section>";
const overlay="<div class=\"camera-preview-overlay\" aria-label=\"Camera preview controls\">\n      <span class=\"camera-viewfinder-hint\">Center the whole QR grid inside the frame</span>\n      <div class=\"camera-lens-buttons\" role=\"group\" aria-label=\"Camera zoom presets\">\n        <button type=\"button\" data-lens=\"0.5\" aria-pressed=\"false\" disabled title=\"Requires ultra-wide camera\">0.5×</button>\n        <button type=\"button\" data-lens=\"1\" aria-pressed=\"true\">1×</button>\n        <button type=\"button\" data-lens=\"2\" aria-pressed=\"false\" disabled title=\"Requires hardware zoom or telephoto camera\">2×</button>\n        <button type=\"button\" id=\"cameraRefocus\" title=\"Restore autofocus\">AF</button>\n        <button type=\"button\" id=\"cameraTorch\" aria-pressed=\"false\" disabled title=\"Requires flashlight capability\">Flashlight</button>\n      </div>\n    </div><div class=\"camera-focus-marker\" id=\"cameraFocusMarker\" hidden aria-hidden=\"true\"></div>";
function enhanceReceiverApp(source){
  source=source.replace(/\r\n/g,'\n');
  // A 120 FPS camera preflight can silently force low resolution on phones.
  // Keep it opt-in; the default is a stable 30/60 FPS capture.
  source=replaceOnce(source,
    'if (!androidCam && previewFpsCap >= 60) {',
    'if (window.QRTurboCamera?.preferHighFps === true && !androidCam && previewFpsCap >= 60) {',
    'experimental 120 FPS preflight');
  // Stable default for camera scanning; users can choose 60 FPS in Advanced.
  // At higher exposure times the phone captures sharper, less noisy QR modules.
  source=replaceOnce(source,
    '  let previewFps = 60;',
    '  let previewFps = 30;',
    'stable 30 FPS camera preview');
  source=replaceOnce(source,
    'video: { ...camera, frameRate: { ideal: 120 } },',
    'video: window.QRTurboCamera?.constraints({ ...camera, frameRate: { ideal: 120 } }) || { ...camera, frameRate: { ideal: 120 } },',
    '120fps camera request');
  source=replaceOnce(source,
    'video: androidCam ? camera : { ...camera, frameRate: { ideal: previewFpsCap, max: previewFpsCap } },',
    'video: window.QRTurboCamera?.constraints(androidCam ? camera : { ...camera, frameRate: { ideal: previewFpsCap, max: previewFpsCap } }) || (androidCam ? camera : { ...camera, frameRate: { ideal: previewFpsCap, max: previewFpsCap } }),',
    'standard camera request');
  source=replaceOnce(source,
    '    } catch (_) {}\n  }\n\n  function syncPreviewFpsButtons() {',
    '    } catch (_) {}\n    window.QRTurboCamera?.onTrack(track);\n  }\n\n  function syncPreviewFpsButtons() {',
    'camera capability callback');
  source=replaceOnce(source,
    '    stream = null;\n    video.srcObject = null;\n    scanRegion = null;',
    '    stream = null;\n    video.srcObject = null;\n    window.QRTurboCamera?.onStop();\n    scanRegion = null;',
    'camera closed event');
  source=replaceOnce(source,
    '    } catch (err) {\n      closeCamera();\n      status.textContent = err.message === "DecoderUnavailable"',
    '    } catch (err) {\n      closeCamera();\n      window.QRTurboCamera?.onError(err);\n      status.textContent = err.message === "DecoderUnavailable"',
    'camera failure');
  source=replaceOnce(source,'  startHighSpeedWorkers();\n})();',
    CAMERA_BRIDGE + '\n  startHighSpeedWorkers();\n})();',
    'camera switch bridge');
  const native='navigator.mediaDevices.getUserMedia({';
  if(source.split(native).length-1!==2)throw new Error('Expected exactly two upstream camera acquisition sites');
  source=source.replaceAll(native,'window.QRTurboCamera.request({');
  return source;
}
export function addCameraStudio(dist) {
  const htmlFile=join(dist,'receive','index.html');
  let html=readFileSync(htmlFile,'utf8');
  html=replaceOnce(html,'<section class="camera-card">',studio+'<section class="camera-card">','studio UI');
  html=replaceOnce(html,'    <section id="cameraAdvanced" class="camera-advanced"',
    '<div class="camera-quality"><div><strong id="cameraQualityLevel" data-quality="idle">Image: waiting</strong>'+
    '<span>Local image analysis</span></div><p id="cameraQualityHint">Start scanning for local image assessment.</p></div>'+
    '    <section id="cameraAdvanced" class="camera-advanced"','camera quality hints');
  html=replaceOnce(html,'      <div id="cameraAdvancedFps"',
    '<label class="camera-field"><span>Capture resolution</span><select id="cameraResolution">'+
    '<option value="balanced">1080p · recommended</option>'+
    '<option value="detail">1440p · dense QR grids</option>'+
    '<option value="economy">720p · low-power devices</option>'+
    '<option value="auto">Auto · browser default</option></select></label>'+
    '<label class="camera-highfps"><input id="cameraExperimental120" type="checkbox">'+
    'Try 120 FPS capture (experimental; quality may drop)</label>'+
    '      <div id="cameraAdvancedFps"', 'capture quality options');
  html=replaceOnce(html,'      <div id="cameraAdvancedFps"',
    '<label class="camera-auto-exposure"><input type="checkbox" id="cameraAutoExposure" disabled>'+
    'Automatic exposure assist (when hardware supports it)</label>'+
    '      <div id="cameraAdvancedFps"','auto exposure opt in');
  html=replaceOnce(html,'<canvas id="scanCanvas" hidden></canvas>', '<canvas id="scanCanvas" hidden></canvas>'+overlay,'viewfinder toolbar');
  html=replaceOnce(html,'</head>','<link rel="stylesheet" href="../camera-controls.css"><link rel="stylesheet" href="../camera-viewer.css"></head>','studio styles');
  const regex=/<script src="app\.js(?:\?[^"]*)?"><\/script>/;
  if(!regex.test(html))throw new Error('Camera Studio app script anchor not found');
  html=html.replace(regex,m=>'<script src="../camera-controls.js"></script>\n  <script src="../camera-viewer.js" defer></script>\n  '+m);
  writeFileSync(htmlFile,html);
  const sourceFile=join(dist,'receive','app.js');
  writeFileSync(sourceFile,enhanceReceiverApp(readFileSync(sourceFile,'utf8')));
}
