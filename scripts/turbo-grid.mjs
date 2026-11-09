import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
function patch(file,before,after){
 const source=readFileSync(file,'utf8');
 if(!source.includes(before))throw Error('Turbo Grid patch missing: '+file+' '+before.slice(0,70));
 writeFileSync(file,source.replace(before,after));
}
const senderEdits=[
  [
    "<option value=\"dual\">",
    "<option value=\"octa\">8 QR codes · Turbo V2</option><option value=\"hexadeca\">16 QR codes · Turbo V2</option><option value=\"dual\">"
  ],
  [
    "    ]\n  };\n  const CHUNK_CHOICES = {",
    "    ],\n    octa: [[\"20\",\"20 FPS\"],[\"24\",\"24 FPS\"],[\"30\",\"30 FPS\"],[\"50\",\"50 FPS\"],[\"60\",\"60 FPS\"],[\"90\",\"90 FPS · experimental\"],[\"120\",\"120 FPS · experimental\"]],\n    hexadeca: [[\"20\",\"20 FPS\"],[\"24\",\"24 FPS\"],[\"30\",\"30 FPS\"],[\"50\",\"50 FPS\"],[\"60\",\"60 FPS\"],[\"90\",\"90 FPS · experimental\"],[\"120\",\"120 FPS · experimental\"]]\n  };\n  const CHUNK_CHOICES = {"
  ],
  [
    "    ]\n  };\n  const HIGH_QUEUE_LIMIT = 8;",
    "    ],\n    octa: [[\"1003\",\"1003 B\"],[\"1273\",\"1273 B\"],[\"1465\",\"1465 B\"],[\"1732\",\"1732 B · dense\"],[\"2068\",\"2068 B · experimental\"]],\n    hexadeca: [[\"1003\",\"1003 B\"],[\"1273\",\"1273 B\"],[\"1465\",\"1465 B · dense\"]]\n  };\n  const HIGH_QUEUE_LIMIT = 8;"
  ],
  [
    "  function codesForMode(mode) {\n",
    "  function codesForMode(mode) {\n    if (mode === \"octa\") return 8;\n    if (mode === \"hexadeca\") return 16;\n"
  ],
  [
    "  function layoutShape(codes) {\n",
    "  function layoutShape(codes) {\n    if (codes === 8) return {columns:4,rows:2,quiet:4};\n    if (codes === 16) return {columns:4,rows:4,quiet:4};\n"
  ],
  [
    "  function nextScreenJob() {\n",
    "  function nextScreenJob() {\n    if (codesPerScreen >= 8) {\n      const seed = highNextSeq === 0;\n      const full = seed || Number(fps.value) <= 60;\n      const bank = (highNextQuadRotation++) % (codesPerScreen / 4);\n      const origin = bank * 4;\n      const chosen = full ? Array.from({length:codesPerScreen},(_,i)=>i) : [origin,origin+1,origin+2,origin+3];\n      const rotation = full ? highNextQuadRotation % codesPerScreen : 0;\n      const indices = chosen.map(i => (i+rotation)%codesPerScreen);\n      const packed = indices.map(i=>takePackedCode(i));\n      return {indices,seqs:packed.map(p=>p.seq),packed};\n    }\n"
  ],
  [
    "  function takePackedCode() {\n",
    "  function takePackedCode(tileIndex = 0) {\n"
  ],
  [
    "    const bytes = H.packFrame({ ...transfer.header, seq }, transfer.encoder.encode(seq));",
    "    const bytes = H.packFrame({ ...transfer.header, seq, tileIndex }, transfer.encoder.encode(seq));"
  ],
  [
    "    if ((codesPerScreen === 4 || codesPerScreen === 2) && item.indices) {",
    "    if (codesPerScreen >= 2 && item.indices) {"
  ],
  [
    "      livePatterns = [null, null, null, null];",
    "      livePatterns = Array(codesPerScreen === 2 ? 4 : codesPerScreen).fill(null);"
  ],
  [
    "    return (codesPerScreen === 2 || codesPerScreen === 4) && target > 0 && target < refresh && refresh % target !== 0;",
    "    return codesPerScreen >= 2 && target > 0 && target < refresh && refresh % target !== 0;"
  ],
  [
    "    if (codesPerScreen === 4 || dualStaggers()) return Math.max(1, Math.round(vsyncsPerQr / 2));",
    "    if (codesPerScreen === 4 || dualStaggers()) return Math.max(1, Math.round(vsyncsPerQr / 2));\n    if (codesPerScreen >= 8) return vsyncsPerQr;"
  ],
  [
    "    while (highQueue.length + encodeInflight < HIGH_QUEUE_LIMIT) {",
    "    while (highQueue.length + encodeInflight < (codesPerScreen >= 8 ? 5 : HIGH_QUEUE_LIMIT)) {"
  ],
  [
    "      const blockLen = effectiveFrameBytes - H.HEADER_LEN;",
    "      const blockLen = effectiveFrameBytes - (codesPerScreen >= 8 ? H.TURBO_HEADER_LEN : H.HEADER_LEN);"
  ],
  [
    "    const header = H?.HEADER_LEN || HEADER_LEN;",
    "    const header = codes >= 8 ? H.TURBO_HEADER_LEN : (H?.HEADER_LEN || HEADER_LEN);"
  ],
  [
    "    if (layout === \"dual\") return \"2068\";",
    "    if (layout === \"dual\" || layout === \"octa\") return \"2068\";\n    if (layout === \"hexadeca\") return \"1465\";"
  ],
  [
    "    if (layout === \"quad\" && hz < 90) cap = Math.min(cap, 30);",
    "    if (layout === \"quad\" && hz < 90) cap = Math.min(cap, 30);\n    if (layout === \"octa\" || layout === \"hexadeca\") cap = Math.min(cap, 30);"
  ],
  [
    "    if (rate.codes === 2) text += \"。双码只占 2×2 上排。",
    "    if (rate.codes >= 8) text += \" · Turbo V2 \" + rate.codes + \"-code grid. 90/120 FPS updates banks of four. Receiver, resolution and refresh rate determine actual throughput.\";\n    if (rate.codes === 2) text += \"。双码只占 2×2 上排。"
  ],
  [
    "      if (quadRefreshesAll()) {\n        await waitForQueueDepth(1);",
    "      if (codesPerScreen >= 8) {\n        await waitForQueueDepth(1);\n        paintQueued(highQueue.shift());\n        pumpEncode();\n        await waitForQueueDepth(3);\n      } else if (quadRefreshesAll()) {\n        await waitForQueueDepth(1);"
  ],
  [
    "      frameText.textContent = \"0 / \" + transfer.total;",
    "      frameText.textContent = codesPerScreen + \" codes · 0 / \" + transfer.total;"
  ],
  [
    "    const playing = codesPerScreen === 4",
    "    const playing = codesPerScreen >= 8 ? \"Playing Turbo V2 · \" + codesPerScreen + \" codes\" : codesPerScreen === 4"
  ],
  [
    "    frameText.textContent = codesPerScreen === 4\n",
    "    frameText.textContent = codesPerScreen >= 8 ? codesPerScreen + \" codes · \" + emitted + \" / \" + transfer.total + \" blocks\" : codesPerScreen === 4\n"
  ]
];
export function addTurboGrid(output) {
  const sender=join(output,'send','index.html');
  patch(sender,'</script>\n  <script>(() => {\n  const H = window.AirFerryHighSpeed;',
    '</script>\n  <script src="../turbo-protocol.js"></script>\n  <script>(() => {\n  const H = window.AirFerryHighSpeed;');
  for(const [before,after] of senderEdits) patch(sender,before,after);
  for(const route of ['receive','screen']){
    const html=join(output,route,'index.html');
    patch(html,'<script src="highspeed-protocol.js"></script>',
      '<script src="highspeed-protocol.js"></script>\n  <script src="../turbo-protocol.js"></script>');
  }
}
