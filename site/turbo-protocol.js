/* QR Turbo V2 — optical packets: 24-byte header + payload.
 * V1 decoding stays unchanged. uint32 block count and per-tile identity.
 */
(() => {
  'use strict';
  const old=globalThis.AirFerryHighSpeed;
  if(!old)throw Error('BeamFerry high-speed protocol must load first');
  const MAGIC=210, HEADER=24, MAX=0xffffffff;
  function packFrame(h,block){
    const count=h?.layoutCodes;
    if(count!==8 && count!==16)return old.packFrame(h,block);
    if(!(block instanceof Uint8Array)||block.length!==h.blockLen)throw RangeError('Invalid V2 payload');
    if(!Number.isSafeInteger(h.k)||h.k<1||h.k>MAX||
       !Number.isSafeInteger(h.totalLen)||h.totalLen<1||h.totalLen>MAX||
       h.k!==Math.ceil(h.totalLen/h.blockLen))throw RangeError('Invalid V2 block count');
    const tile=Number(h.tileIndex);
    if(!Number.isInteger(tile)||tile<0||tile>=count)throw RangeError('Invalid V2 QR index');
    const frame=new Uint8Array(HEADER+block.length),v=new DataView(frame.buffer);
    frame[0]=MAGIC;frame[1]=count | (h.systematic?32:0) | (h.quadFullRefresh60?64:0);
    v.setUint16(2,h.sessionId,true);v.setUint32(4,h.seq>>>0,true);
    v.setUint32(8,h.k,true);v.setUint16(12,h.blockLen,true);
    v.setUint32(14,h.totalLen,true);v.setUint32(18,h.payloadFnv>>>0,true);
    frame[22]=tile;frame[23]=162;frame.set(block,HEADER);
    return frame;
  }
  function parseFrame(bytes){
    if(!(bytes instanceof Uint8Array))bytes=bytes instanceof ArrayBuffer?new Uint8Array(bytes):Uint8Array.from(bytes||[]);
    if(bytes[0]!==MAGIC)return old.parseFrame(bytes);
    if(bytes.length<=HEADER||bytes[23]!==162)return null;
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const flags=bytes[1],count=flags&31;
    if(![8,16].includes(count)||flags&128)return null;
    const k=v.getUint32(8,true),blockLen=v.getUint16(12,true),totalLen=v.getUint32(14,true),tileIndex=bytes[22];
    if(!k||!blockLen||!totalLen||tileIndex>=count||bytes.length!==HEADER+blockLen||
       k!==Math.ceil(totalLen/blockLen))return null;
    return {header:{
      sessionId:v.getUint16(2,true),seq:v.getUint32(4,true),k,blockLen,totalLen,
      payloadFnv:v.getUint32(18,true),layoutCodes:count,tileIndex,protocolVersion:2,
      systematic:!!(flags&32),quadFullRefresh60:!!(flags&64)
    },block:bytes.subarray(HEADER)};
  }
  function streamIdentity(h){
    if(h?.protocolVersion===2||h?.layoutCodes>=8)
      return 'v2:'+h.sessionId+':'+h.k+':'+h.blockLen+':'+h.totalLen+':'+h.payloadFnv+':'+h.layoutCodes;
    return old.streamIdentity(h);
  }
  globalThis.AirFerryHighSpeed=Object.freeze({...old,TURBO_HEADER_LEN:HEADER,packFrame,parseFrame,streamIdentity});
})();
