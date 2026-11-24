# Changelog

All notable changes to **Jellyfin3DS** are documented in this file.

## [Unreleased]

### Fixed
- Report `"ended"` or `"error"` in `media_snapshot` when `VIDEO_STOPPED` occurs before the first video frame, preventing the UI from staying stuck on `"Buffering…"`.
- Prevent `config_load` from silently overwriting an oversized `config.json` (`>= 8192` bytes) with a fresh `device_id`.

### Changed
- Eliminated per-frame heap allocations (`malloc`/`free`) and redundant full-packet copies in `mvd_decode_packet`.
- Deduplicated libcurl `Authorization` header and TLS setup into a shared `http_curl_init` helper in `native/offload.c`.
- Extracted `SetupView`, `BrowserListView`, `DetailView`, and `PlayerControlsView` from `app/main.tsx` into `app/views.tsx`.
- Removed unused write-only tracking fields (`PreparedStream.generation`, `offload_measure` counters).
- Added native C unit tests for `native/offload_util.h` (`test/offload_util.c`) and `j3ds_yuv420p_to_rgb565` (`test/rgb565.c`).

## [0.3.5] - 2026-11-23

- **New 3DS Hardware & 30 fps Pipeline:** Enabled `osSetSpeedupEnable(true)` (804 MHz + L2 cache) and RSF `CpuSpeed: 804MHz` / `EnableL2Cache: true`; replaced CPU Morton tiling with hardware `C3D_SyncDisplayTransfer` DMA and `LightEvent` frame handoff.
- **MVD Hardware Decoder Fixes:** Enforced 4 KB `linearMemAlign` DMA buffers, fixed multi-SPS/PPS AVCC parsing, skipped leading-zero Annex B padding, added `MVD_STATUS_BUSY` retry, capped MVD `Native` at `400×240 @ 30 fps`, and added an in-app **Stream → Decoder** toggle with software fallback.
- **Dark-Cinema UI & Controls Overhaul:** Redesigned all screens with high-contrast dark obsidian/purple tokens, widened the `288px` draggable timeline, added a 5-button transport deck (`−30s`, `−10s`, `Pause/Play`, `+10s`, `+30s`), Circle Pad hold-to-repeat, `L`/`R` tab cycling and `±30s` seek, and `Up`/`Down` volume control.

## [0.3.4] - 2026-09-23

### Added
- **Native** stream quality preset on New 3DS (`400×240`, up to `30 fps` / `850 kb/s` with software decoding, or up to `60 fps` / `1200 kb/s` with experimental MVD opt-in).
- Separate display of actual decoded video dimensions and measured presented FPS alongside requested limits in the Stream panel.

## [0.3.3] - 2026-09-21

### Fixed
- Corrected software video RGB565 channel packing to match Citro3D's `GPU_RGB565` red/blue order.

### Added
- Draggable playback timeline that commits a single seek on release, plus dedicated play/skip controls and an accessible Stream panel.
- Earlier artwork loading for the selected row and sequential preloading of visible/nearby rows within the 8-image memory cache.

## [0.3.2] - 2026-09-19

### Added
- Eight-thumbnail (2 MiB) memory-only LRU artwork cache with idle neighbor preloading and automatic reset on sign-in/session expiry.
- D-pad navigation for **Resume**, **Start over**, and **Back** in the item detail view.

### Fixed
- Aligned MVD linear allocation base submissions for every NAL unit, backed by a native transport test.

## [0.3.1] - 2026-09-18

### Fixed
- Modernized artwork authentication and split fallback image attempts across RPCs to stay within offload deadlines.
- Removed the silent `CWAV` banner audio block and verified zero audio pointer in the final CIA.
- Deferred MVD config/render calls until `MVD_STATUS_FRAMEREADY` and added delimiter/corrupt-AVCC guards.

## [0.3.0] - 2026-09-16

### Added
- Smooth inertial list scrolling with rolling 40-item browse window and 5-item network pagination.
- Centered aspect-preserving artwork in a transparent `256×256` POT texture (`256×144` visible region).
- Simplified playback navigation and in-app version display.
