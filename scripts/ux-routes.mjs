import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const routes = {
  send: { title: 'Send files', description: 'Send files live or save them as an animated QR video.' },
  receive: { title: 'Receive with camera', description: 'Scan the sending screen using your phone camera.' },
  screen: { title: 'Receive from screen', description: 'Capture a tab, window, or display and decode its QR stream.' },
  import: { title: 'Import QR video', description: 'Recover the original file from a recorded QR video.' },
};

function navigation(active) {
  const tabs = [
    ['send', 'Send'], ['receive', 'Camera'], ['screen', 'Screen'], ['import', 'Import video']
  ];
  const links = tabs.map(([key, text]) =>
    '<a href="../' + key + '/" class="turbo-tab' + (active === key ? ' active' : '') +
    '"' + (active === key ? ' aria-current="page"' : '') + '>' + text + '</a>'
  ).join('');
  return '<nav class="turbo-nav" aria-label="Main navigation">' +
    '<a class="turbo-logo" href="../" aria-label="QR Turbo home"><span class="turbo-mark" aria-hidden="true">◈</span>QR <b>Turbo</b></a>' +
    '<div class="turbo-links" id="turboNavLinks">' + links + '</div>' +
    '<a class="turbo-home" href="../">Home</a></nav>';
}

function addAsset(html, name) {
  const tag = name.endsWith('.css') ? '<link rel="stylesheet" href="../' + name + '">' :
    '<script src="../' + name + '" defer></script>';
  const anchor = name.endsWith('.css') ? '</head>' : '</body>';
  if (html.includes(tag)) return html;
  if (!html.includes(anchor)) throw new Error('Missing HTML asset anchor: ' + anchor);
  return html.replace(anchor, tag + '\n' + anchor);
}

function enhancePage(html, mode) {
  const data = routes[mode];
  const nav = /<nav class="turbo-nav"[\s\S]*?<\/nav>/;
  if (!nav.test(html)) throw new Error('Main navigation not found: ' + mode);
  html = html.replace(nav, navigation(mode));
  html = html.replace('<h1>BeamFerry</h1>', '<h1>QR Turbo</h1>');
  html = html.replace(/<html lang="[^"]*">/, '<html lang="en">');
  html = html.replace(/<link rel="canonical"[^>]*>/g, '');
  html = html.replace(/<meta name="google-site-verification"[^>]*>/g, '');
  html = html.replace(/<meta property="og:url"[^>]*>/g, '');
  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + data.title + ' | QR Turbo</title>');
  html = addAsset(addAsset(html, 'ux.css'), 'ux.js');

  if (mode === 'send') {
    if (!html.includes('id="videoExportPanel"')) throw new Error('Integrated video export must be present');
    const selector = '<label class="drop" id="dropZone">';
    if (!html.includes(selector)) throw new Error('Sender file selector missing');
    html = html.replace(selector,
      '<div class="turbo-workflow" aria-label="Choose transfer method">' +
        '<div class="turbo-workflow-heading"><span class="turbo-kicker">SEND A FILE</span><strong>Choose your transfer method</strong></div>' +
        '<div class="turbo-workflow-buttons" role="group" aria-label="Transfer method">' +
          '<button type="button" id="turboLiveMode" class="turbo-workflow-button" aria-pressed="true">' +
            '<span class="turbo-workflow-icon" aria-hidden="true">▦</span><span><b>Live QR</b><small>Scan my screen</small></span></button>' +
          '<button type="button" id="turboVideoMode" class="turbo-workflow-button" aria-pressed="false">' +
            '<span class="turbo-workflow-icon" aria-hidden="true">▶</span><span><b>QR video</b><small>Save and share later</small></span></button>' +
        '</div>' +
        '<p id="turboWorkflowHint" class="turbo-workflow-hint" role="status" aria-live="polite">Choose your file, prepare the codes, then press Play.</p>' +
      '</div>' + selector);
    html = html.replace('<div class="actions">', '<div class="actions" id="liveActions">');
    html = html.replace('<section class="panel viewer">', '<section class="panel viewer" id="liveViewer">');
    html = html.replace('id="videoExportPanel" aria-label="Export QR video"', 'id="videoExportPanel" aria-label="Export QR video" tabindex="-1"');
    html = html.replace('<body class="video-export-page">', '<body class="video-export-page mode-live">');
  } else if (mode === 'import') {
    if (!html.includes('id="videoImportFile"')) throw new Error('Video import input missing');
    html = html.replace('<label>Video file (WebM / MP4)<input type="file" id="videoImportFile"',
      '<label class="turbo-file-drop" id="turboVideoDrop"><span class="turbo-drop-icon" aria-hidden="true">⇪</span>' +
      '<strong>Choose a QR video or drop it here</strong><span class="turbo-drop-description">WebM, MP4 or another video your browser can play. Your file stays on this device.</span>' +
      '<input type="file" id="videoImportFile"');
    html = html.replace('<body class="video-import-page">', '<body class="video-import-page turbo-import">');
  } else {
    if (!html.includes('</header>')) throw new Error('Receiver header missing: ' + mode);
    const stepText = mode === 'screen'
      ? ['Open Send on the other device', 'Select its QR display', 'Download the received file']
      : ['Open Send on a computer', 'Start scanning and align the codes', 'Download when the transfer finishes'];
    const steps = '<section class="turbo-receiver-steps" aria-label="How to receive">' +
      stepText.map((text, index) => '<span><b>' + (index + 1) + '</b>' + text + '</span>').join('') + '</section>';
    html = html.replace('</header>', '</header>\n' + steps);
  }
  return html;
}

export function improveUserExperience(distDir) {
  for (const mode of Object.keys(routes)) {
    const file = join(distDir, mode, 'index.html');
    const html = readFileSync(file, 'utf8');
    writeFileSync(file, enhancePage(html, mode));
  }
}
