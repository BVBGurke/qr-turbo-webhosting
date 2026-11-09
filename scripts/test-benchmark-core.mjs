import assert from 'node:assert/strict';
import {createMatrix,applyPreset,PRESETS,frameUpdates,percentile,validateConfig,
  deterministicBytes,toCSV,compareRuns,runCodecBenchmark} from '../site/benchmark/benchmark-core.mjs';
assert.equal(Object.keys(PRESETS).length,5);
assert.equal(applyPreset({grid:1},"overdrive").fps,120);
assert.equal(frameUpdates(16,120,0),16);
assert.equal(frameUpdates(16,120,1),4);
assert.equal(frameUpdates(8,60,1),8);
assert.equal(frameUpdates(4,120,1),2);
assert.deepEqual(deterministicBytes(16,123),deterministicBytes(16,123));
assert.equal(percentile([1,2,3,4],50),2.5);
assert.throws(()=>validateConfig({grid:16,bytesPerQR:2953}),/2068/);
assert.throws(()=>validateConfig({source:"camera"}),/synthetisch/i);
assert.equal(createMatrix({grid:4,fps:30,resolution:'1920x1080',engine:'cpu'},
  {grid:[1,4,8,16],fps:[15,30,60,90,120],resolution:['1280x720','1920x1080']}).length,40);
assert.throws(()=>createMatrix({repetitions:5},
  {grid:[1,4,8,16],fps:[10,12,15,20,24,30,60,90,120]},120),/höchstens/i);
const current={status:'erfolgreich',config:{grid:4,fps:30,source:'synthetic'},browser:'X',
  executionType:'synthetischer Codec-End-to-End-Test',metrics:{codecMiBs:8}};
const earlier={...current,metrics:{codecMiBs:10}};
assert.equal(compareRuns(current,earlier,15).regression,true);
assert.equal(compareRuns({...current,config:{...current.config,grid:16}},earlier).comparable,false);
assert.match(toCSV([{id:'A',error:'"Quoted"'}]),/""Quoted""/);
const fakeH={
  HEADER_LEN:20,TURBO_HEADER_LEN:24,fnv1a(bytes){
    return bytes.reduce((a,b)=>(Math.imul(a^b,16777619))>>>0,2166136261>>>0);
  },
  async packFile(name,type,bytes){
    return {container:new Uint8Array(bytes),originalSize:bytes.length,transmittedSize:bytes.length};
  },
  async unpackFile(bytes){return {bytes,type:'application/octet-stream',name:'benchmark.bin'};},
  async verifyFile(){return true;},
  LTEncoder:class {constructor(data,length){this.data=data;this.length=length;}encode(seq){
    const i=(seq&0x7fffffff)*this.length;
    const b=new Uint8Array(this.length);b.set(this.data.slice(i,i+this.length));
    return b;
  }},
  LTDecoder:class {constructor(k,len,id,total){
    this.k=k;this.len=len;this.total=total;this.blocks=new Map();this.solvedCount=0;this.framesDup=0;
  }
  get isComplete(){return this.solvedCount===this.k;}
  addFrame(seq,b){const i=seq&0x7fffffff;if(i>=this.k)return;
    if(this.blocks.has(i)){this.framesDup++;return;}
    this.blocks.set(i,b);this.solvedCount++;
  }
  assemble(){if(!this.isComplete)return null;const b=new Uint8Array(this.total);
    for(let i=0;i<this.k;i++)b.set(this.blocks.get(i).subarray(0,Math.min(this.len,this.total-i*this.len)),i*this.len);
    return b;
  }},
  packFrame(h,b){
    const out=new Uint8Array(24+b.length),v=new DataView(out.buffer);
    v.setUint32(0,h.seq,true);v.setUint32(4,h.k,true);v.setUint32(8,h.totalLen,true);
    out.set(b,24);return out;
  },
  parseFrame(p){
    const v=new DataView(p.buffer);return {header:{seq:v.getUint32(0,true),k:v.getUint32(4,true),totalLen:v.getUint32(8,true)},block:p.subarray(24)};
  }
};
for(const grid of [1,4,8,16]){
 const result=await runCodecBenchmark({grid,seed:3,fileSize:1024,bytesPerQR:1003,
   lossPercent:0,duplicateEvery:0},fakeH,{version:'test'});
 assert.equal(result.status,'erfolgreich',grid+' codec recovery');
 assert.equal(result.metrics.sha256Verified,true);
 assert.equal(result.metrics.goodputMiBs,null);
 assert.equal(result.metrics.qrDecodeFPS,null);
}
console.log('Benchmark Lab core tests: matrix/presets/FPS/V1-V2/validation/CRC/recovery/comparison/export passed.');
