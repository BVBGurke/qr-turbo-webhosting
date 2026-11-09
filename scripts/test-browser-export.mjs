/**
 * Production-browser E2E smoke test, using the actual built website and WebCodecs.
 * Exercises real file selection, QR packet generation, VideoEncoder, WebM muxing,
 * download, ffprobe decode, and output-preview visibility.
 *
 * npm i --no-save playwright-core
 * QR_TURBO_CHROME=/usr/bin/chromium node scripts/test-browser-export.mjs
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const port=18974;
const url='http://127.0.0.1:'+port;
const folder=mkdtempSync(join(tmpdir(),'qr-turbo-browser-'));
const server=spawn('python3',['-m','http.server',String(port),'--directory','dist','--bind','127.0.0.1'],
  {stdio:'pipe'});
let browser;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForServer(){
  for(let i=0;i<50;i++){
    try{const r=await fetch(url+'/');if(r.ok)return;}catch{}
    await sleep(150);
  }
  throw Error('Built website was not served');
}
async function exportTest(page,mode,preset,software){
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'/send/',{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.QRTurboOfflineFrames==='function');
  await page.locator('#fileInput').setInputFiles({
    name:'qr-turbo-smoke-'+mode+'.txt',
    mimeType:'text/plain',
    buffer:Buffer.from('QR Turbo real browser E2E '+mode+'\n'+('abc123\n'.repeat(12)),'utf8')
  });
  await page.locator('#oilModeVideo').click();
  await page.selectOption('#exportPreset',preset);
  if(software) await page.locator('#exportUseGPU').uncheck();
  await page.locator('#exportHeadless').check();
  const selected=await page.evaluate(()=>({
    preset:document.querySelector('#exportPreset').value,
    engine:document.querySelector('#exportUseGPU').checked,
    headless:document.querySelector('#exportHeadless').checked
  }));
  assert.equal(selected.preset,preset);
  assert.equal(selected.engine,!software);
  assert.equal(selected.headless,true);
  const downloadPromise=page.waitForEvent('download',{timeout:240000});
  await page.locator('#exportRecord').click();
  let download;
  try{
    download=await Promise.race([
      downloadPromise,
      page.waitForFunction(()=>document.querySelector('#exportPreviewState')?.textContent==='Error',
        null,{timeout:240000}).then(()=>{throw Error('Export failed: '+JSON.stringify(
          page.url())+' '+errors.join('; '));})
    ]);
  }catch(error){
    const details=await page.evaluate(()=>({
      status:document.querySelector('#exportStatus')?.textContent,
      state:document.querySelector('#exportPreviewState')?.textContent,
      preview:document.querySelector('#transferOutputPreview')?.textContent?.slice(0,250),
      senderStatus:document.querySelector('#statusText')?.textContent,
      mode:document.querySelector('#qrMode')?.value,
      fps:document.querySelector('#fps')?.value,
      bytes:document.querySelector('#chunkSize')?.value
    }));
    throw Error(mode+' '+JSON.stringify(details)+' errors='+errors.join('; ')+' '+error);
  }
  const out=join(folder,mode+'.webm');
  await download.saveAs(out);
  const size=statSync(out).size;
  assert.ok(size>1000,'Video output too small: '+size);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries',
    'stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration',
    '-of','json',out],{encoding:'utf8'}));
  const stream=probe.streams?.[0];
  assert.ok(stream?.codec_name==='vp8'||stream?.codec_name==='vp9','Wrong video codec');
  assert.ok(Number(stream.nb_read_frames)>50,'Too few actual decoded video frames');
  assert.ok(Number(probe.format?.duration)>=10,'Video duration was truncated');
  await page.waitForFunction(()=>document.querySelector('#transferOutputPreview video')?.getAttribute('src')?.startsWith('blob:'),null,{timeout:15000});
  const preview=await page.locator('#transferOutputPreview video').evaluate(el=>({
    src:el.currentSrc,controls:el.controls,
    fps:document.querySelector('#exportFPS')?.value,
    state:document.querySelector('#exportPreviewState')?.textContent,
    gpuDisabled:document.querySelector('#exportUseGPU')?.disabled
  }));
  assert.equal(preview.controls,true);
  assert.equal(preview.gpuDisabled,false,'GPU mode was not unlocked after exporting');
  if(mode==='16qr-120fps')assert.equal(stream.r_frame_rate,'120/1');
  console.log(JSON.stringify({scenario:mode,size,codec:stream.codec_name,
    dimensions:stream.width+'x'+stream.height,frames:stream.nb_read_frames,
    duration:probe.format.duration,rate:stream.r_frame_rate,
    state:preview.state,errors},null,2));
  if(errors.length)throw Error('Unexpected browser exceptions: '+errors.join('; '));
  return out;
}
try{
  await waitForServer();
  const exe=process.env.QR_TURBO_CHROME;
  browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{channel:'chrome'}),
    args:['--no-sandbox','--disable-dev-shm-usage','--enable-features=WebCodecs']});
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900}});
  const scenario=process.env.QR_TURBO_SCENARIOS||'single,16qr-120fps';
  if(scenario.includes('single'))await exportTest(page,'single','tiny',true);
  if(scenario.includes('quad'))await exportTest(page,'quad','balanced',false);
  if(scenario.includes('octa'))await exportTest(page,'octa','grid8',true);
  if(scenario.includes('16qr-120fps'))await exportTest(page,'16qr-120fps','grid16x120',true);
  console.log('PASS: Real browser file selection -> offline QR encoding -> downloadable playable WebM -> preview.');
}catch(error){
  console.error('REAL BROWSER EXPORT FAILURE:',error?.stack||error);
  process.exitCode=1;
}finally{
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
  rmSync(folder,{recursive:true,force:true});
}
