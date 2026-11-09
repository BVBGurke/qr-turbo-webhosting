# Turbo Grid V2 — optical transport specification

The new protocol is opt-in. The existing BeamFerry V1 modes (1 / 2 / 4 QR codes) remain unchanged. Turbo Grid V2 is used for **8 QR codes (4×2)** and **16 QR codes (4×4)**. The same data frames can be shown live or encoded into a WebM video offline.

## Packet structure

Every V2 tile contains a QR Byte-mode payload with a **24-byte header** followed by one fountain-coded block.

| Byte offset | Size | Field |
|---|---:|---|
| 0 | 1 | Magic byte `0xD2` |
| 1 | 1 | Flags (8 or 16 tiles in low five bits, bit 5 systematic, bit 6 full-frame) |
| 2 | 2 | Session ID (little-endian) |
| 4 | 4 | Fountain sequence ID (little-endian) |
| 8 | 4 | **Number of fountain blocks (uint32)** |
| 12 | 2 | Bytes per fountain block (uint16) |
| 14 | 4 | Packed file size (uint32) |
| 18 | 4 | FNV-1a of packed container (uint32) |
| 22 | 1 | Tile location, 0-based row-major |
| 23 | 1 | Version marker `0xA2` |
| 24+ | variable | Fountain-coded block |

The sender continues to use the original high-speed fountain encoder, SHA-256 file verification, optional gzip compression, and QR error correction. The receiver uses the existing WASM decode workers to process individual grid tiles, while the original single/four-code receiver stays untouched.

**Limits:** V2 supports a 32-bit block count and 32-bit container byte length. It does not implement disk streaming or claim that a browser can safely allocate 4 GiB. Current browser memory and performance requirements can be stricter. Sending compressed video or multiple files may also require extra working RAM.

## Tile refresh

- **20–60 FPS:** Each grid update includes all 8 or 16 codes.
- **90–120 FPS:** Four-tile banks update on each tick while the other tiles remain visible; successive banks rotate through the matrix. This avoids requiring 16 full QR encodes for every display refresh.
- A 120 FPS selection is a **target**, not an achieved FPS guarantee. Browser animation scheduling, display refresh rates and QR encoding can lower the actual rate.
- The indexed tile identifier in each QR packet allows the receiver to infer a grid's position from a decoded QR code, then use targeted crops.
- The receiver supports a manual QR grid selector (Auto / 8 / 16), useful for recordings or dense displays.

## Video compatibility

The WebCodecs offline generator uses the same packet/header as the live sender. Video export accepts 8/16 layouts through predefined profiles or custom layout controls; 8-code video is 4×2, 16-code video is 4×4. Import Video uses the receiver's WASM scanner and can be manually set to the corresponding grid size. This is not a new video decoder, but a new packet source for the existing decoder.

For 8/16 videos, avoid lowering QR module resolution and avoid re-encoding with low bitrate. Dense 16-tile grids are best decoded from the original, full-resolution WebM; camera recording may be unreliable.

## QA

- `npm run test` checks source syntax, V2 packet structure, error rejection, and V1 compatibility.
- `npm run build && npm run test:dist` builds static pages and exercises the actual BeamFerry high-speed encoder/decoder above the original 65,535-block range.
- End-to-end *real camera* testing requires physical devices and remains necessary for performance claims.
