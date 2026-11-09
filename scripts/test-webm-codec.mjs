// Production-like WebM muxing smoke test: real libvpx frames -> our muxer -> ffprobe.
// Uses a synthetic test pattern only. Skips gracefully if ffmpeg is unavailable.
import {strict as assert} from 'node:assert';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebMWriter} from '../site/webm-writer.js';

const hasTool=name=>spawnSync(name,['-version'],{encoding:'utf8'}).status===0;
if(!hasTool('ffmpeg')||!hasTool('ffprobe')) {
  console.log('WebM codec smoke test skipped: ffmpeg or ffprobe unavailable.');
} else {
  const dir=mkdtempSync(join(tmpdir(),'qr-turbo-webm-'));
  try {
    const ivf=join(dir,'frames.ivf');
    const webm=join(dir,'frames.webm');
    execFileSync('ffmpeg',[
      '-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=64x64:rate=5',
      '-frames:v','6','-c:v','libvpx','-b:v','450k','-deadline','realtime','-cpu-used','8',
      '-f','ivf','-y',ivf
    ],{stdio:'pipe'});
    const source=readFileSync(ivf);
    assert.equal(source.toString('ascii',0,4),'DKIF');
    const denominator=source.readUInt32LE(16);
    const numerator=source.readUInt32LE(20);
    const writer=new WebMWriter({width:64,height:64,fps:5,codec:'vp8',duration:1.2});
    let at=32,frames=0;
    while(at+12<=source.length) {
      const size=source.readUInt32LE(at);
      const time=source.readBigUInt64LE(at+4);
      at+=12;
      assert.ok(at+size<=source.length,'IVF frame stays in file');
      const vp8=source.subarray(at,at+size);
      at+=size;
      writer.add({
        timestamp:Math.round(Number(time)*1_000_000*numerator/denominator),
        type:(vp8[0]&1)===0?'key':'delta',
        byteLength:size,
        copyTo(dest){dest.set(vp8);}
      });
      frames++;
    }
    assert.equal(frames,6);
    writeFileSync(webm,new Uint8Array(await writer.finish().arrayBuffer()));
    const probe=JSON.parse(execFileSync('ffprobe',[
      '-v','error','-count_frames','-show_entries',
      'stream=codec_name,width,height,nb_read_frames:format=duration',
      '-of','json',webm
    ],{encoding:'utf8'}));
    assert.equal(probe.streams?.[0]?.codec_name,'vp8');
    assert.equal(probe.streams?.[0]?.width,64);
    assert.equal(probe.streams?.[0]?.height,64);
    assert.equal(Number(probe.streams?.[0]?.nb_read_frames),6);
    assert.ok(Number(probe.format?.duration)>1);
    console.log('WebM end-to-end smoke passed: VP8 IVF -> QR Turbo WebM -> ffprobe, all six frames decoded.');
  } catch(error) {
    if(/Unknown encoder 'libvpx'|Encoder.*libvpx.*not found|not currently installed/.test(String(error.stderr||error.message))) {
      console.log('WebM codec smoke test skipped: ffmpeg libvpx unavailable.');
    } else throw error;
  } finally {rmSync(dir,{recursive:true,force:true});}
}
