/**
 * Removes fixed 64 MiB upload caps, but preserves genuine on-wire bounds.
 * Original/transmitted sizes are uint32, QR frame count is uint16.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function replaceRequired(path, needle, replacement) {
  const old = readFileSync(path, 'utf8');
  if (!old.includes(needle)) throw new Error('Missing upstream size-limit anchor in ' + path + ': ' + needle.slice(0,70));
  writeFileSync(path, old.replace(needle, replacement));
}
function expandProtocol(path, isSender = false) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes('globalThis.AirFerryHighSpeed=Object.freeze(')) throw new Error('Protocol signature missing: '+path);
  const count = source.split('67108864').length - 1;
  if (count !== (isSender ? 5 : 4)) throw new Error('Unexpected original limit count in '+path+': '+count);
  writeFileSync(path, source.replaceAll('67108864','4294967295').replace('const v="64 MB"','const v="4 GiB protocol range"'));
}
function fixSender(path) {
  replaceRequired(path, '    const limit = H && H.MAX_FILE_BYTES || 4294967295;\n', '');
  replaceRequired(path, '    if (total > limit) throw new Error("合计超过 64 MB");\n', '');
  replaceRequired(path, '    if (!selected.length) throw new Error("请先选择文件");',
    '    if (!selected.length) throw new Error("请先选择文件");\n' +
    '    if (!Number.isSafeInteger(total) || total >= 0xffffffff) throw new Error("This exceeds the 32-bit transfer format; split the file.");');
  replaceRequired(path, '      const encoder = new H.LTEncoder(packed.container, blockLen, sessionId);',
    '      // Protocol stores k as uint16. Validate it using the selected QR payload.\n' +
    '      const requiredBlocks = Math.ceil(packed.container.length / blockLen);\n' +
    '      if (codesPerScreen < 8 && requiredBlocks > 0xffff) {\n' +
    '        const capacityMiB = (0xffff * blockLen / 1048576).toFixed(1);\n' +
    '        throw new Error("This file needs " + requiredBlocks.toLocaleString() +\n' +
    '          " QR blocks; the protocol supports 65,535 (" + capacityMiB +\n' +
    '          " MiB at this payload). Choose a larger Bytes per code setting or split the file.");\n' +
    '      }\n' +
    '      const encoder = new H.LTEncoder(packed.container, blockLen, sessionId);');
}
function fixReceiver(path) {
  replaceRequired(path, '  const MAX_FILE_SIZE = 64 * 1024 * 1024;',
    '  const MAX_FILE_SIZE = 0xffffffff; // uint32 protocol length; not a fixed browser upload cap');
  replaceRequired(path, '    const { header, block } = parsed;',
    '    const { header, block } = parsed;\n' +
    '    // Ignore inconsistent QR frame headers before allocating recovery buffers.\n' +
    '    if (!header.blockLen || header.k !== Math.ceil(header.totalLen / header.blockLen)) {\n' +
    '      status.textContent = "Invalid transfer header. Check the QR source.";\n' +
    '      return;\n' +
    '    }');
}
export function removeFixedTransferCaps(output) {
  const sender = join(output, 'send', 'index.html');
  expandProtocol(sender, true);
  expandProtocol(join(output, 'receive', 'highspeed-protocol.js'));
  expandProtocol(join(output, 'screen', 'highspeed-protocol.js'));
  fixSender(sender);
  fixReceiver(join(output, 'receive', 'app.js'));
  fixReceiver(join(output, 'screen', 'app.js'));
}
