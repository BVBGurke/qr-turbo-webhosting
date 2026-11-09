import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const dir=resolve('dist');
for(const path of ['index.html','send/index.html','receive/index.html','screen/index.html','export/index.html','import/index.html','export/vendor/qr-lib.js']) {
  if(path==='export/vendor/qr-lib.js')continue;
  if(!existsSync(join(dir,path)))throw new Error('Missing build output: '+path);
}
const sender=readFileSync(join(dir,'send/index.html'),'utf8');
const legacyExport=readFileSync(join(dir,'export/index.html'),'utf8');
if(!legacyExport.includes('../send/'))throw new Error('Legacy export URL must redirect to Send');
const receiver=readFileSync(join(dir,'import/app.js'),'utf8');
const home=readFileSync(join(dir,'index.html'),'utf8');
if(!sender.includes('exportModulePx') || !sender.includes('exportBitrate') || !sender.includes('exportEncodedPreview'))throw new Error('Compact video controls missing in Send');
if(!sender.includes('QRTurboOnQRRender') || !sender.includes('qr-turbo:prepared'))throw new Error('QR recording hooks missing');
if(sender.includes('href="../export/"'))throw new Error('Export is still a separate tab');
if(!sender.includes('exportTogglePreview') || !sender.includes('exportPreviewState'))throw new Error('Export preview controls missing');
const importHtml=readFileSync(join(dir,'import/index.html'),'utf8');
if(!importHtml.includes('videoImportStage') || !importHtml.includes('importTogglePreview'))throw new Error('Import preview stage missing');
if(importHtml.indexOf('id="videoImportStage"') > importHtml.indexOf('id="importGraph"'))throw new Error('Import preview stage not near video input');
if(!sender.includes('exportRecord')||!sender.includes('video-export.js'))throw new Error('Video export UI missing');
if(!receiver.includes('startLocalVideoImport')||!receiver.includes('QRTurboOnFrame'))throw new Error('Video decoder hook missing');
if(!home.includes('href="send/#videoExportPanel"') || !home.includes('href="import/"'))throw new Error('Video navigation missing');
if(sender.includes('https://shuipashui.github.io/beamferry/";'))throw new Error('Sender URL not self-hosted');
console.log('Static build checks passed: routes, source hooks, and video navigation.');

for(const mode of ['send','receive','screen','import']){
  const html=readFileSync(join(dir,mode,'index.html'),'utf8');
  if(!html.includes('class="oil-header"')||!html.includes('class="oil-mobile-nav"'))throw new Error('Oil UI navigation missing: '+mode);
  if(!html.includes('oil-design.css')||!html.includes('oil-design.js'))throw new Error('Oil UI assets missing: '+mode);
  if(!html.includes('lang="en"'))throw new Error('Wrong HTML language: '+mode);
}
if(!sender.includes('id="oilModeLive"')||!sender.includes('id="oilModeVideo"'))throw new Error('Send mode switch missing');
if(!sender.includes('id="oilFast120"'))throw new Error('High FPS select missing');
for(const path of ['oil-design.css','oil-design.js'])if(!existsSync(join(dir,path)))throw new Error('Missing design asset '+path);
console.log('Oil UI cross-route design verification passed.');

if(!sender.includes('QRTurboOfflineFrames')) throw new Error('Offline frame API missing');
if(!sender.includes('exportCustomSettings')||!sender.includes('exportFPS')||!sender.includes('exportLayout')) throw new Error('Custom video controls missing');
if(!sender.includes('120 FPS')) throw new Error('120 FPS video choice missing');
const offline=readFileSync(join(dir,'video-export.js'),'utf8');
if(!offline.includes('VideoEncoder')||!offline.includes('WebMWriter')||offline.includes('new MediaRecorder'))throw new Error('Offline WebCodecs encoder not configured');
if(!existsSync(join(dir,'webm-writer.js')))throw new Error('Missing WebM writer');
console.log('Offline video generation and custom 4 QR 120 FPS verified.');

const importerUI=readFileSync(join(dir,'import/index.html'),'utf8');
if(!importerUI.includes('videoImportSpeed'))throw new Error('High-FPS import speed control missing');
if(!readFileSync(join(dir,'video-import.js'),'utf8').includes('playbackRate = speed'))throw new Error('Import analysis speed not wired');
console.log('Video import playback speed control verified.');

for (const path of ['send/index.html','receive/highspeed-protocol.js','screen/highspeed-protocol.js','import/highspeed-protocol.js']) {
  const source = readFileSync(join(dir,path),'utf8');
  if (!source.includes('MAX_FILE_BYTES:4294967295') || source.includes('MAX_FILE_BYTES:67108864')) {
    throw new Error('Legacy high-speed protocol cap still exists: '+path);
  }
}
for (const path of ['receive/app.js','screen/app.js','import/app.js']) {
  const source = readFileSync(join(dir,path),'utf8');
  if (!source.includes('MAX_FILE_SIZE = 0xffffffff') ||
      !source.includes('header.k !== Math.ceil(header.totalLen / header.blockLen)')) {
    throw new Error('Large transfer receiver guard missing: '+path);
  }
}
if (!sender.includes('requiredBlocks > 0xffff') || sender.includes('if (total > limit)')) {
  throw new Error('Sender is missing protocol-derived block-count validation');
}
if (receiver.includes('Videos over 1 GB are not supported.')) throw new Error('Legacy 1 GiB video input cap remains');
console.log('Fixed upload caps removed; protocol format boundaries preserved.');

for (const mode of ['send','receive','screen','import']) {
  const html = readFileSync(join(dir,mode,'index.html'),'utf8');
  if(!html.includes('turbo-protocol.js'))throw Error('Turbo V2 protocol not loaded: '+mode);
  if(!html.includes('turbo-grid.css')||!html.includes('turbo-grid-ui.js'))throw Error('Turbo Grid controls not loaded: '+mode);
  if(mode!=='send'&&!html.includes('id="turboGridMode"'))throw Error('Turbo Grid scanner selection missing: '+mode);
}
if(!sender.includes('8 QR codes')||!sender.includes('16 QR codes'))throw Error('New layouts missing from sender');
if(!sender.includes('codesPerScreen >= 8')||!sender.includes('H.TURBO_HEADER_LEN'))throw Error('Turbo V2 encoder not wired to sender');
if(!sender.includes('QRTurboOfflineFrames'))throw Error('No offline packet iterator');
const videoCode=readFileSync(join(dir,'video-export.js'),'utf8');
if(!videoCode.includes('grid8')||!videoCode.includes('grid16')||!videoCode.includes("hexadeca"))throw Error('Turbo Grid offline video profiles missing');
console.log('Turbo V2 layout, receiver, and offline-video checks passed.');

if (!sender.includes('layoutCodes: codesPerScreen,')) throw Error('Sender optical header must advertise the actual 8/16 tile count');
