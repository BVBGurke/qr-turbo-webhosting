import {strict as assert} from 'node:assert';
import {WebMWriter} from '../site/webm-writer.js';

const bytes = data => new Uint8Array(data);
const makeChunk=(timestamp,type='delta')=>({
  timestamp,type,byteLength:5,
  copyTo(dest){dest.set(bytes([0x9d,0x01,0x2a,0x00,0xff]));}
});
const writer=new WebMWriter({width:640,height:640,fps:30,codec:'vp8',duration:6});
writer.add(makeChunk(0,'key'));
writer.add(makeChunk(33_333));
writer.add(makeChunk(66_667));
writer.add(makeChunk(5_000_000,'key'));
const blob=writer.finish();
assert.equal(blob.type,'video/webm');
assert.ok(blob.size>140,'WebM should contain headers and clusters');
const raw=new Uint8Array(await blob.arrayBuffer());
assert.deepEqual([...raw.slice(0,4)],[0x1a,0x45,0xdf,0xa3],'EBML header magic');
const count=(hex)=>{
  const sig=Buffer.from(hex,'hex');let total=0;
  for(let i=0;i<=raw.length-sig.length;i++)if(sig.every((b,j)=>raw[i+j]===b))total++;
  return total;
};
assert.equal(count('1f43b675'),2,'Two seekable clusters at five seconds');
assert.equal(count('1c53bb6b'),1,'Cue table is present');
assert.equal(count('a3'),4,'Every encoded video frame becomes a SimpleBlock');
assert.equal(Buffer.from(raw).includes(Buffer.from('V_VP8')),true,'Codec ID is VP8');
assert.equal(Buffer.from(raw).includes(Buffer.from('webm')),true,'WebM document type');
assert.throws(()=>new WebMWriter({width:0,height:640,fps:30,duration:2}),/dimensions/);
assert.throws(()=>new WebMWriter({width:64,height:64,fps:0,duration:2}),/FPS/);
assert.throws(()=>new WebMWriter({width:64,height:64,fps:30,duration:2}).finish(),/No encoded video frames/);
const vp9=new WebMWriter({width:320,height:320,fps:120,codec:'vp9',duration:0.5});
vp9.add(makeChunk(0,'key'));
assert.ok(Buffer.from(await vp9.finish().arrayBuffer()).includes(Buffer.from('V_VP9')));
console.log('WebM muxer checks passed: EBML, cues, tracks, keyframes and VP8/VP9.');
