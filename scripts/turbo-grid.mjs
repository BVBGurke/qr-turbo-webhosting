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
    "    rateHint.textContent = text;",
    "    if (rate.codes >= 8) text += \" · Turbo V2 \" + rate.codes + \"-code grid. High FPS updates groups of four. Physical resolution and decoder throughput limit the real rate.\";\n    rateHint.textContent = text;"
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
  ],
  [
    "          layoutCodes: codesPerScreen === 1 ? 1 : codesPerScreen === 2 ? 2 : 4,",
    "          layoutCodes: codesPerScreen, // V1: 1/2/4, V2: 8/16"
  ]
];
export function addTurboGrid(output) {
  const sender=join(output,'send','index.html');
  patch(sender,'</script>\n  <script>(() => {\n  const H = window.AirFerryHighSpeed;',
    '</script>\n  <script src="../turbo-protocol.js"></script>\n  <script>(() => {\n  const H = window.AirFerryHighSpeed;');
  for(const [before,after] of senderEdits) patch(sender,before,after);
  // Explicit universal FPS selection in Advanced settings, including 16 QR / 120 FPS.
  // QR payloads above 2068 bytes remain single-code only: multi-tile decoding is denser.
  patch(sender,'  const HIGH_QUEUE_LIMIT = 8;', [
    '  const ALL_FPS = [10,12,15,20,24,30,50,60,90,120].map(n=>[String(n),n+" FPS"+(n>60?" · experimental":"")]);',
    '  const MULTI_PAYLOADS = [1003,1273,1465,1732,1952,2068].map(n=>[String(n),n+" B"+(n>1465?" · dense":"")]);',
    '  const SINGLE_PAYLOADS = [...MULTI_PAYLOADS,["2331","2331 B"],["2953","2953 B"]];',
    '  for(const name of ["single","dual","quad","octa","hexadeca"]){FPS_CHOICES[name]=ALL_FPS;CHUNK_CHOICES[name]=name==="single"?SINGLE_PAYLOADS:MULTI_PAYLOADS;}',
    '  const HIGH_QUEUE_LIMIT = 8;'
  ].join("\n"));
  patch(sender,'<details class="turbo-advanced">',"<section class=\"turbo-presets\" aria-label=\"Quick transfer presets\">\n  <div class=\"turbo-presets-heading\"><div><span class=\"turbo-presets-kicker\">STEP 2 · SPEED PROFILE</span><h3>Choose a transfer preset</h3></div><span class=\"turbo-presets-hint\">One tap to configure</span></div>\n  <div class=\"turbo-presets-grid\" role=\"group\" aria-label=\"Preset selection\">\n    <button type=\"button\" data-turbo-profile=\"safe\" aria-pressed=\"false\"><span class=\"turbo-preset-title\">Reliable</span><small>1 QR · 24 FPS</small></button>\n    <button type=\"button\" data-turbo-profile=\"quad\" aria-pressed=\"false\"><span class=\"turbo-preset-title\">Balanced</span><small>4 QR · 30 FPS</small></button>\n    <button type=\"button\" data-turbo-profile=\"octa\" aria-pressed=\"false\"><span class=\"turbo-preset-title\">Turbo</span><small>8 QR · 30 FPS</small></button>\n    <button type=\"button\" data-turbo-profile=\"hexadeca\" aria-pressed=\"false\"><span class=\"turbo-preset-title\">Extreme</span><small>16 QR · 30 FPS</small></button>\n    <button type=\"button\" data-turbo-profile=\"overdrive\" aria-pressed=\"false\"><span class=\"turbo-preset-title\">Overdrive</span><small>16 QR · 120 FPS</small></button>\n    <button type=\"button\" data-turbo-custom aria-pressed=\"false\"><span class=\"turbo-preset-title\">Custom</span><small>Choose every setting ↗</small></button>\n  </div>\n  <p class=\"turbo-profile-info\" id=\"turboProfileInfo\" role=\"status\" aria-live=\"polite\">Choose a preset or expand Advanced settings to customize everything.</p>\n</section>"+'<details class="turbo-advanced" id="liveAdvancedSettings">');
  for(const route of ['send','receive','screen','import']){
    const html=join(output,route,'index.html');
    patch(html,'</head>','<link rel="stylesheet" href="../turbo-grid.css"></head>');
    patch(html,'</body>','<script defer src="../turbo-grid-ui.js"></script></body>');
  }
  for(const route of ['receive','screen','import']){
    const html=join(output,route,'index.html');
    patch(html,'<script src="highspeed-protocol.js"></script>',
      '<script src="highspeed-protocol.js"></script>\n  <script src="../turbo-protocol.js"></script>');
  }
}
