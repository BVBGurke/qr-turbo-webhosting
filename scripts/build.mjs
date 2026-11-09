/**
 * QR Turbo website builder.
 * Downloads a pinned MIT-licensed BeamFerry revision, builds its original
 * high-speed codec without modification, and wraps it in a German landing page.
 * Node.js 22+, Git and network access are required when building.
 * The FINISHED dist/ directory requires no backend or runtime dependencies.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
  if (!existsSync(path)) throw new Error(`Fehlende Upstream-Datei: ${path}`);
}
function copyFile(src, dst) {
  requireFile(src);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}
function patch(path, edits) {
  let html = readFileSync(path, 'utf8');
  for (const [find, replace] of edits) {
    if (!html.includes(find)) throw new Error(`Upstream-Datei geändert; Patch nicht gefunden in ${path}: ${find.slice(0, 100)}`);
    html = html.replaceAll(find, replace);
  }
  writeFileSync(path, html);
}

// Only user-interface copy is translated; the upstream coding algorithm is untouched.
const TRANSLATIONS = [
  ['手机网页接收端 v94 · 单码 / 四码', 'Handy-Empfänger · 1 oder 4 QR-Codes'],
  ['电脑屏幕接收端 · 单码 / 四码', 'Bildschirm-Empfänger · 1 oder 4 QR-Codes'],
  ['选择或拖入一个或多个文件', 'Datei auswählen oder hierher ziehen'],
  ['生成二维码流', 'QR-Stream vorbereiten'],
  ['二维码流已生成，可开始播放', 'QR-Stream bereit – Wiedergabe starten'],
  ['正在生成二维码流', 'QR-Stream wird erstellt'],
  ['四码需全部进入取景框，边缘留少量空白', 'Alle vier QR-Codes vollständig mit etwas Rand ins Bild nehmen'],
  ['推荐发送端：四码 · 2068 B · 30 FPS。四个码完整入镜后保持手机稳定。', 'Empfohlen: 4 QR-Codes · 2068 B · 30 FPS. Smartphone ruhig halten.'],
  ['扫码后直接打开接收页面', 'QR-Code scannen, um die Empfängerseite zu öffnen'],
  ['选择文件并生成二维码流后，此入口会自动隐藏', 'Dieser Link wird nach dem Vorbereiten der Datei ausgeblendet'],
  ['点击“选择屏幕源”，然后选择正在播放 BeamFerry 二维码的屏幕、窗口或浏览器标签页', 'Bildschirmquelle auswählen und den Tab oder Bildschirm mit dem QR-Stream freigeben'],
  ['仅使用屏幕捕获，不访问摄像头。建议优先选择二维码所在的窗口或标签页，并确保完整画面未被裁切。浏览器要求页面运行在 HTTPS 或 localhost。', 'Nur Bildschirmfreigabe, keine Kamera. Bitte das Fenster mit den vollständigen QR-Codes auswählen. HTTPS oder localhost erforderlich.'],
  ['参数说明与兼容性', 'Einstellungen und Kompatibilität'],
  ['传输设置', 'Übertragungseinstellungen'],
  ['每帧数据', 'Daten je QR-Code'],
  ['播放帧率', 'Wiedergabe-FPS'],
  ['二维码布局', 'QR-Layout'],
  ['单码（兼容）', 'Einzel-QR (kompatibel)'],
  ['四码（多码吞吐）', 'Vier QR-Codes (schnell)'],
  ['双码（上排）', 'Zwei QR-Codes (oben)'],
  ['开始播放', 'Abspielen'],
  ['继续播放', 'Fortsetzen'],
  ['暂停', 'Pause'],
  ['退出全屏', 'Vollbild verlassen'],
  ['全屏', 'Vollbild'],
  ['等待文件', 'Warte auf Datei'],
  ['文件已选择', 'Datei ausgewählt'],
  ['正在读取文件', 'Datei wird gelesen'],
  ['传输', 'Transfer'],
  ['会话', 'Sitzung'],
  ['片段', 'Blöcke'],
  ['重置', 'Zurücksetzen'],
  ['状态', 'Status'],
  ['文件', 'Datei'],
  ['进度', 'Fortschritt'],
  ['速度 / 扫描', 'Geschwindigkeit / Scans'],
  ['开始扫描', 'Scan starten'],
  ['选择屏幕源', 'Bildschirm auswählen'],
  ['停止', 'Stoppen'],
  ['清空进度', 'Fortschritt löschen'],
  ['相机', 'Kamera'],
  ['捕获', 'Aufnahme'],
  ['缺失片段', 'Fehlende Blöcke'],
  ['复制编号', 'Nummern kopieren'],
  ['诊断信息', 'Diagnose'],
  ['复制诊断', 'Diagnose kopieren'],
  ['文件已恢复', 'Datei wiederhergestellt'],
  ['下载文件', 'Datei speichern'],
  ['打开接收端', 'Empfänger öffnen'],
  ['打开发送端', 'Sender öffnen'],
  ['手机网页接收端', 'Handy-Empfänger'],
  ['离线二维码文件发送端', 'Offline-QR-Sender'],
  ['对准电脑上的二维码', 'QR-Codes am Computer scannen'],
  ['正在打开摄像头', 'Kamera wird geöffnet'],
  ['正在高速扫描', 'Highspeed-Scan läuft'],
  ['正在加载解码器', 'Decoder wird geladen'],
  ['正在快速扫描', 'Schneller Scan läuft'],
  ['正在扫描', 'Scan läuft'],
  ['摄像头权限被拒绝', 'Kamerazugriff verweigert'],
  ['摄像头不可用', 'Kamera nicht verfügbar'],
  ['请在 HTTPS 页面中允许摄像头权限', 'Kamera auf HTTPS-Seite erlauben'],
  ['等待开始', 'Bereit'],
  ['接收完成', 'Empfang abgeschlossen'],
  ['接收中', 'Empfang läuft'],
  ['正在校验', 'Datei wird geprüft'],
  ['高速接收中', 'Highspeed-Empfang läuft'],
  ['高速流校验失败', 'Highspeed-Datenprüfung fehlgeschlagen'],
  ['文件 SHA-256 校验失败', 'SHA-256-Prüfung fehlgeschlagen'],
  ['喷泉码接收中，无需等待指定片段', 'Fountain-Coding aktiv – verlorene Frames werden ausgeglichen'],
  ['实时', 'Live'],
  ['滚动', 'Gleitend'],
  ['平均', 'Durchschnitt'],
  ['推荐四码', 'Empfohlen: vier Codes'],
  ['理论速度', 'Theoretische Rate'],
  ['生成失败', 'Erstellung fehlgeschlagen'],
  ['正在循环播放', 'Wiedergabe in Schleife'],
  ['合计超过 64 MB', 'Gesamtgröße über 64 MB'],
  ['仅在本机处理 · 不会上传', 'Nur lokal verarbeitet · kein Upload'],
  ['复制失败', 'Kopieren fehlgeschlagen'],
  ['已暂停', 'Pausiert'],
];
function translateUI(path) {
  let content = readFileSync(path, 'utf8');
  for (const [chinese, german] of TRANSLATIONS) content = content.replaceAll(chinese, german);
  writeFileSync(path, content);
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
  for (const path of ['receive', 'screen']) {
    const manifestFile = join(output, path, 'manifest.webmanifest');
    if (existsSync(manifestFile)) {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
      manifest.lang = 'de';
      manifest.name = path === 'screen' ? 'QR Turbo – Bildschirmempfang' : 'QR Turbo – Kameraempfang';
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
  for (const rel of ['index.html', 'send/index.html', 'receive/index.html', 'screen/index.html', 'receive/vendor/decimen/zxing_reader-EOacYbLr.wasm']) {
    requireFile(join(output, rel));
  }
  const sender = readFileSync(join(output, 'send', 'index.html'), 'utf8');
  if (sender.includes('const RECEIVER_URL = "https://shuipashui.github.io')) throw new Error('Selbsthosting-URL wurde nicht ersetzt.');
  console.log(`\nFERTIG: ${output}\nDieses dist/-Verzeichnis vollständig auf HTTPS-Hosting hochladen.`);
} catch (error) {
  console.error('\nBUILD FEHLGESCHLAGEN:', error.message);
  console.error('Prüfe Node.js 22+, Git, Internetzugang beim Build und die Upstream-Struktur.');
  process.exitCode = 1;
}