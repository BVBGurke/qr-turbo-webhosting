/**
 * QR Turbo website builder.
 * Downloads a pinned MIT-licensed BeamFerry revision, builds its original
 * high-speed codec without modification, and wraps it in an English user-friendly interface.
 * Node.js 22+, Git and network access are required when building.
 * The FINISHED dist/ directory requires no backend or runtime dependencies.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { addVideoRoutes } from './video-routes.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(project, 'dist');
const upstreamCache = join(project, '.cache', 'beamferry');
const upstream = process.env.UPSTREAM_DIR ? resolve(process.env.UPSTREAM_DIR) : upstreamCache;
const UPSTREAM_REPO = 'https://github.com/shuipashui/beamferry.git';
// Pinned source, confirmed upstream commit on 2026-11-09. Override with UPSTREAM_REF=main.
const UPSTREAM_REF = process.env.UPSTREAM_REF || '44d8c9b64c920183f5f250a6d9deb1978a385004';

function run(executable, args, cwd = project) {
  console.log('$', [executable, ...args].join(' '));
  execFileSync(executable, args, { cwd, stdio: 'inherit', env: process.env });
}
function requireFile(path) {
  if (!existsSync(path)) throw new Error(`Missing upstream file: ${path}`);
}
function copyFile(src, dst) {
  requireFile(src);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}
function patch(path, edits) {
  let html = readFileSync(path, 'utf8');
  for (const [find, replace] of edits) {
    if (!html.includes(find)) throw new Error(`Upstream changed; patch not found in ${path}: ${find.slice(0, 100)}`);
    html = html.replaceAll(find, replace);
  }
  writeFileSync(path, html);
}

// English translations are applied longest-first, including runtime status messages.
const TRANSLATIONS = JSON.parse(readFileSync(join(project, 'scripts', 'translations.json'), 'utf8'));
const SORTED_TRANSLATIONS = Object.entries(TRANSLATIONS).sort((a, b) => b[0].length - a[0].length);
function translateUI(path) {
  let content = readFileSync(path, 'utf8');
  for (const [source, translated] of SORTED_TRANSLATIONS) content = content.split(source).join(translated);
  writeFileSync(path, content);
}
function addCommonUI(path, mode) {
  let html = readFileSync(path, 'utf8');
  const base = mode === 'send' ? '../' : '../';
  const navigation = `<nav class="turbo-nav" aria-label="Main navigation">
  <a class="turbo-logo" href="${base}">◈ QR <b>Turbo</b></a>
  <div class="turbo-links">
    <a href="${base}send/" class="${mode==='send'?'active':''}">Send</a>
    <a href="${base}receive/" class="${mode==='receive'?'active':''}">Camera</a>
    <a href="${base}screen/" class="${mode==='screen'?'active':''}">Screen</a>
    <a href="${base}export/" class="">Export Video</a>
    <a href="${base}import/" class="">Import Video</a>
  </div>
  <a class="turbo-home" href="${base}">Home ↗</a>
  </nav>`;
  html = html.replace('<body>', '<body>' + navigation);
  html = html.replace('</head>', '<link rel="stylesheet" href="../ui.css"></head>');
  html = html.replace(/<html lang="[^"]*">/, '<html lang="en">');
  // Keep technical controls available without overwhelming first-time visitors.
  if (mode === 'send') {
    html = html.replace('<section class="control-card"', '<details class="turbo-advanced"><summary>Advanced transfer settings <span>▾</span></summary><section class="control-card"');
    html = html.replace('</section>\n      <div class="actions">', '</section></details>\n      <div class="actions">');
  } else {
    html = html.replace(/<section class="card (compact-card|missing-card)">/, '<details class="turbo-advanced turbo-diagnostics"><summary>Advanced diagnostics & missing blocks <span>▾</span></summary><section class="card $1">');
    html = html.replace(/(<section class="card diagnostics">[\s\S]*?<\/section>)/, '$1</details>');
    html = html.replace('<div class="fps-switch"', '<div class="fps-switch"');
  }
  html = html.replace('</body>', '<script src="../ui.js" defer></script></body>');
  writeFileSync(path, html);
}

try {
  if (!process.env.UPSTREAM_DIR) {
    rmSync(upstreamCache, { recursive: true, force: true });
    mkdirSync(upstreamCache, { recursive: true });
    run('git', ['init', '--quiet'], upstreamCache);
    run('git', ['remote', 'add', 'origin', UPSTREAM_REPO], upstreamCache);
    run('git', ['fetch', '--depth', '1', 'origin', UPSTREAM_REF], upstreamCache);
    run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], upstreamCache);
  }
  requireFile(join(upstream, 'LICENSE'));
  if (process.env.SKIP_UPSTREAM_BUILD !== '1') {
    run('npm', ['ci', '--no-audit', '--no-fund'], upstream);
    run('npm', ['run', 'build'], upstream);
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  copyFile(join(project, 'site'), output);
  copyFile(join(upstream, 'web-receiver'), join(output, 'receive'));
  copyFile(join(upstream, 'desktop-receiver'), join(output, 'screen'));
  copyFile(join(upstream, 'sender', 'dist', 'beamferry-sender.html'), join(output, 'send', 'index.html'));
  copyFile(join(upstream, 'LICENSE'), join(output, 'licenses', 'BEAMFERRY-MIT.txt'));
  copyFile(join(upstream, 'THIRD_PARTY_NOTICES.md'), join(output, 'licenses', 'THIRD_PARTY_NOTICES.md'));

  // Replace upstream's dense Chinese-language help paragraph with a concise English guide.
  const senderHelp = join(output, 'send', 'index.html');
  let helpHtml = readFileSync(senderHelp, 'utf8');
  helpHtml = helpHtml.replace(/<details class="guide">[\s\S]*?<\/details>/, '<details class="guide"><summary>Performance tips & compatibility</summary><p class="tip">Start with four QR codes at 2068 B and 30 FPS. If your camera struggles, use fullscreen or reduce bytes per code to 1465 B. High frame rates are experimental. Dual-code mode is intended for the Android receiver. Press Space to pause playback.</p></details>');
  writeFileSync(senderHelp, helpHtml);
  // Critical: the sender's embedded QR URL MUST point to the self-hosted receiver.
  patch(join(output, 'send', 'index.html'), [
    ['const RECEIVER_URL = "https://shuipashui.github.io/beamferry/";', 'const RECEIVER_URL = new URL("../receive/", location.href).href;'],
  ]);
  // The upstream receiver assumes a different directory layout.
  patch(join(output, 'receive', 'index.html'), [
    ['href="sender/dist/beamferry-sender.html"', 'href="../send/"'],
  ]);
  patch(join(output, 'screen', 'index.html'), [
    ['href="../sender/dist/beamferry-sender.html"', 'href="../send/"'],
  ]);
  for (const file of ['send/index.html','receive/index.html','screen/index.html','receive/app.js','screen/app.js']) {
    translateUI(join(output, file));
  }
  for (const [mode, path] of [['send','send/index.html'], ['receive','receive/index.html'], ['screen','screen/index.html']]) addCommonUI(join(output, path), mode);
  addVideoRoutes(output);
  for (const path of ['receive', 'screen']) {
    const manifestFile = join(output, path, 'manifest.webmanifest');
    if (existsSync(manifestFile)) {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
      manifest.lang = 'en';
      manifest.name = path === 'screen' ? 'QR Turbo – Screen Receiver' : 'QR Turbo – Camera Receiver';
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    }
  }
  writeFileSync(join(output, '_headers'), [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: microphone=(), geolocation=()',
    '',
    '/*.wasm',
    '  Cache-Control: public, max-age=604800',
    '',
  ].join('\n'));
  writeFileSync(join(output, 'build-info.json'), JSON.stringify({
    app: 'QR Turbo',
    basedOn: 'shuipashui/beamferry',
    upstreamRef: process.env.UPSTREAM_DIR ? 'local checkout' : UPSTREAM_REF,
    createdAt: new Date().toISOString(),
    note: 'The original BeamFerry QR protocol and WASM decoder are used unchanged.',
  }, null, 2));
  for (const rel of ['index.html', 'send/index.html', 'receive/index.html', 'screen/index.html', 'receive/vendor/decimen/zxing_reader-EOacYbLr.wasm', 'export/index.html', 'import/index.html', 'video-export.js', 'video-import.js']) {
    requireFile(join(output, rel));
  }
  const sender = readFileSync(join(output, 'send', 'index.html'), 'utf8');
  if (sender.includes('const RECEIVER_URL = "https://shuipashui.github.io')) throw new Error('Self-hosted receiver URL was not replaced.');
  console.log(`\nREADY: ${output}\nUpload the entire dist/ directory to your HTTPS host.`);
} catch (error) {
  console.error('\nBUILD FAILED:', error.message);
  console.error('Check Node.js 22+, Git, internet access during build, and the upstream file layout.');
  process.exitCode = 1;
}