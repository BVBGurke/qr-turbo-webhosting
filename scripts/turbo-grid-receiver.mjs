import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

function requirePatch(file,from,to){
  const src=readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  if(!src.includes(from))throw Error('Receiver Turbo V2 patch missing '+file+': '+from.slice(0,80));
  writeFileSync(file,src.replace(from,to));
}

const scanner="  // The extended grid uses the same WASM QR decoder workers as BeamFerry.\n  // A worker reads one QR tile at a time, keeping peak memory bounded.\n  function turboGridBounds() {\n    const columns=4,rows=turboGridMode===8?2:4;\n    if(turboGridRect)return turboGridRect;\n    const width=video.videoWidth||1,height=video.videoHeight||1;\n    const aspect=columns/rows;\n    const w=Math.max(1,Math.min(width,height*aspect));\n    const h=w/aspect;\n    return {x:(width-w)/2,y:(height-h)/2,width:w,height:h};\n  }\n  function turboGridTile(index) {\n    const bounds=turboGridBounds(),columns=4,rows=turboGridMode===8?2:4;\n    const cellW=bounds.width/columns,cellH=bounds.height/rows;\n    const col=index%columns,row=Math.floor(index/columns);\n    const padX=cellW*0.055,padY=cellH*0.055;\n    return clampScanRegion({\n      x:bounds.x+cellW*col-padX,y:bounds.y+cellH*row-padY,\n      width:cellW+2*padX,height:cellH+2*padY\n    });\n  }\n  function noteTurboGridHit(code,origin) {\n    const parsed=H?.parseFrame(code?.bytes);\n    if(!parsed||parsed.header.layoutCodes<8)return;\n    const header=parsed.header;\n    const mapped=transferHitTile({bytes:code.bytes,position:code.position,origin});\n    if(!mapped||mapped.width<24||mapped.height<24)return;\n    const columns=4,rows=header.layoutCodes===8?2:4;\n    const pitchX=mapped.width*1.085,pitchY=mapped.height*1.085;\n    const x=mapped.x - (header.tileIndex%columns)*pitchX - pitchX*.04;\n    const y=mapped.y - Math.floor(header.tileIndex/columns)*pitchY - pitchY*.04;\n    if(!Number.isFinite(x+y))return;\n    // Smooth tracking rather than jittering the entire grid on every frame.\n    const rect={x,y,width:columns*pitchX,height:rows*pitchY};\n    if(!turboGridRect)turboGridRect=rect;\n    else {\n      const alpha=.13;\n      for(const key of ['x','y','width','height'])turboGridRect[key]+=alpha*(rect[key]-turboGridRect[key]);\n    }\n  }\n  function decodeTurboGridFrame() {\n    if(video.readyState<2||!stream)return false;\n    const slots=idleHighWorkerSlots();\n    if(!slots.length){workerBusyDrops++;return false;}\n    const count=turboGridMode;\n    const budget=Math.min(slots.length,4);\n    for(const slot of slots.slice(0,budget)) {\n      const index=turboGridCursor++%count;\n      const region=turboGridTile(index);\n      highWorkerBusy[slot]=true; // reserve the worker during async screenshot acquisition\n      highWorkerStartedAt[slot]=performance.now();\n      void postHighSpeedRegion(slot,region,1,false,true).then(hits=>{\n        if(hits.length)highScanMisses=0;\n      }).catch(()=>{\n        workerErrors++;\n        highWorkerBusy[slot]=false;\n      });\n    }\n    turboGridScanCount++;\n    if(turboGridScanCount%30===0)\n      status.textContent='Turbo V2 · '+count+'-code grid · scanning tile '+(turboGridCursor%count+1)+'/'+count;\n    return true;\n  }\n  const turboGridSelector=document.getElementById('turboGridMode');\n  turboGridSelector?.addEventListener('change',()=>{\n    turboGridMode=Number(turboGridSelector.value)||0;\n    turboGridRect=null;turboGridCursor=0;\n    highMultiLayout=turboGridMode===4||turboGridMode>=8;\n    status.textContent=turboGridMode>=8\n      ?'Scanning '+turboGridMode+' QR tiles. Keep the full grid visible.'\n      :turboGridMode===4?'Scanning 4 QR tiles in a 2×2 grid.'\n      :turboGridMode===1?'Single QR code mode enabled.'\n      :'Automatic QR grid detection enabled.';\n  });";

const robustScanner=scanner.replace(
  /      void postHighSpeedRegion\(slot,region,1,false,true\)\.then\(hits=>\{\n        if\(hits\.length\)highScanMisses=0;\n      \}\)\.catch\(\(\)=>\{\n        workerErrors\+\+;\n        highWorkerBusy\[slot\]=false;\n      \}\);/,
  '      const dispatched=postHighSpeedRegion(slot,region,1,false,true);\n' +
  '      if(dispatched&&typeof dispatched.then==="function"){\n' +
  '        void dispatched.then(hits=>{\n' +
  '          if(hits.length)highScanMisses=0;\n' +
  '        }).catch(()=>{\n' +
  '          workerErrors++;\n' +
  '          highWorkerBusy[slot]=false;\n' +
  '        });\n' +
  '      }'
);
if(robustScanner===scanner)throw Error('Turbo Grid scanner dispatch patch anchor missing');

const orientationScanner=robustScanner
  .replace(
    '  function turboGridBounds() {\n    const columns=4,rows=turboGridMode===8?2:4;\n    if(turboGridRect)return turboGridRect;',
    '  function turboGridShape() {\n'+
    '    const portrait=(video.videoHeight||0)>(video.videoWidth||0);\n'+
    '    const columns=turboGridMode===8&&portrait?2:4;\n'+
    '    return {columns,rows:turboGridMode===8?8/columns:4};\n'+
    '  }\n'+
    '  function turboGridBounds() {\n'+
    '    const {columns,rows}=turboGridShape();\n'+
    '    if(turboGridRect)return turboGridRect;'
  )
  .replace(
    '    const bounds=turboGridBounds(),columns=4,rows=turboGridMode===8?2:4;',
    '    const bounds=turboGridBounds(),{columns,rows}=turboGridShape();'
  )
  .replace(/  function noteTurboGridHit\(code,origin\) \{[\s\S]*?\n  \}\n  function decodeTurboGridFrame\(\) \{/,
    '  function noteTurboGridHit(code) {\n'+
    '    const parsed=H?.parseFrame(code?.bytes);\n'+
    '    if(!parsed||parsed.header.layoutCodes<8||turboGridRect)return;\n'+
    '    turboGridRect=turboGridBounds();\n'+
    '  }\n'+
    '  function decodeTurboGridFrame() {'
  );
if(orientationScanner===robustScanner)throw Error('Turbo Grid orientation patch anchor missing');

export function addTurboGridReceivers(dist){
  for(const mode of ['receive','screen','import']){
    const js=join(dist,mode,'app.js'),html=join(dist,mode,'index.html');
    requirePatch(js,'  const HIGH_QUAD_GRAB_MS = 12;',
      '  const HIGH_QUAD_GRAB_MS = 12;\n  let turboGridMode=0;\n  let turboGridCursor=0;\n  let turboGridRect=null;\n  let turboGridScanCount=0;');
    requirePatch(js,'      const codes = normalizeDecodedCodes(decoded);\n      validQrFrames += codes.length;',
      '      const codes = normalizeDecodedCodes(decoded);\n      if(codes.length)highScanMisses=0;\n      validQrFrames += codes.length;');
    requirePatch(js,'  function scanWithHighSpeedWorkers() {',
      orientationScanner+'\n  function scanWithHighSpeedWorkers() {');
    if(mode==='screen') {
      requirePatch(js,'    if (highMultiLayout) {\n      return decodeQuadFrame();',
        '    if (turboGridMode>=8) return decodeTurboGridFrame();\n    if (highMultiLayout) {\n      return decodeQuadFrame();');
    } else {
      requirePatch(js,'    if (highMultiLayout) {\n      decodeQuadFrame();',
        '    if (turboGridMode>=8) {\n      decodeTurboGridFrame();\n      return;\n    }\n    if (highMultiLayout) {\n      decodeQuadFrame();');
    }
    requirePatch(js,'      for (const code of codes) acceptDecodedBytes(code.bytes);',
      '      for (const code of codes) { noteTurboGridHit(code,origin); acceptDecodedBytes(code.bytes); }');
    requirePatch(js,'      if (parsed.header.layoutCodes !== 1 && parsed.header.layoutCodes !== 4) {',
      '      if (![1,4,8,16].includes(parsed.header.layoutCodes)) {');
    requirePatch(js,'      if (parsed.header.layoutCodes === 4) highMultiLayout = true;',
      '      if (parsed.header.layoutCodes >= 4) highMultiLayout = true;\n' +
      '      if (parsed.header.layoutCodes >= 8) {\n' +
      '        turboGridMode=parsed.header.layoutCodes;\n' +
      '        const control=document.getElementById("turboGridMode");\n' +
      '        if(control)control.value=String(turboGridMode);\n' +
      '      }');
    requirePatch(html,'<div class="fps-switch"',
      '<label class="turbo-grid-picker">QR grid <select id="turboGridMode" aria-label="Number of QR codes to scan">'+
      '<option value="auto">Auto detect</option><option value="1">1 code</option>'+
      '<option value="4">4 codes · 2 × 2</option><option value="8">8 codes · 4 × 2</option>'+
      '<option value="16">16 codes · 4 × 4</option></select></label>'+
      '<div class="fps-switch"');
  }
}