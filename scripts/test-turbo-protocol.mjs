import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const protocol=readFileSync('site/turbo-protocol.js','utf8');
const context={
  Uint8Array, DataView, ArrayBuffer, Number, Object, RangeError, Error,
  AirFerryHighSpeed: Object.freeze({
    HEADER_LEN:20,MAX_FILE_BYTES:4294967295,
    packFrame(h,bytes){return new Uint8Array([209,h.layoutCodes, ...bytes]);},
    parseFrame(bytes){return bytes[0]===209 ? {header:{layoutCodes:bytes[1]},block:bytes.subarray(2)}:null;},
    streamIdentity(h){return 'legacy:'+h.layoutCodes;}
  })
};
context.globalThis=context;
runInNewContext(protocol,context);
const H=context.AirFerryHighSpeed;
assert.equal(H.TURBO_HEADER_LEN,24);
assert.equal(H.HEADER_LEN,20);
const header={sessionId:31001,seq:0x8000ffff,k:70001,blockLen:1003,totalLen:70001*1003,payloadFnv:0xf00dfeed,
  systematic:true,quadFullRefresh60:true};
const block=new Uint8Array(1003).map((_,i)=>i%251);
for(const count of [8,16])for(const tile of [0,count-1]){
  const input={...header,layoutCodes:count,tileIndex:tile};
  const raw=H.packFrame(input,block);
  assert.equal(raw.length,1027);
  assert.equal(raw[0],210);
  assert.equal(raw[22],tile);
  const parsed=H.parseFrame(raw);
  assert.ok(parsed);
  assert.equal(parsed.header.k,70001,'32-bit block count');
  assert.equal(parsed.header.layoutCodes,count);
  assert.equal(parsed.header.tileIndex,tile);
  assert.equal(parsed.header.seq,0x8000ffff);
  assert.equal(parsed.header.totalLen,70001*1003);
  assert.deepEqual([...parsed.block],[...block]);
  assert.match(H.streamIdentity(parsed.header),/^v2:/);
  const invalid=raw.slice();invalid[22]=count;
  assert.equal(H.parseFrame(invalid),null,'reject invalid slot');
  const truncated=raw.slice(0,-1);
  assert.equal(H.parseFrame(truncated),null,'reject truncated frame');
}
const legacy=H.packFrame({layoutCodes:4},new Uint8Array([1,2,3]));
assert.equal(legacy[0],209);
assert.equal(H.parseFrame(legacy).header.layoutCodes,4);
assert.equal(H.streamIdentity({layoutCodes:4}),'legacy:4');
assert.throws(()=>H.packFrame({...header,layoutCodes:16,tileIndex:16},block),/QR index/);
console.log('Turbo V2 header tests passed: 8/16 layouts, 32-bit k, tile index, corruption, V1 fallback.');
