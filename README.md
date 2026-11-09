# QR Turbo — High-speed optical file transfer

A self-hosted, browser-based file transfer website using animated QR codes. Based on [BeamFerry](https://github.com/shuipashui/beamferry), licensed under MIT.

## Features

- English-only navigation, controls, status messages, and diagnostics
- Simple **Send**, **Camera**, and **Screen** tabs
- Advanced settings and diagnostics are collapsed by default
- Four simultaneous QR codes; stable 30 FPS preset and experimental higher FPS modes
- Browser-only static hosting; no application backend and no file upload
- Modern UI using [Pico CSS](https://picocss.com/) design styles, with local styling fallback

## Deploy

The repository contains the source and build script. The full decoder bundle is downloaded and built from the pinned upstream GitHub revision during deployment.

**Cloudflare Pages:** Connect this repository. Use build command `npm run build`, output directory `dist`, and Node.js 22.

**Vercel:** Import the repository; `vercel.json` sets the build and output paths.

**Netlify:** Import the repository; `netlify.toml` contains the settings.

**GitHub Pages:** In Settings → Pages, choose **GitHub Actions** as the deployment source. The included workflow builds and publishes the static site.

**Other static hosting:** Run `npm run build` locally with Node.js 22+, Git, and internet access, then upload the complete `dist/` directory.

### Local development

```bash
npm run build
npm run preview
```

Open `http://localhost:8080`. Camera and screen-capture APIs require HTTPS or localhost.

## Routes

| URL | Purpose |
|---|---|
| `/` | Home |
| `/send/` | QR sender |
| `/receive/` | Camera receiver |
| `/screen/` | Screen capture receiver |

The sender's receiver-link QR code automatically uses your own domain, including subdirectory deployments.

## Direct offline QR video export

In **Send → Create QR video**, choose a file and quality preset, then click **Create and download video**. The client computes the entire QR sequence and encodes a WebM (VP8/VP9) video using WebCodecs with synthetic timestamps. This is **not real-time recording**: generation speed depends on your CPU/GPU and settings. There is no video upload.

**Custom settings** allow one or four QR codes, adjustable payload per QR code, and 10–120 FPS video, subject to compatible sender presets. For **Live QR**, 4-code 120 FPS is experimental and limited by your screen refresh rate and the receiver's scanning capabilities.

WebM generation requires a supported secure-context browser. Video size is a bitrate **target**, not a guaranteed size. Very low resolutions, bitrates, and video recompression can render QR codes unreadable; test the generated file using **Import video** before sharing.

## Speed and limitations

BeamFerry documents **425 KB/s** in a Windows/Edge screen-capture reference test. This is not a guaranteed phone-camera speed. Real throughput depends on camera focus, screen brightness, display refresh rate, QR density, and lighting.

Start with four codes at **2068 B / 30 FPS**. If scanning is unreliable, try 1465 B or a larger fullscreen display.

The browser receiver has a **64 MiB file-size limit**. Optical transfers are not encrypted: anyone who can record the codes may reconstruct the file. Encrypt sensitive files before sending.

The hosted site serves the static application files; transferred file contents are processed on the devices, not uploaded to the website. An internet connection is required to load uncached assets initially, and Pico CSS is requested from a public CDN (local styling is included as fallback).

## Source and licensing

- Upstream: [shuipashui/beamferry](https://github.com/shuipashui/beamferry)
- Pinned commit: `44d8c9b64c920183f5f250a6d9deb1978a385004`
- Upstream MIT license and third-party notices are copied into `dist/licenses/` by the build.
- The upstream transfer protocol, error correction, and WebAssembly decoders remain unchanged.
- UI translation mapping: `scripts/translations.json`

To test a newer upstream version: `UPSTREAM_REF=main npm run build`. The build deliberately rejects missing critical patches.

## QR video export / import

Two independent routes are built along with the main sender/receiver:

- **`/send/`** — Select and prepare a file, then use **Record video** to capture the animated QR-code canvas to a shareable WebM (or MP4 if the browser's MediaRecorder supports it). **Show QR playback** toggles the visible preview without stopping canvas recording. Select 30/60/120/240 seconds and adjust speed/quality presets. This is experimental: use high video bitrate and test a short file first.
- **`/import/`** — Choose a previously recorded QR video. The original BeamFerry decoder runs over each video frame offline, including its WASM workers and recovery logic. The page displays the video (optionally hidden), file reconstruction progress, unique packet count, recovered blocks, timeline graph and a downloadable local log with packet sequence numbers, byte counts and the first 8 payload bytes in hexadecimal. This information is never transmitted to the server.

Recommended export preset: **1465 bytes per code at 24 FPS**. For more robust recordings choose **1273 bytes at 20 FPS**; for higher throughput, try the experimental **2068 bytes at 30 FPS** profile. These are settings, not measured benchmarks.

Video import depends on the browser being able to decode the selected file format. Export depends on `canvas.captureStream` and `MediaRecorder` support. Neither WebM nor MP4 can be promised across every device/browser. Transcoding by messengers may blur QR modules and damage transferred data. No end-to-end roundtrip was verified in a real browser.

### Running checks

```sh
npm run test
npm run build
npm run test:dist
```

The CI **Verify build** workflow checks the project independently of GitHub Pages deployment settings.

Both video tabs have an accessible **Show preview / Hide preview** button and checkbox. Export hides only the on-screen QR view (canvas recording keeps running). Import displays a video player next to the selected file, and hiding the preview does not disable frame decoding. The local packet log and decoding metrics remain visible.

## Integrated compact QR video export

Video export is inside **Send** at `/send/#videoExportPanel`; the legacy `/export/` URL redirects to Send. No separate Export tab remains. The recorder renders the original QR module arrays into a dedicated canvas at exact integer pixel sizes rather than recording or scaling the visible page. This preserves the native BeamFerry packet sequence and clean black/white QR module edges.

- **Smallest (experimental):** 1003 bytes / QR, one QR, 10 FPS, 2 pixels per module (226 × 226), 260 kbps requested.
- **Compact (recommended starting point):** one QR, 1003 bytes, 12 FPS, 3 pixels per module (340 × 340), 700 kbps requested.
- **Balanced:** four QR codes, 1003 bytes each, 12 FPS, 3 pixels per module (678 × 678), 2200 kbps requested.
- **Faster:** four QR codes, 1465 bytes each, 20 FPS, 4 pixels per module (1064 × 1064), 6000 kbps requested.

The encoder attempts to capture each QR update with `captureStream(0)` and `requestFrame()` where supported, falling back to ordinary FPS capture. Use **Auto duration** to estimate enough frames for redundancy, and check the downloaded video in **Import Video**. Extremely low bitrate or 2px QR modules may be impossible to decode after lossy compression; requested bitrate is not guaranteed to equal the output bitrate. Private files should be encrypted separately because QR transfers are not encrypted.
