# Jellyfin3DS

[![Build 3DS homebrew](https://github.com/Jdiller-86/Jellyfin3DS/actions/workflows/build.yml/badge.svg)](https://github.com/Jdiller-86/Jellyfin3DS/actions/workflows/build.yml)
[![Release v0.3.7](https://img.shields.io/github/v/release/Jdiller-86/Jellyfin3DS?include_prereleases&label=release)](https://github.com/Jdiller-86/Jellyfin3DS/releases/tag/v0.3.7)
[![Target](https://img.shields.io/badge/target-Nintendo%203DS%20%2F%20New%203DS-ce181e)](INSTALL.md)
[![License](https://img.shields.io/badge/license-MIT%20%2F%20GPL--3.0-blue)](LICENSE.md)

An unofficial, standalone **Jellyfin** client for the **Nintendo 3DS** family, built with [PocketJS](https://github.com/pocket-stack/pocketjs).

**No companion PC, phone, proxy, or Jellyfin plugin is required.** The console connects directly to your Jellyfin server over Wi-Fi using `libcurl`, requests a constrained H.264/AAC MPEG-TS transcode, demuxes and decodes video with the FFmpeg/MVD pipeline from [bogocat/jellyfin-3ds](https://github.com/bogocat/jellyfin-3ds), and outputs stereo audio via NDSP.

---

## Features

- **Dual-Screen Native UI** — `400×240` top screen for video playback, artwork, and metadata; `320×240` bottom touchscreen for browsing, search, and playback controls.
- **Direct Jellyfin Integration** — Browse libraries, series, seasons, episodes, and *Continue Watching*; search across your library; resume playback; and report progress automatically.
- **Original & New 3DS Support** — Tuned stream profiles keep original 3DS/2DS consoles within software decode limits while unlocking higher-resolution presets on New 3DS models.
- **Memory-Bounded Artwork Cache** — 8-slot (`2 MiB`) in-memory LRU cache with idle neighbor preloading and automatic pause during video playback.
- **Touch & Button Navigation** — Inertial touch scrolling, draggable seek bar (single seek on release), D-pad/button shortcuts, and the native 3DS software keyboard.

---

## Stream Quality Presets

Select a preset during playback via **Now playing → Stream → Quality**.

| Model | Decoder | Standard | High | Native |
| :--- | :--- | :--- | :--- | :--- |
| **Original 3DS / 2DS** | Software (FFmpeg) | `256×144` · 12 fps · ≤192 kb/s | `256×144` · 12 fps · ≤320 kb/s | — |
| **New 3DS / New 2DS** | Software (default) | `256×144` · 12 fps · ≤192 kb/s | `256×144` · 12 fps · ≤320 kb/s | `400×240` · 30 fps · ≤850 kb/s |
| **New 3DS / New 2DS** | Hardware MVD (Stream → Decoder) | `400×240` · 24 fps · ≤472 kb/s | `400×240` · 24 fps · ≤700 kb/s | `400×240` · 30 fps · ≤900 kb/s |

> [!NOTE]
> Software decoding is the default on all models. Holding **R** at launch on a New 3DS opts into the experimental hardware MVD decoder; holding **L** always forces software decoding. The Stream panel displays the actual decoded size and measured presented FPS separately from the requested caps.

---

## Installation

### Option 1: Install with FBI (QR Code)

Open **FBI → Remote Install → Scan QR Code** on your 3DS and scan the code below to install `Jellyfin3DS.cia` from the `v0.3.7` release:

<a href="https://github.com/Jdiller-86/Jellyfin3DS/releases/download/v0.3.7/Jellyfin3DS.cia"><img src="assets/fbi-install.png" alt="FBI QR code for Jellyfin3DS v0.3.7" width="280"></a>

Direct CIA URL: <https://github.com/Jdiller-86/Jellyfin3DS/releases/download/v0.3.7/Jellyfin3DS.cia>

*FBI requires anonymous access to the release asset. If the repository is private, use the manual install below.*

### Option 2: Manual Install

Download the `Jellyfin3DS-install` artifact from a successful [**Build 3DS homebrew**](https://github.com/Jdiller-86/Jellyfin3DS/actions/workflows/build.yml) workflow run:

- `3ds/Jellyfin3DS/Jellyfin3DS.3dsx` — Homebrew Launcher executable
- `cias/Jellyfin3DS.cia` — FBI installable HOME Menu title
- `INSTALL.md`, `FBI-QR.png`, and `SHA256SUMS`

See [INSTALL.md](INSTALL.md) for SD-card layout, DSP firmware dumping, first-run sign-in, full control bindings, and troubleshooting.

---

## Architecture

| Path | Role |
| :--- | :--- |
| [`app/`](app/) | SolidJS UI (`main.tsx`, `views.tsx`, `protocol.ts`, `stream.ts`) running on QuickJS inside PocketJS |
| [`native/`](native/) | Bounded on-device C provider (`offload.c`, `offload_util.h`), media/keyboard bridge (`media.c`), MVD decoder (`mvd_decode.c`), artwork cache (`artwork.h`, `art_cache.h`), RGB565/YUV420P converter (`rgb565.h`, `software_video.inc`), and stream profiles (`stream_profile.h`) |
| [`scripts/`](scripts/) | Build orchestration (`build.ts`, `package.ts`), non-invasive PocketJS/FFmpeg host staging (`native-host.ts`), icon/banner generators, and CIA binary verifier (`verify-cia.py`) |
| [`test/`](test/) | Unit tests for protocol/stream helpers, host patching, artwork sizing/LRU cache, RGB565/YUV420P conversion, stream profiles, offload validation, and MVD transport |
| [`tests-ui/`](tests-ui/) | End-to-end two-screen WASM UI journey test (`journey.test.ts`) |
| [`vendor/`](vendor/) | Pinned `pocketjs` and `jellyfin-3ds` submodules |

---

## Development

### Prerequisites

- [Bun](https://bun.sh/) `1.4.2`
- Docker + Rust `nightly-2026-07-02` (for full `.3dsx` / `.cia` cross-compilation)
- A C compiler (`cc`) with AddressSanitizer/UBSan for native unit tests

### Commands

```sh
git clone --recurse-submodules https://github.com/Jdiller-86/Jellyfin3DS.git
cd Jellyfin3DS

bun run setup         # Install JS dependencies
bun run typecheck     # Run TypeScript type checking
bun run test          # Run unit and native C tests
bun run test:ui       # Build guest & run two-screen WASM UI journey test
bun run build:guest   # Build guest JS, assets, and .pocket package
bun run native:deps   # Prepare pinned 3DS portlibs, CA bundle, and FFmpeg (Docker)
bun run build         # Cross-compile .3dsx and .cia (Docker + Rust)
bun run package       # Assemble dist/install/ distribution layout
```

CI uses Bun `1.4.2`, PocketJS `a5a85356`, `bogocat/jellyfin-3ds` `05bfa02f`, Rust `nightly-2026-07-02`, and the pinned devkitARM container digest.

---

## Security & Storage

- **No stored passwords** — Your password exists only in the first-run UI and sign-in request, then is immediately cleared.
- **Persistent config** — Server URL, username, device ID, user ID, and access token are saved to `sdmc:/3ds/Jellyfin3DS/config.json`. Signing out clears the token and user ID.
- **Header-only auth** — Tokens are sent in `Authorization: MediaBrowser ...` HTTP headers, never in stream URLs. HTTP redirects are disabled (`CURLOPT_FOLLOWLOCATION = 0`) so tokens cannot be forwarded to another host.
- **TLS verification** — HTTPS verifies certificates and hostnames against the embedded `romfs:/cacert.pem` bundle. Use plain `http://` only on a trusted local network.
- **Bounded memory** — Only `http://` and `https://` URLs are accepted; API bodies, item names, 5-item network pages, and the rolling 40-item browse window are strictly bounded for 3DS RAM limits.

---

## Current Scope & Documentation

- **Scope:** Default video and audio tracks; H.264 Baseline Level 3.1 / AAC stereo / MPEG-TS server transcoding required. No subtitle picker, media-version picker, live TV, DRM, offline downloads, music-only player, or stereoscopic 3D playback.
- **Progress reporting:** Reported on playback start, pause/resume, every ~5 seconds, and stop.
- **Docs:** [INSTALL.md](INSTALL.md) · [CHANGELOG.md](CHANGELOG.md) · [VALIDATION.md](VALIDATION.md) · [THIRD_PARTY.md](THIRD_PARTY.md) · [LICENSE.md](LICENSE.md)
