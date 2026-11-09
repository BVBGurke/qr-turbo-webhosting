/**
 * QR Turbo WebM muxer for browser WebCodecs (VP8/VP9).
 * Generates a seekable WebM file with known duration and cluster cues.
 * No network requests, runtime dependencies, or real-time canvas capture.
 * TimecodeScale = 1,000,000 nanoseconds (1 ms).
 */
const IDS = Object.freeze({
  EBML:[0x1a,0x45,0xdf,0xa3], Segment:[0x18,0x53,0x80,0x67],
  Info:[0x15,0x49,0xa9,0x66], Tracks:[0x16,0x54,0xae,0x6b],
  Cluster:[0x1f,0x43,0xb6,0x75], Cues:[0x1c,0x53,0xbb,0x6b],
  TimestampScale:[0x2a,0xd7,0xb1], Duration:[0x44,0x89],
  MuxingApp:[0x4d,0x80], WritingApp:[0x57,0x41], TrackEntry:[0xae],
  TrackNumber:[0xd7], TrackUID:[0x73,0xc5], TrackType:[0x83],
  FlagLacing:[0x9c], DefaultDuration:[0x23,0xe3,0x83],
  CodecID:[0x86], Video:[0xe0], PixelWidth:[0xb0], PixelHeight:[0xba],
  Timestamp:[0xe7], SimpleBlock:[0xa3],
  CuePoint:[0xbb], CueTime:[0xb3], CueTrackPositions:[0xb7],
  CueTrack:[0xf7], CueClusterPosition:[0xf1],
  EBMLVersion:[0x42,0x86], EBMLReadVersion:[0x42,0xf7],
  EBMLMaxIDLength:[0x42,0xf2], EBMLMaxSizeLength:[0x42,0xf3],
  DocType:[0x42,0x82], DocTypeVersion:[0x42,0x87], DocTypeReadVersion:[0x42,0x85]
});

function concat(bytes) {
  let size = 0;
  for (const b of bytes) size += b.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const b of bytes) {out.set(b, at);at += b.length;}
  return out;
}
function vint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid EBML element size');
  for (let length=1;length<=8;length++) {
    const limit = 2**(7*length)-1;
    if (value < limit) {
      const bytes=new Uint8Array(length);
      let n=value;
      for(let i=length-1;i>=0;i--){bytes[i]=n%256;n=Math.floor(n/256);}
      bytes[0]|=2**(8-length);
      return bytes;
    }
  }
  throw Error('EBML element is too large');
}
function unsigned(value) {
  if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid unsigned value');
  const result=[];
  do {result.unshift(value%256);value=Math.floor(value/256);}while(value);
  return new Uint8Array(result);
}
function float64(value) {
  const b=new ArrayBuffer(8);
  new DataView(b).setFloat64(0,value,false);
  return new Uint8Array(b);
}
function str(text){return new TextEncoder().encode(text);}
function el(id,value) {
  const data = Array.isArray(value) ? concat(value) : value;
  const code = typeof id==='string' ? IDS[id] : id;
  if(!code)throw Error('Unknown EBML ID');
  return concat([new Uint8Array(code),vint(data.length),data]);
}
function num(id,v){return el(id,unsigned(v));}
function tag(id,text){return el(id,str(text));}

export class WebMWriter {
  constructor({width,height,fps,codec='vp8',duration}) {
    if(!Number.isInteger(width)||width<16||width>8192||!Number.isInteger(height)||height<16||height>8192)throw Error('Invalid WebM dimensions');
    if(!Number.isInteger(fps)||fps<1||fps>240)throw Error('Invalid WebM FPS');
    if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid WebM duration');
    if(!['vp8','vp9'].includes(codec))throw Error('Unsupported WebM codec');
    Object.assign(this,{width,height,fps,codec,duration});
    this.clusters=[];
    this.pending=[];
    this.clusterStart=null;
    this.frames=0;
  }
  add(chunk) {
    if(!chunk || typeof chunk.copyTo!=='function' || !Number.isFinite(chunk.timestamp))throw Error('Invalid encoded chunk');
    const ms=Math.max(0,Math.round(chunk.timestamp/1000));
    const key=chunk.type==='key';
    if(this.clusterStart!==null && (ms-this.clusterStart>=5000 || ms-this.clusterStart>30000)) {
      if(!key)throw Error('New WebM cluster requires a keyframe');
      this.flushCluster();
    }
    if(this.clusterStart===null){this.clusterStart=ms;this.pending=[num('Timestamp',ms)];}
    const delta=ms-this.clusterStart;
    if(delta>32767 ||delta<0)throw Error('WebM cluster timecode overflow');
    const bytes=new Uint8Array(chunk.byteLength+4);
    bytes[0]=0x81; // 1-byte VINT track 1
    bytes[1]=(delta>>8)&255;
    bytes[2]=delta&255;
    bytes[3]=key?0x80:0;
    chunk.copyTo(bytes.subarray(4));
    this.pending.push(el('SimpleBlock',bytes));
    this.frames++;
  }
  flushCluster() {
    if(this.clusterStart===null)return;
    this.clusters.push({time:this.clusterStart,data:el('Cluster',this.pending)});
    this.pending=[];
    this.clusterStart=null;
  }
  finish() {
    this.flushCluster();
    if(!this.frames)throw Error('No encoded video frames');
    const header=el('EBML',[
      num('EBMLVersion',1),num('EBMLReadVersion',1),
      num('EBMLMaxIDLength',4),num('EBMLMaxSizeLength',8),
      tag('DocType','webm'),num('DocTypeVersion',4),num('DocTypeReadVersion',2)
    ]);
    const info=el('Info',[
      num('TimestampScale',1_000_000),el('Duration',float64(this.duration*1000)),
      tag('MuxingApp','QR Turbo WebM writer'),tag('WritingApp','QR Turbo')
    ]);
    const track=el('TrackEntry',[
      num('TrackNumber',1),num('TrackUID',1),num('TrackType',1),
      num('FlagLacing',0),num('DefaultDuration',Math.round(1_000_000_000/this.fps)),
      tag('CodecID',this.codec==='vp9'?'V_VP9':'V_VP8'),
      el('Video',[num('PixelWidth',this.width),num('PixelHeight',this.height)])
    ]);
    const tracks=el('Tracks',[track]);
    let offset=info.length+tracks.length;
    const cues=el('Cues',this.clusters.map(cluster=>{
      const cue=el('CuePoint',[
        num('CueTime',cluster.time),
        el('CueTrackPositions',[num('CueTrack',1),num('CueClusterPosition',offset)])
      ]);
      offset+=cluster.data.length;
      return cue;
    }));
    const payloadLen=info.length+tracks.length+
      this.clusters.reduce((sum,cluster)=>sum+cluster.data.length,0)+cues.length;
    const segmentHeader=concat([new Uint8Array(IDS.Segment),vint(payloadLen)]);
    const parts=[header,segmentHeader,info,tracks,...this.clusters.map(c=>c.data),cues];
    this.clusters=[];this.pending=[];
    return new Blob(parts,{type:'video/webm'});
  }
}
