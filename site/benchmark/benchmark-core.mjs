/**
 * QR Turbo Benchmark Lab — deterministic, real BeamFerry V1/V2 codec measurements.
 * This module intentionally does NOT claim QR camera detection, optical goodput,
 * device CPU usage or thermal data: those cannot be inferred from codec timing.
 */
export const FPS_VALUES = Object.freeze([10,12,15,20,24,30,45,50,60,90,120]);
export const GRIDS = Object.freeze([1,4,8,16]);
export const PRESETS = Object.freeze({
  safe:{grid:1,fps:24,bytesPerQR:1003,redundancy:1.5,label:"Sicher"},
  balanced:{grid:4,fps:30,bytesPerQR:1465,redundancy:1.6,label:"Ausgewogen"},
  fast:{grid:4,fps:60,bytesPerQR:1732,redundancy:1.8,label:"Schnell"},
  turbo:{grid:8,fps:60,bytesPerQR:1273,redundancy:2.0,label:"Turbo"},
  overdrive:{grid:16,fps:120,bytesPerQR:1003,redundancy:2.5,label:"Overdrive"}
});
export const DEFAULT_CONFIG = Object.freeze({
  ...PRESETS.balanced,preset:"balanced",source:"synthetic",
  fileSize:16384,pattern:"random",seed:13037,lossPercent:0,
  duplicateEvery:0,resolution:"1920x1080",engine:"cpu",headless:true,
  repetitions:1,warmups:0,timeoutMs:30000,regressionLimit:15
});
const now=()=>performance.now();
const yieldControl=()=>new Promise(resolve=>setTimeout(resolve,0));
const bounded=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const finite=(n,d=0)=>Number.isFinite(n)?n:d;
export function applyPreset(current,key) {
  if(!PRESETS[key]) throw Error("Unbekanntes Preset");
  return {...current,...PRESETS[key],preset:key};
}
export function validateConfig(input) {
  const c={...DEFAULT_CONFIG,...input};
  if(!GRIDS.includes(Number(c.grid)))throw Error("Die QR-Anzahl muss 1, 4, 8 oder 16 sein.");
  if(!Number.isInteger(Number(c.fps))||!bounded(Number(c.fps),1,120))
    throw Error("Die Ziel-FPS müssen zwischen 1 und 120 liegen.");
  if(!Number.isInteger(Number(c.bytesPerQR))||!bounded(Number(c.bytesPerQR),128,2953))
    throw Error("Ungültige QR-Nutzlast.");
  if(c.grid>1&&c.bytesPerQR>2068)throw Error("Mehr als 2068 Bytes pro QR sind nur bei einem Code verfügbar.");
  if(!Number.isInteger(Number(c.fileSize))||!bounded(Number(c.fileSize),64,4*1024*1024))
    throw Error("Die Testdatei muss zwischen 64 Bytes und 4 MiB liegen.");
  if(!bounded(Number(c.redundancy),1,4))throw Error("FEC-Redundanz muss zwischen 1 und 4 liegen.");
  if(!bounded(Number(c.lossPercent),0,70))throw Error("Paketverlust muss zwischen 0 und 70 Prozent liegen.");
  if(!Number.isInteger(Number(c.duplicateEvery))||!bounded(Number(c.duplicateEvery),0,1000))
    throw Error("Ungültiges Duplikatintervall.");
  if(!["random","zeros","repeating"].includes(c.pattern))throw Error("Unbekanntes Testmuster.");
  if(!["cpu","gpu","auto"].includes(c.engine))throw Error("Unbekannter Ausführungsmodus.");
  if(!["synthetic","camera","video","screen","stream"].includes(c.source))throw Error("Unbekannte Eingabequelle.");
  if(!Number.isInteger(Number(c.repetitions))||!bounded(Number(c.repetitions),1,20))
    throw Error("Wiederholungen müssen zwischen 1 und 20 liegen.");
  if(!Number.isInteger(Number(c.warmups))||!bounded(Number(c.warmups),0,5))
    throw Error("Aufwärmläufe müssen zwischen 0 und 5 liegen.");
  if(!bounded(Number(c.timeoutMs),1000,120000))throw Error("Timeout außerhalb des gültigen Bereichs.");
  if(!bounded(Number(c.regressionLimit),1,90))throw Error("Ungültige Regressionsschwelle.");
  if(c.source!=="synthetic")throw Error("Automatisierte Codec-Läufe benötigen die Quelle „Synthetisch“. Live-Quellen werden separat im Originalscanner ausgewertet.");
  if(c.engine==="gpu")throw Error("Die BeamFerry-Fountain-Engine bietet keinen GPU-Codec. Verwende CPU.");
  if(c.grid<=4&&Math.ceil((Number(c.fileSize)+512)/(Number(c.bytesPerQR)-20))>65535)
    throw Error("Der V1-Blockzähler wäre überschritten.");
  const numeric=["grid","fps","bytesPerQR","fileSize","seed","redundancy","lossPercent","duplicateEvery",
    "repetitions","warmups","timeoutMs","regressionLimit"];
  for(const key of numeric)c[key]=Number(c[key]);
  c.headless=!!c.headless;
  return c;
}
export function deterministicBytes(size,seed=13037,pattern="random") {
  const bytes=new Uint8Array(size);
  let state=(seed>>>0)||1;
  for(let i=0;i<size;i++){
    state^=state<<13;state^=state>>>17;state^=state<<5;
    bytes[i]=pattern==="zeros"?0:pattern==="repeating"?(i%17===0?65:66):state&255;
  }
  return bytes;
}
export function frameUpdates(grid,fps,frameIndex){
  if(frameIndex===0)return grid;
  if(grid>=8&&fps>60)return 4;
  if(grid===4&&fps>60)return 2;
  if(grid===2&&fps<50)return 1;
  return grid;
}
export function percentile(values,percent) {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const position=(sorted.length-1)*percent/100;
  const low=Math.floor(position),high=Math.ceil(position);
  return sorted[low]+(sorted[high]-sorted[low])*(position-low);
}
export function createMatrix(base,dimensions={},limit=120){
  const fields=["grid","fps","resolution","engine"];
  const options=fields.map(k=>[k,(dimensions[k]?.length?dimensions[k]:[base[k]])]);
  let total=options.reduce((n,[,values])=>n*values.length,1);
  if(total*Number(base.repetitions||1)>limit)throw Error("Die Matrix enthält "+total+" Kombinationen. Höchstens "+limit+" Läufe sind erlaubt. Wähle weniger Werte.");
  const output=[];
  function visit(index,current){
    if(index===options.length){output.push({...base,...current});return;}
    const [key,values]=options[index];
    for(const v of values)visit(index+1,{...current,[key]:v});
  }
  visit(0,{});
  return output;
}
export function comparableKeys(){
  return ["source","grid","fps","bytesPerQR","fileSize","seed","pattern","lossPercent","duplicateEvery",
    "redundancy","resolution","engine","headless"];
}
export function compareRuns(current,baseline,threshold=15){
  const diff=comparableKeys().filter(key=>current.config?.[key]!==baseline.config?.[key]);
  if(current.browser!==baseline.browser)diff.push("browser");
  if(current.executionType!==baseline.executionType)diff.push("executionType");
  if(current.status!=="erfolgreich"||baseline.status!=="erfolgreich")
    return {comparable:false,differences:[...diff,"status"],declinePercent:null};
  if(diff.length)return {comparable:false,differences:diff,declinePercent:null};
  const newer=current.metrics?.codecMiBs,older=baseline.metrics?.codecMiBs;
  if(!bounded(newer,0,Infinity)||!bounded(older,1e-12,Infinity))
    return {comparable:false,differences:["codecMiBs"],declinePercent:null};
  const declinePercent=(1-newer/older)*100;
  return {comparable:true,differences:[],declinePercent,regression:declinePercent>threshold};
}
export function toCSV(rows){
  const keys=["id","createdAt","status","executionType","source","device","browser","grid","fps",
    "bytesPerQR","resolution","engine","codecMiBs","goodputMiBs","meanDecodeMs","p95DecodeMs",
    "packets","unique","duplicates","dropped","requiredBlocks","recoveredBlocks","error"];
  const csvValue=value=>'"'+String(value??"").replaceAll('"','""')+'"';
  const data=rows.map(r=>({
    ...r,...r.config,...r.metrics,error:r.error||""
  }));
  return [keys.map(csvValue).join(";"),...data.map(r=>keys.map(k=>csvValue(r[k])).join(";"))].join("\r\n")+"\r\n";
}
export function makeId(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}
export function makeEnvironment(){
  const nav=globalThis.navigator;
  return {browser:nav?.userAgent||"Nicht verfügbar",device:nav?.platform||"Nicht verfügbar",
    cores:nav?.hardwareConcurrency??null, memoryGiB:nav?.deviceMemory??null,
    secure:globalThis.isSecureContext??null,webCodecs:typeof globalThis.VideoEncoder!=="undefined",
    webGPU:!!nav?.gpu,camera:!!nav?.mediaDevices?.getUserMedia,
    screen:!!nav?.mediaDevices?.getDisplayMedia};
}
export async function runCodecBenchmark(input,H,{signal,onProgress=()=>{},gate=async()=>{},version="unbekannt",environment=makeEnvironment()}={}){
  const c=validateConfig(input);
  if(!H?.LTEncoder||!H?.LTDecoder||!H?.packFile||!H?.packFrame||!H?.unpackFile)
    throw Error("Der originale QR-Turbo-Codec ist nicht geladen.");
  const begun=now(),sessionId=(c.seed%65534)+1;
  const original=deterministicBytes(c.fileSize,c.seed,c.pattern);
  const packed=await H.packFile("benchmark.bin","application/octet-stream",original);
  const data=packed.container;
  const headerSize=c.grid>=8?H.TURBO_HEADER_LEN||24:H.HEADER_LEN||20;
  const blockLen=c.bytesPerQR-headerSize;
  if(blockLen<1)throw Error("Nutzlast kleiner als Paketheader.");
  const k=Math.ceil(data.length/blockLen);
  if(k>(c.grid>=8?0xffffffff:65535))throw Error("Für diese Datei wären zu viele V1-Datenblöcke nötig.");
  const encoder=new H.LTEncoder(data,blockLen,sessionId);
  const decoder=new H.LTDecoder(k,blockLen,sessionId,data.length);
  const header={sessionId,k,blockLen,totalLen:data.length,payloadFnv:H.fnv1a(data),layoutCodes:c.grid,systematic:true};
  const durations=[],sent=new Set(),receive=new Set();
  const deadline=begun+c.timeoutMs;
  const budget=Math.min(200000,Math.max(k+2,Math.ceil(k*c.redundancy*2.6)));
  let generated=0,frames=0,lost=0,duplicates=0,accepted=0,parseErrors=0;
  let encMs=0,decMs=0,processingMs=0,changed=0;
  let lastProgress=begun;
  const source="synthetic";
  // Deterministic channel simulation, not a physical camera/optical measurement.
  for(let loop=0;generated<budget&&!decoder.isComplete;loop++){
    if(signal?.aborted)throw new DOMException("Test abgebrochen","AbortError");
    await gate();
    if(now()>deadline)throw Error("Benchmark-Zeitlimit überschritten.");
    const n=frameUpdates(c.grid,c.fps,frames);
    const frameStart=now();
    for(let tile=0;tile<n&&generated<budget&&!decoder.isComplete;tile++){
      const seqIndex=generated;
      const duplicate=c.duplicateEvery>0&&generated>0&&generated%c.duplicateEvery===0;
      const packetIndex=duplicate?seqIndex-1:seqIndex;
      const seq=packetIndex<k?(0x80000000|packetIndex)>>>0:(packetIndex-k)>>>0;
      const sendAt=now();
      const block=encoder.encode(seq);
      const payload=H.packFrame({...header,seq,tileIndex:tile%c.grid},block);
      encMs+=now()-sendAt;
      generated++;changed++;
      if(sent.has(seq))duplicates++;else sent.add(seq);
      const random=((Math.imul((generated^c.seed)>>>0,1664525)+1013904223)>>>0)%10000;
      if(random<c.lossPercent*100){lost++;continue;}
      const decodeAt=now();
      const parsed=H.parseFrame(payload);
      if(!parsed||parsed.header.k!==k||parsed.header.totalLen!==data.length) {
        parseErrors++;continue;
      }
      decoder.addFrame(parsed.header.seq,parsed.block);
      const elapsed=now()-decodeAt;
      decMs+=elapsed;durations.push(elapsed);
      accepted++;receive.add(seq);
    }
    frames++;processingMs+=now()-frameStart;
    if(now()-lastProgress>90||decoder.isComplete||frames%32===0){
      onProgress({generated,accepted,frames,solved:decoder.solvedCount,required:k,
        elapsedMs:now()-begun,changed,unique:receive.size,duplicates,missed:lost});
      lastProgress=now();
      // Keep the browser responsive while running a large test matrix.
      await yieldControl();
    }
  }
  const assembled=decoder.assemble();
  let verified=false,integrityError=null;
  if(assembled)try{
    if(H.fnv1a(assembled)!==header.payloadFnv)throw Error("Container-Prüfsumme stimmt nicht.");
    const unpacked=await H.unpackFile(assembled);
    const equal=unpacked.bytes?.length===original.length&&unpacked.bytes.every((value,i)=>value===original[i]);
    if(!equal)throw Error("Die wiederhergestellte Datei weicht vom Original ab.");
    if(H.verifyFile && !(await H.verifyFile(unpacked)))throw Error("SHA-256-Verifikation fehlgeschlagen.");
    verified=true;
  }catch(e){integrityError=String(e?.message||e);}
  const elapsedMs=Math.max(now()-begun,.001);
  const status=verified?"erfolgreich":"fehlgeschlagen";
  const result={
    id:makeId(),createdAt:new Date().toISOString(),version,source,
    executionType:"synthetischer Codec-End-to-End-Test",
    device:environment.device,browser:environment.browser,
    config:c,status,error:verified?null:integrityError||"Dateirekonstruktion unvollständig",
    metrics:{
      elapsedMs,codecMiBs:c.fileSize/(1024*1024)/(elapsedMs/1000),
      goodputMiBs:null,renderedFPS:null,qrDecodeFPS:null,
      generatedFPS:frames/(elapsedMs/1000),
      encoderSymbolsPerSec:generated/(elapsedMs/1000),
      packets:generated,accepted,unique:receive.size,duplicates,dropped:lost,
      requiredBlocks:k,recoveredBlocks:decoder.solvedCount,
      frames,changedTiles:changed,parseErrors,
      symbolYield:generated?receive.size/generated:null,
      fecOverhead:generated/k-1,
      encodeMs:encMs,decodeMs:decMs,processingMs,
      meanDecodeMs:durations.length?decMs/durations.length:null,
      medianDecodeMs:percentile(durations,50),p95DecodeMs:percentile(durations,95),
      p99DecodeMs:percentile(durations,99),
      cpuPercent:null,gpuPercent:null,thermalThrottling:null,memoryMiB:null,
      sha256Verified:verified
    },
    notes:[
      "FEC, Pakete und Datenintegrität wurden mit dem originalen V1-/V2-Codec gemessen.",
      "QR-Rasterbilder, reale Kameraerkennung und optischer Durchsatz wurden hier nicht gemessen.",
      c.fps>=90&&c.grid>=8?"Bei 90–120 FPS werden nur vier QR-Kacheln pro Frame aktualisiert.":"Alle QR-Kacheln werden pro Frame aktualisiert.",
      c.lossPercent?"Paketverluste sind deterministisch simuliert, nicht optisch gemessen.":"Keine künstlichen Paketverluste."
    ]
  };
  onProgress({generated,accepted,frames,solved:decoder.solvedCount,required:k,
    elapsedMs,unique:receive.size,duplicates,missed:lost,done:true});
  return result;
}
