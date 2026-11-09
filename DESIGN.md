# QR Turbo UI — Optical Channel

**North star:** A transfer station that makes invisible data visible without making the user operate a laboratory.

Built with the open-source [Oil UI](https://github.com/oil-oil/oil-ui) design method. Dark graphical canvas (`#081114`), phosphor-green signal color (`#c8f56f`), large editorial headings, short captions, 10–18px radii, keyboard focus rings, and compact, mobile-first application workspace.

## UI flows

- Home: one dominant Send action; QR illustration; camera and video workflows separated.
- Sender: choose Live QR or Create Video, select files, check status and download output.
- Camera: full-screen scan preview, visible start/stop and progress; diagnostics collapsed.
- Screen: browser/window capture, then live QR decoder.
- Import: choose video, visualize scanning progress and log, recover file.
- Mobile: safe-area-aware four-item bottom nav, touch targets and no horizontal overflow.

## Offline video export

Send > Create QR video encodes QR frames directly on the client using WebCodecs, synthetic frame timestamps and a local WebM muxer. There is no MediaRecorder or real-time capture step. The exporter reuses BeamFerry's fountain packet ordering, QR encoder and original compression through a small source-level bridge. Video output is VP8/VP9 WebM, not MP4, and may require an HTTPS-enabled Chromium browser.

Custom video settings include one or four QR codes, payload size, and up to 120 FPS. Actual playback and scanning reliability vary; preserve redundancy and test with Import Video. Live QR 120 FPS depends on actual display refresh and receiver capability.

The transfer engine, static HTTPS hosting model, URLs and original decoder are unchanged. No encryption is provided by QR Turbo.

## Verification

GitHub Actions run npm syntax checks, production build, generated-route assertions and WebM muxer unit tests. Live camera permissions, video decode correctness on phones and visual screenshots still require real-device QA.
