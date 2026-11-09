(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('video'), start = $('videoImportStart'), stop = $('videoImportStop');
  const videoFile = $('videoImportFile'), visibility = $('videoImportPreview');
  const fileInfo = $('videoImportInfo'), time = $('importTime'), videoProgress = $('importVideoProgress');
  const count = $('importPackets'), bytes = $('importBytes'), blocks = $('importBlocks');
  const logEl = $('videoDataLog'), logCount = $('logCount'), graph = $('importGraph');
  const scanStatus = $('status'), statusEl = $('progressText'), viewer = video?.closest('.camera-card');
  if (!video || !start || !videoFile) return;
  let frames = 0, totalBytes = 0, solved = 0, required = 0, completed = false, previousPosition = 0, loops = 0;
  let rows = [], graphBuckets = Array(50).fill(0), currentBucket = 0, pendingLog = false, active = false;
  const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(2)+' MiB' : n >= 1024 ? (n / 1024).toFixed(1)+' KiB' : n+' B';
  const fmtTime = n => !Number.isFinite(n) ? '—' : Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
  function flushLog() {
    pendingLog = false;
    logEl.textContent = rows.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }
  function log(message) {
    rows.push('['+new Date().toLocaleTimeString('en-GB', {hour12:false})+'] '+message);
    if (rows.length > 260) rows = rows.slice(-260);
    if (!pendingLog) {pendingLog=true;setTimeout(flushLog,180);}
  }
  function resetCounters() {
    frames=0;totalBytes=0;solved=0;required=0;completed=false;loops=0;previousPosition=0;
    graphBuckets=Array(50).fill(0);currentBucket=0;rows=[];count.textContent='0';bytes.textContent='0 B';
    blocks.textContent='0 / —';logCount.textContent='0 packets';videoProgress.value=0;
    time.textContent='0:00 / —';log('New analysis session.');
  }
  const previewToggle = $('importTogglePreview');
  const previewState = $('importPreviewState');
  function setPreviewState(message) { if (previewState) previewState.textContent = message; }
  function showPreview() {
    viewer?.classList.toggle('preview-hidden',!visibility.checked);
    if (previewToggle) {
      previewToggle.textContent = visibility.checked ? 'Hide preview' : 'Show preview';
      previewToggle.setAttribute('aria-pressed', String(visibility.checked));
    }
    viewer?.setAttribute('aria-label', visibility.checked ? 'Video analysis preview visible' : 'Video analysis preview hidden; decoding continues');
  }
  previewToggle?.addEventListener('click', () => {
    visibility.checked = !visibility.checked;
    showPreview();
  });
  visibility.addEventListener('change',showPreview);
  showPreview();
  videoFile.addEventListener('change', () => {
    const f=videoFile.files?.[0];
    fileInfo.textContent=f ? f.name+' · '+fmtSize(f.size)+' · '+(f.type || 'video file') : 'No video selected.';
    start.disabled = !f;
    resetCounters();
    setPreviewState(f ? 'Video selected' : 'Waiting for video');
    if(f)log('Selected '+f.name+' ('+fmtSize(f.size)+').');
  });
  start.disabled=true;
  start.addEventListener('click', () => {
    if(!videoFile.files?.[0])return;
    resetCounters();active=true;
    start.disabled=true;stop.disabled=false;
    setPreviewState('Starting analysis');
    log('Starting local video analysis. No data is uploaded.');
    $('startBtn')?.click();
  });
  stop.addEventListener('click', () => {
    $('stopBtn')?.click();active=false;start.disabled=false;stop.disabled=true;
    setPreviewState('Stopped');
    log('Analysis stopped by user.');
  });
  $('videoImportReset').addEventListener('click', () => {
    $('resetBtn')?.click();active=false;start.disabled=!videoFile.files?.[0];stop.disabled=true;
    resetCounters();
    setPreviewState('Waiting for video');
  });
  window.QRTurboVideoStarted = d => {
    setPreviewState('Analyzing');
    log('Video opened: '+d.width+'×'+d.height+' · duration '+fmtTime(d.duration));
    active=true;start.disabled=true;stop.disabled=false;
  };
  window.QRTurboVideoError = message => {
    setPreviewState('Error');
    log('ERROR: '+message);active=false;start.disabled=false;stop.disabled=true;
  };
  window.QRTurboOnFrame = packet => {
    frames++;totalBytes+=packet.bytes;solved=packet.solved;required=packet.total;
    count.textContent=frames.toLocaleString('en-US');
    bytes.textContent=fmtSize(totalBytes);
    blocks.textContent=solved.toLocaleString()+' / '+required.toLocaleString();
    logCount.textContent=frames+' packets';
    graphBuckets[currentBucket]++;
    log('QR #'+frames+' · seq '+packet.seq+' · '+packet.bytes+' bytes · recovered '+solved+'/'+required+' · hex '+packet.sample);
  };
  window.QRTurboVideoComplete = result => {
    completed=true;active=false;start.disabled=false;stop.disabled=true;
    setPreviewState('Decoded');
    videoProgress.value=100;
    log('SUCCESS: '+result.name+' · '+fmtSize(result.size)+' · SHA-256 verified. Download below.');
  };
  function drawGraph() {
    if(!graph)return;
    const width=Math.max(300,Math.floor(graph.getBoundingClientRect().width||520));
    const dpr=Math.min(2,devicePixelRatio||1),height=110;
    if(graph.width!==Math.round(width*dpr)||graph.height!==Math.round(height*dpr)) {
      graph.width=Math.round(width*dpr);graph.height=Math.round(height*dpr);
    }
    const ctx=graph.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#0d1b2b';ctx.fillRect(0,0,width,height);
    const max=Math.max(1,...graphBuckets);
    for(let i=0;i<graphBuckets.length;i++){
      const x=i/graphBuckets.length*width, w=Math.max(2,width/graphBuckets.length-2);
      const bar=graphBuckets[i]/max*74;
      ctx.fillStyle='#72efd0';ctx.fillRect(x,height-16-bar,w,bar);
    }
    ctx.fillStyle='#a9bed2';ctx.font='11px system-ui';
    ctx.fillText('Incoming QR packets · last 50 seconds (max '+max+'/s)',12,16);
  }
  setInterval(() => {
    if(active) {currentBucket=(currentBucket+1)%graphBuckets.length;graphBuckets[currentBucket]=0;}
    drawGraph();
  },1000);
  setInterval(() => {
    if(!active || completed)return;
    if(!video.duration || !Number.isFinite(video.duration))return;
    const position=video.currentTime||0;
    if(position+0.75<previousPosition && previousPosition>video.duration*0.65) {
      loops++;log('Video playback loop '+loops+'. Re-scanning to recover missed packets.');
      if(loops>=3){$('stopBtn')?.click();active=false;start.disabled=false;stop.disabled=true;setPreviewState('Incomplete');log('Stopped after three loops. Try a clearer/high-bitrate recording if incomplete.');}
    }
    previousPosition=position;
    time.textContent=fmtTime(position)+' / '+fmtTime(video.duration);
    videoProgress.value=Math.min(100,Math.floor(position/video.duration*100));
    if(video.ended && !completed) {
      active=false;start.disabled=false;stop.disabled=true;
      setPreviewState('Incomplete');
      log('Video ended. '+frames+' packets received; try enabling Loop for missed QR frames.');
    }
    if(scanStatus?.textContent?.includes('unavailable') && frames===0) log('Decoder unavailable; check browser support.');
  },300);
  $('downloadLog').addEventListener('click',()=>{
    const blob=new Blob([rows.join('\n')+'\n'],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='qr-turbo-video-log.txt';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  });
})();