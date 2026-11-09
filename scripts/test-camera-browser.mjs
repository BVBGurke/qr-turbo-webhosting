/* Real Chromium camera-UX smoke test with a simulated camera feed.
 * Hardware zoom, multi-lens and torch support cannot be emulated reliably;
 * this test verifies capability gating, camera lifecycle and mobile layout.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const port=18973,origin='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory','dist'],{stdio:'pipe'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
async function ready(){
  for(let i=0;i<50;i++){try{if((await fetch(origin+'/')).ok)return;}catch{}await sleep(150);}
  throw Error('Camera test server not ready');
}
async function test(viewport){
  const ctx=await browser.newContext({
    viewport,
    permissions:['camera'],
    ...((viewport.width<650)?{isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})
  });
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(origin+'/receive/',{waitUntil:'load'});
  assert.ok(await page.locator('#cameraStudio').isVisible());
  assert.ok(await page.locator('#cameraSimpleBtn').getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('#cameraAdvanced').isVisible(),false);
  const mapping=await page.evaluate(()=>({
    ultra:window.QRTurboCamera.cameraRole('Back Ultra Wide Camera').id,
    front:window.QRTurboCamera.cameraRole('Front Camera').id,
    tele:window.QRTurboCamera.cameraRole('Back Telephoto Camera').id,
    unknown:window.QRTurboCamera.cameraRole('Camera 2').id
  }));
  assert.deepEqual(mapping,{ultra:'ultra',front:'front',tele:'tele',unknown:'unknown'});
  await page.locator('#cameraAdvancedBtn').click();
  assert.equal(await page.locator('#cameraAdvanced').isVisible(),true);
  assert.ok(await page.locator('#cameraDeviceMap').count());
  assert.ok(await page.locator('#cameraAdvancedFps #fps60').count());
  assert.ok(await page.locator('#cameraStudio #turboGridMode').count());
  const layouts=await page.locator('#turboGridMode option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.ok(['auto','1','4','8','16'].every(id=>layouts.includes(id)),'All 1/4/8/16 scan layouts selectable');
  await page.selectOption('#turboGridMode','16');
  assert.match(await page.locator('#status').innerText(),/16 QR tiles/i);
  await page.selectOption('#turboGridMode','auto');
  await page.locator('#cameraSimpleBtn').click();
  assert.equal(await page.locator('#cameraAdvanced').isVisible(),false);
  // Real browser start: the fake camera still produces a MediaStreamTrack.
  const fallback=await page.evaluate(async()=>{
    const stream=await window.QRTurboCamera.request({video:{deviceId:{exact:'qr-turbo-invalid-device'}},audio:false});
    const active=stream.getVideoTracks()[0].readyState;
    stream.getTracks().forEach(t=>t.stop());
    return active;
  });
  assert.equal(fallback,'live','Stale camera IDs must recover with another camera');
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>window.QRTurboCameraBridge?.isRunning() &&
    document.getElementById('video').readyState>=2,{timeout:20000});
  await page.waitForFunction(()=>document.getElementById('cameraActualResolution')?.textContent.includes('×'),{timeout:10000});
  const capabilities=await page.evaluate(()=>({
    track:window.QRTurboCameraBridge.track()?.readyState,
    cameras:document.getElementById('cameraDevice').options.length,
    selected:document.getElementById('cameraDevice').selectedOptions[0]?.textContent,
    exposedHardware:window.QRTurboCamera.state.caps,
    torchDisabled:document.getElementById('cameraTorch').disabled,
    zoomDisabled:document.getElementById('cameraZoom').disabled
  }));
  assert.equal(capabilities.track,'live');
  assert.ok(capabilities.cameras>=1);
  assert.equal(await page.locator('#cameraFullscreen').isVisible(),true);
  assert.equal(await page.locator('#cameraStage video').evaluate(el=>getComputedStyle(el).objectFit),'contain');
  // Exercise the fallback for browsers without arbitrary-element fullscreen.
  await page.evaluate(()=>{
    document.getElementById('cameraStage').requestFullscreen=()=>Promise.reject(Error('unsupported'));
  });
  await page.locator('#cameraFullscreen').click();
  await page.waitForFunction(()=>document.body.classList.contains('camera-fullscreen-mode'),{timeout:5000});
  for(const id of ['cameraOverlayStart','cameraOverlayFlip','cameraOverlayTorch','cameraOverlayFocus']){
    assert.ok(await page.locator('#'+id).isVisible());
  }
  const rect=await page.evaluate(()=>{
    const r=document.getElementById('cameraStage').getBoundingClientRect();
    return {w:r.width,h:r.height,iw:innerWidth,ih:innerHeight};
  });
  assert.ok(Math.abs(rect.w-rect.iw)<3,'Camera fullscreen must fill screen width');
  assert.ok(Math.abs(rect.h-rect.ih)<3,'Camera fullscreen must fill screen height');
  assert.equal(await page.evaluate(()=>window.QRTurboCameraBridge.isRunning()),true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.body.classList.contains('camera-fullscreen-mode'));
  // A real detected QR would send this corner geometry from the decoder.
  await page.evaluate(()=>{
    const v=document.getElementById('video');
    window.dispatchEvent(new CustomEvent('qr-turbo:scan-hit',{detail:{hits:[{
      corners:[{x:20,y:20},{x:60,y:20},{x:60,y:60},{x:20,y:60}],
      videoWidth:v.videoWidth,videoHeight:v.videoHeight
    }]}}));
  });
  assert.equal(await page.locator('#cameraDetectionOverlay polygon').count(),1);
  await page.locator('#cameraAdvancedBtn').click();
  await page.evaluate(()=>window.QRTurboCamera.listCameras());
  const mapper=page.locator('.camera-map-entry select').first();
  if(await mapper.count()){
    await page.locator('.camera-map summary').click();
    await mapper.selectOption('ultra');
    assert.ok(await page.locator('[data-lens="0.5"]').isEnabled(),'Manual ultra-wide mapping should enable lens shortcut');
    await mapper.selectOption('auto');
  }
  await page.waitForFunction(()=>!document.getElementById('cameraQualityHint')?.textContent.startsWith('Start scanning'),
    null,{timeout:6000});
  assert.ok(await page.locator('#cameraQualityHint').isVisible());
  if(capabilities.zoomDisabled)assert.ok(await page.locator('#cameraZoom').isDisabled());
  if(capabilities.torchDisabled)assert.ok(await page.locator('#cameraTorch').isDisabled());
  await page.locator('#cameraFlip').click();
  await page.waitForFunction(()=>window.QRTurboCameraBridge?.isRunning(),{timeout:20000});
  const docWidth=await page.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,
    stage:document.querySelector('.camera-card')?.getBoundingClientRect()?.width
  }));
  assert.ok(docWidth.scroll-docWidth.client<10,'Camera page horizontally overflows: '+JSON.stringify(docWidth));
  await page.locator('#stopBtn').click();
  await page.waitForFunction(()=>!window.QRTurboCameraBridge.isRunning(),{timeout:5000});
  assert.equal(errors.length,0,'Uncaught camera errors: '+errors.join('; '));
  console.log(JSON.stringify({viewport,permission:'granted',stream:'started/stopped',cameras:capabilities.cameras,
    zoomSupported:!capabilities.zoomDisabled,torchSupported:!capabilities.torchDisabled,
    scrollWidth:docWidth.scroll,clientWidth:docWidth.client,jsErrors:errors}));
  await ctx.close();
}
try{
  await ready();
  browser=await chromium.launch({
    headless:true,channel:'chrome',
    args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
      '--disable-dev-shm-usage']
  });
  await test({width:1280,height:850});
  await test({width:390,height:844});
  console.log('PASS: Camera Studio Simple/Advanced, device roles, permissions, start/stop, lens switch, mobile sizing.');
}catch(e){console.error('CAMERA E2E FAILED:',e.stack||e);process.exitCode=1;}
finally{await browser?.close().catch(()=>{});server.kill('SIGTERM');}
