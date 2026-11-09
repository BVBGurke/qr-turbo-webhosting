/* Actual Chromium E2E for the built QR Turbo Benchmark Lab.
 * Verifies the original BeamFerry codec, SHA recovery, route embedding,
 * 1/4/8/16 grids, presets, UI state, downloads and a mobile viewport.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const port=18980,origin='http://127.0.0.1:'+port,wait=ms=>new Promise(r=>setTimeout(r,ms));
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory','dist'],
 {stdio:'pipe'});
let browser;
async function waitServer(){
 for(let i=0;i<60;i++){
  try{if((await fetch(origin+'/benchmark/')).ok)return;}
  catch{}
  await wait(150);
 }
 throw Error('Benchmark site not reachable');
}
async function runPreset(page,name,count){
 await page.locator('[data-preset="'+name+'"]').click();
 assert.equal(await page.locator('#grid').inputValue(),String(count));
 const before=await page.locator('#resultRows input[data-id]').count();
 await page.locator('#startBenchmark').click();
 await page.waitForFunction(expected=>{
  const rows=[...document.querySelectorAll('#resultRows tr')];
  return rows.filter(row=>row.textContent.includes('erfolgreich')).length>=expected &&
   !document.getElementById('startBenchmark').disabled;
 },before+1,{timeout:90000});
 const data=await page.evaluate(async()=>{
  const req=indexedDB.open('qrt-benchmark-lab',1);
  const db=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=fail;});
  const tx=db.transaction('runs','readonly'),get=tx.objectStore('runs').getAll();
  const all=await new Promise((ok,fail)=>{get.onsuccess=()=>ok(get.result);get.onerror=fail;});
  return all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
 });
 assert.equal(data.status,'erfolgreich','must recover complete original file');
 assert.equal(data.config.grid,count,'must use the selected QR grid');
 assert.equal(data.metrics.sha256Verified,true,'SHA-256 must pass');
 assert.equal(data.metrics.goodputMiBs,null,'optical throughput must NOT be fabricated');
 assert.ok(data.metrics.recoveredBlocks===data.metrics.requiredBlocks);
 console.log('Benchmark '+name+': '+count+' QR · '+data.metrics.packets+
  ' packets · '+data.metrics.codecMiBs.toFixed(3)+' MiB/s · SHA-256 OK');
}
try{
 await waitServer();
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/benchmark/',{waitUntil:'domcontentloaded'});
 assert.ok(await page.locator('#startBenchmark').isVisible());
 assert.equal(await page.locator('html').getAttribute('lang'),'de');
 assert.equal(await page.locator('#advancedSettings').isVisible(),false);
 await page.locator('#advancedMode').click();
 assert.equal(await page.locator('#advancedSettings').isVisible(),true);
 // Advanced categories are intentionally collapsed. Open the relevant groups.
 await page.locator('#advancedSettings details').nth(0).locator('summary').click();
 await page.locator('#advancedSettings details').nth(6).locator('summary').click();
 await page.locator('#fileKiB').fill('2');
 await page.locator('#repetitions').fill('1');
 await page.locator('#warmups').fill('0');
 for(const [name,count] of [['safe',1],['balanced',4],['turbo',8],['overdrive',16]]){
  await runPreset(page,name,count);
 }
 await page.locator('#simpleMode').click();
 assert.equal(await page.locator('#advancedSettings').isVisible(),false);
 await page.locator('#matrixGrids input[value="1"]').check();
 await page.locator('#matrixFps input[value="15"]').check();
 await page.locator('#buildMatrix').click();
 assert.match(await page.locator('#matrixCount').innerText(),/4 Läufe/);
 const download=page.waitForEvent('download',{timeout:15000});
 await page.locator('.results-toolbar [data-export="csv"]').click();
 const csv=await download;assert.match(csv.suggestedFilename(),/\.csv$/);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#resultRows input[data-id]').length>=4);
 assert.ok(await page.locator('#resultRows tr').count()>=4,'results must persist');
 await page.locator('[data-source="camera"]').click();
 assert.equal(await page.locator('#toolFrame').getAttribute('src'),'../receive/');
 await page.locator('[data-source="screen"]').click();
 assert.equal(await page.locator('#toolFrame').getAttribute('src'),'../screen/');
 await page.locator('[data-source="video"]').click();
 assert.equal(await page.locator('#toolFrame').getAttribute('src'),'../import/');
 await page.locator('[data-source="synthetic"]').click();
 assert.ok(await page.locator('#startBenchmark').isEnabled());
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
  deviceScaleFactor:2});
 await mobile.goto(origin+'/benchmark/',{waitUntil:'domcontentloaded'});
 assert.ok(await mobile.locator('.mobile-navigation').isVisible());
 const layout=await mobile.evaluate(()=>({client:document.documentElement.clientWidth,
  scroll:document.documentElement.scrollWidth}));
 assert.ok(layout.scroll-layout.client<10,'Mobile horizontal overflow: '+JSON.stringify(layout));
 assert.equal(errors.length,0,'Browser exceptions: '+errors.join('; '));
 console.log('PASS: Chromium QR Turbo Benchmark Lab — 1/4/8/16, SHA-256, presets, matrix, CSV, persistence and mobile');
}catch(e){
 console.error('BENCHMARK BROWSER TEST FAILED:',e.stack||e);
 process.exitCode=1;
}finally{
 await browser?.close().catch(()=>{});
 server.kill('SIGTERM');
}
