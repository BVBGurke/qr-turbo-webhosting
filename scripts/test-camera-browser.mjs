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
  assert.match(await page.locator('#turboGridStatus').innerText(),/0\/16.*waiting/i);
  assert.equal(await page.locator('#turboGridStatus').getAttribute('data-ready'),'false');
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
    const makeHit=(x,y)=>({
      corners:[{x,y},{x:x+40,y},{x:x+40,y:y+40},{x,y:y+40}],
      videoWidth:v.videoWidth,videoHeight:v.videoHeight,layoutCodes:4,sessionId:72
    });
    window.dispatchEvent(new CustomEvent('qr-turbo:scan-hit',{
      detail:{hits:[makeHit(20,20),makeHit(v.videoWidth-60,v.videoHeight-60)]}
    }));
  });
  await page.waitForFunction(()=>document.querySelectorAll('#cameraDetectionOverlay [data-qr-slot]').length===2);
  assert.equal(await page.locator('#cameraQrCoverage').innerText(),'QR 2/4 scanned');
  await page.waitForTimeout(1250);
  assert.equal(await page.locator('#cameraDetectionOverlay polygon[data-qr-slot]').count(),2,
    'Previously scanned QR markers remain visible');
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
  if(viewport.width>=650){
    const cases=[];
    for(const [senderLayout,receiverLayout] of [['single','1'],['quad','4'],['octa','8'],['hexadeca','16']]){
      for(const rotation of [0,90,180,270])cases.push([senderLayout,receiverLayout,rotation]);
    }
    cases.push(['octa','auto',0]);
    for(const [senderLayout,receiverLayout,rotation] of cases){
      const sender=await ctx.newPage();
      await sender.goto(origin+'/send/',{waitUntil:'load'});
      await sender.evaluate(()=>{
        const settings=document.getElementById('liveAdvancedSettings');
        if(settings)settings.open=true;
        const input=document.getElementById('fileInput');
        const file=new File(['QR scanner end-to-end regression'],'qr-scan-smoke.txt',{type:'text/plain'});
        const transfer=new DataTransfer();transfer.items.add(file);
        input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await sender.locator('#qrMode').selectOption(senderLayout);
      await sender.locator('#chunkSize').selectOption('1003');
      await sender.getByRole('button',{name:'Prepare QR stream'}).click();
      await sender.waitForFunction(()=>!document.getElementById('playBtn')?.disabled,null,{timeout:15000});
      await sender.locator('#playBtn').evaluate(button=>button.click());
      const frame=await sender.locator('#qrCanvas').evaluate((canvas,rotation)=>{
        if(!rotation)return canvas.toDataURL('image/png');
        const rotated=document.createElement('canvas');
        const sideways=rotation===90||rotation===270;
        rotated.width=sideways?canvas.height:canvas.width;
        rotated.height=sideways?canvas.width:canvas.height;
        const context=rotated.getContext('2d');
        context.translate(rotated.width/2,rotated.height/2);
        context.rotate(rotation*Math.PI/180);
        context.drawImage(canvas,-canvas.width/2,-canvas.height/2);
        return rotated.toDataURL('image/png');
      },rotation);
      await sender.close();
      const preflightCase=senderLayout==='octa'&&receiverLayout==='8'&&rotation===0;

      if(await page.evaluate(()=>window.QRTurboCameraBridge.isRunning()))
        await page.locator('#stopBtn').click();
      await page.locator('#resetBtn').click();
      await page.locator('#cameraAdvancedBtn').click();
      await page.locator('#turboGridMode').selectOption(preflightCase?'4':receiverLayout);
      await page.locator('#cameraSimpleBtn').click();
      await page.evaluate(async ({dataUrl,hideLastTile})=>{
        const image=new Image();image.src=dataUrl;
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
        const canvas=document.createElement('canvas');
        canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);
        if(hideLastTile){
          context.fillStyle='#fff';
          context.fillRect(canvas.width*3/4,canvas.height/2,canvas.width/4,canvas.height/2);
        }
        const stream=canvas.captureStream(30);
        const testState={canvas,context,image,hideLastTile};
        window.__qrCameraTest=testState;
        const drawFrame=()=>{
          context.drawImage(image,0,0);
          if(testState.hideLastTile){
            context.fillStyle='#fff';
            context.fillRect(canvas.width*3/4,canvas.height/2,canvas.width/4,canvas.height/2);
          }
          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);
        Object.defineProperty(navigator.mediaDevices,'getUserMedia',{
          configurable:true,value:async()=>stream
        });
      },{dataUrl:frame,hideLastTile:preflightCase});
      await page.locator('#startBtn').click();
      await page.waitForFunction(()=>window.QRTurboCameraBridge?.isRunning()&&
        document.getElementById('video')?.readyState>=2,{timeout:15000});
      if(preflightCase){
        await page.waitForFunction(()=>document.getElementById('turboGridStatus')?.textContent.includes('Sender uses 8 QR codes; selected 4'),
          null,{timeout:10000});
        assert.equal(await page.locator('#fileName').innerText(),'-','A layout mismatch must not start receiving');
        assert.equal(await page.locator('#progressText').innerText(),'0%');
        await page.locator('#cameraAdvancedBtn').click();
        await page.locator('#turboGridMode').selectOption('8');
        await page.locator('#cameraSimpleBtn').click();
        await page.waitForFunction(()=>document.getElementById('turboGridStatus')?.textContent.includes('7/8'),
          null,{timeout:15000});
        assert.equal(await page.locator('#fileName').innerText(),'-','Transfer must wait until every requested QR slot is found');
        assert.equal(await page.locator('#progressText').innerText(),'0%');
        const coverageAfterRescan=await page.locator('#turboGridRescan').evaluate(button=>{
          button.click();
          return document.getElementById('cameraQrCoverage').textContent;
        });
        assert.equal(coverageAfterRescan,'QR 0/8 scanned');
        assert.equal(await page.locator('#turboGridStatus').getAttribute('data-ready'),'false');
        await page.evaluate(()=>{window.__qrCameraTest.hideLastTile=false;});
        await page.waitForFunction(()=>document.getElementById('turboGridStatus')?.getAttribute('data-ready')==='true',
          null,{timeout:15000});
        console.log('PASS: manual 8-grid waits at 7/8; Rescan resets calibration; transfer releases at 8/8.');
      }
      await page.waitForFunction(()=>document.getElementById('fileName')?.textContent==='qr-scan-smoke.txt',
        {timeout:20000});
      assert.equal(await page.locator('#result').isVisible(),true,'Recovered file result must be visible');
      await page.waitForFunction(()=>document.querySelectorAll('#cameraDetectionOverlay polygon[data-qr-slot]').length>0,
        null,{timeout:5000});
      assert.match(await page.locator('#cameraQrCoverage').innerText(),
        new RegExp('^QR \\d+/'+(receiverLayout==='auto'?'8':receiverLayout)+' scanned$'));
      if(receiverLayout==='auto')assert.equal(await page.locator('#turboGridMode').inputValue(),'auto');
      console.log('PASS: end-to-end QR layout '+senderLayout+' → '+receiverLayout+' at '+rotation+'°.');
    }
  }
  if(await page.evaluate(()=>window.QRTurboCameraBridge.isRunning())){
    await page.locator('#stopBtn').click();
    await page.waitForFunction(()=>!window.QRTurboCameraBridge.isRunning(),{timeout:5000});
  }
  assert.equal(errors.length,0,'Uncaught camera errors: '+errors.join('; '));
  console.log(JSON.stringify({viewport,permission:'granted',stream:'started/stopped',cameras:capabilities.cameras,
    zoomSupported:!capabilities.zoomDisabled,torchSupported:!capabilities.torchDisabled,
    scrollWidth:docWidth.scroll,clientWidth:docWidth.client,jsErrors:errors}));
  await ctx.close();
}
async function testScreen(){
  const ctx=await browser.newContext({viewport:{width:1280,height:850}});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(origin+'/screen/',{waitUntil:'load'});
  const sender=await ctx.newPage();
  await sender.goto(origin+'/send/',{waitUntil:'load'});
  await sender.evaluate(()=>{
    const settings=document.getElementById('liveAdvancedSettings');
    if(settings)settings.open=true;
    const input=document.getElementById('fileInput');
    const file=new File(['QR screen capture end-to-end regression'],'screen-scan-smoke.txt',{type:'text/plain'});
    const transfer=new DataTransfer();transfer.items.add(file);
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await sender.locator('#qrMode').selectOption('octa');
  await sender.locator('#chunkSize').selectOption('1003');
  await sender.getByRole('button',{name:'Prepare QR stream'}).click();
  await sender.waitForFunction(()=>!document.getElementById('playBtn')?.disabled,null,{timeout:15000});
  await sender.locator('#playBtn').evaluate(button=>button.click());
  const frame=await sender.locator('#qrCanvas').evaluate(canvas=>canvas.toDataURL('image/png'));
  await sender.close();
  await page.locator('#turboGridMode').selectOption('8');
  await page.evaluate(async dataUrl=>{
    const image=new Image();image.src=dataUrl;
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);
    const stream=canvas.captureStream(30);
    Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{
      configurable:true,value:async()=>stream
    });
  },frame);
    const startHit=await page.locator('#startBtn').evaluate(button=>{
      const rect=button.getBoundingClientRect();
      return document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.id;
    });
    assert.equal(startHit,'startBtn','Screen start control must not be covered by the preview.');
  await page.locator('#startBtn').click();
  await page.waitForFunction(()=>!document.getElementById('stopBtn')?.disabled&&
    document.getElementById('video')?.readyState>=2,{timeout:15000});
  await page.waitForFunction(()=>document.getElementById('fileName')?.textContent==='screen-scan-smoke.txt',
    {timeout:20000});
  assert.match(await page.locator('#status').innerText(),/received|complete/i);
  assert.equal(errors.length,0,'Uncaught screen receiver errors: '+errors.join('; '));
  console.log('PASS: end-to-end 8-QR screen capture transfer.');
  await ctx.close();
}
try{
  await ready();
  browser=await chromium.launch({
    headless:true,channel:process.env.BROWSER_CHANNEL||'chrome',
    args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
      '--disable-dev-shm-usage']
  });
  await test({width:1280,height:850});
  await test({width:390,height:844});
  await testScreen();
  console.log('PASS: Camera Studio Simple/Advanced, device roles, permissions, start/stop, lens switch, mobile sizing.');
}catch(e){console.error('CAMERA E2E FAILED:',e.stack||e);process.exitCode=1;}
finally{await browser?.close().catch(()=>{});server.kill('SIGTERM');}
