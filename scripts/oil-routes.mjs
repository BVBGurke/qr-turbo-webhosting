import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const META={
 send:['01 / TRANSMIT','Send a file','Choose live QR transfer or create a QR video. Your files stay on this device.'],
 receive:['02 / CAMERA','Receive with camera','Point your phone at the sending screen and recover the file.'],
 screen:['03 / SCREEN','Receive from a screen','Capture the window or tab displaying QR codes.'],
 import:['04 / VIDEO','Import a QR video','Decode a recorded transfer and save the recovered file.']
};
const ITEMS=[['send','Send','▣'],['receive','Camera','◎'],['screen','Screen','▤'],['import','Import video','▶'],['benchmark','Benchmark Lab','▦']];
function links(current,mobile){
  return ITEMS.map(([id,name,icon])=>'<a href="../'+id+'/"'+(id===current?' aria-current="page"':'')+'>'+(mobile?'<span aria-hidden="true">'+icon+'</span>':'')+(mobile&&id==='import'?'Video':mobile&&id==='benchmark'?'Lab':name)+'</a>').join('');
}
function pageHeader(mode){
  const [index,title,description]=META[mode];
  const mark='<span class="oil-logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  return '<header class="oil-header"><a class="oil-logo" href="../" aria-label="QR Turbo home">'+mark+'<span>QR<span class="oil-logo-light">TURBO</span></span></a>'+
    '<nav class="oil-primary-nav" aria-label="Main navigation">'+links(mode,false)+'</nav><a class="oil-header-link" href="../">Overview ↗</a></header>'+
    '<nav class="oil-mobile-nav" aria-label="Mobile navigation">'+links(mode,true)+'</nav>'+
    '<section class="oil-page-heading"><div><span class="oil-flow-kicker">'+index+'</span><h1>'+title+'</h1><p>'+description+'</p></div><span class="oil-status-chip">LOCAL BROWSER MODE</span></section>';
}
function workflow(){
  return '<section class="oil-workflow" aria-label="Choose transfer method"><span class="oil-flow-kicker">TRANSFER METHOD</span><strong>How do you want to send?</strong>'+
    '<div class="oil-workflow-options" role="group" aria-label="Transfer method">'+
    '<button type="button" id="oilModeLive" aria-pressed="true"><b>Live QR stream</b><small>Show codes on your screen</small></button>'+
    '<button type="button" id="oilModeVideo" aria-pressed="false"><b>Create QR video</b><small>Save it and share later</small></button></div>'+
    '<p class="oil-step-note" id="oilModeHint" role="status" aria-live="polite">Select a file, prepare the stream and press Play.</p></section>';
}
function decorate(html,mode){
  const old=/<nav class="turbo-nav"[\s\S]*?<\/nav>/;
  if(!old.test(html))throw Error('Missing existing navigation: '+mode);
  html=html.replace(old,pageHeader(mode))
    .replace(/<html lang="[^"]*">/,'<html lang="en">')
    .replace(/<title>[\s\S]*?<\/title>/,'<title>'+META[mode][1]+' · QR Turbo</title>')
    .replace(/<link rel="canonical"[^>]*>/g,'')
    .replace(/<meta name="google-site-verification"[^>]*>/g,'')
    .replace(/<meta property="og:url"[^>]*>/g,'');
  if(html.includes('class="video-export-page"'))html=html.replace('class="video-export-page"','class="video-export-page oil-app oil-mode-live"');
  else if(html.includes('class="video-import-page"'))html=html.replace('class="video-import-page"','class="video-import-page oil-app oil-import"');
  else html=html.replace('<body>','<body class="oil-app">');
  html=html.replace('</head>','<link rel="stylesheet" href="../oil-design.css"></head>');
  html=html.replace('</body>','<script src="../oil-design.js" defer></script></body>');
  if(mode==='send'){
    if(!html.includes('id="videoExportPanel"'))throw Error('Missing QR video export');
    if(!html.includes('<label class="drop" id="dropZone">'))throw Error('Missing sender file input');
    html=html.replace('<label class="drop" id="dropZone">',workflow()+'<label class="drop" id="dropZone">')
      .replace('<div class="actions">','<div class="actions" id="oilLiveActions">')
      .replace('<section class="panel viewer">','<section class="panel viewer" id="oilLiveViewer">')
      .replace('id="videoExportPanel"','id="videoExportPanel" tabindex="-1"')
      .replace('<p class="tip rate-hint" id="rateHint">','<button type="button" id="oilFast120" class="oil-experimental">4 QR · 120 FPS (experimental)</button><p class="tip rate-hint" id="rateHint">');
  }else if(mode==='import'){
    if(!html.includes('id="videoImportFile"'))throw Error('Missing video picker');
    html=html.replace('<label>Video file (WebM / MP4)','<label class="oil-file-picker">Video file (WebM / MP4)');
  }else{
    const help=mode==='receive'
      ? 'Open <a href="../send/">Send</a> on a computer, start scanning and keep all QR codes in view.'
      : 'Open <a href="../send/">Send</a> on another display, then choose its QR window or tab.';
    html=html.replace('</header>','</header><aside class="oil-receiver-instructions"><b>QUICK START</b><span>'+help+'</span></aside>');
  }
  return html;
}
export function improveOilUI(output){
  for(const mode of Object.keys(META)){
    const path=join(output,mode,'index.html');
    writeFileSync(path,decorate(readFileSync(path,'utf8'),mode));
  }
}
