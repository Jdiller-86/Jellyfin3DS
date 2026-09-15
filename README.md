# Jellyfin3DS

Jellyfin3DS is an unofficial, direct Jellyfin client for Nintendo 3DS built with [PocketJS](https://github.com/pocket-stack/pocketjs). It browses libraries, seasons, and episodes; searches; resumes videos; and reports playback progress. The 400×240 upper screen carries video and context while the 320×240 touch screen carries navigation and controls in a theme with Jellyfin-purple accents and native 3DS-style panels.

**No companion computer, phone, proxy, or Jellyfin plugin is needed after installation.** The 3DS connects to the Jellyfin server itself. The on-device implementation uses libcurl for the Jellyfin API, requests a constrained H.264/AAC MPEG-TS transcode, demuxes and decodes it with the FFmpeg/MVD path from [bogocat/jellyfin-3ds](https://github.com/bogocat/jellyfin-3ds), and sends audio to NDSP.

**Targets original and New 3DS models.** This recovery build uses software H.264 decoding on both, requesting a server transcode capped at 256×144 and 12 fps. MVD is temporarily disabled because it still crashes the system service. Playback performance needs console validation.

## v0.2.7 search and playback recovery

The search crash at PC `00430090` resolves to libctru `aptConvertScreenForCapture`: the keyboard reads VRAM at `1F4C7800`, which the prior CIA did not map. This build grants read-only access to the 6 MB VRAM range and checks it before launching the keyboard. Missing access now returns an error instead of entering the applet.

The native keyboard, purple UI, vertical browsing and artwork remain included. The authenticated standard Homebrew launch splash still temporarily returns; hiding it remains unfinished.

The banner displays **v0.2.7**. The release includes `Jellyfin3DS-chime.wav`, an exact preview of the PCM audio embedded in the banner. Select the icon and wait to hear the banner melody; this app does not change the HOME Menu's own launch sound. Its sound pointer and PCM samples are checked in the finished CIA. If the banner version is old, use the clean reinstall steps in [INSTALL.md](INSTALL.md).

## Install with FBI

On the 3DS, open **FBI → Remote Install → Scan QR Code**, then scan this code. It resolves to the `Jellyfin3DS.cia` asset in the versioned `v0.2.7` GitHub Release.

<a href="https://github.com/Jdiller-86/Jellyfin3DS/releases/download/v0.2.7/Jellyfin3DS.cia"><img src="assets/fbi-install.png" alt="FBI QR code for Jellyfin3DS v0.2.7" width="320"></a>

Direct URL: <https://github.com/Jdiller-86/Jellyfin3DS/releases/download/v0.2.7/Jellyfin3DS.cia>

FBI needs anonymous access to the release asset. If this repository is private, use the manual download below until the repository or a binary-only release mirror is public.

## Manual install

Download the `Jellyfin3DS-install` artifact from a successful **Build 3DS homebrew** GitHub Actions run. It contains:

- `3ds/Jellyfin3DS/Jellyfin3DS.3dsx` for Homebrew Launcher
- `cias/Jellyfin3DS.cia` for FBI and a HOME Menu entry
- the FBI QR image, installation instructions, and SHA-256 checksums

See [INSTALL.md](INSTALL.md) for SD-card placement, first-run sign-in, controls, and troubleshooting. A `.pocket` file is a PocketJS runtime package, not a Homebrew Launcher or FBI install file.

## Develop

```sh
git clone --branch feat/pocketjs-client --recurse-submodules https://github.com/Jdiller-86/Jellyfin3DS.git
cd Jellyfin3DS
bun run setup
bun run test
bun run build:guest       # guest JS, assets, and admitted .pocket package
bun run native:deps       # pinned 3DS portlibs, CA bundle, and FFmpeg (Docker)
bun run build             # .3dsx and .cia; Docker + pinned Rust required
bun run package           # SD/FBI distribution layout
```

CI uses Bun 1.4.2, PocketJS commit `a5a85356e172db8a32aefa983ee1259f60406f69`, bogocat/jellyfin-3ds commit `05bfa02f131d13f163bc7091d18af3b5b84f0820`, Rust `nightly-2026-07-02`, the PocketJS-pinned devkitPro container digest, and the reference client's pinned FFmpeg fork revision. The native dependencies are cached between CI runs.

## Security and storage

- The password exists only in the first-run UI and login request. It is cleared after the request and never written to the SD card.
- The server URL, username, persistent device ID, Jellyfin user ID, and access token are stored at `/3ds/Jellyfin3DS/config.json` so the app can reconnect. Signing out removes the access token and user ID.
- Tokens travel in HTTP headers, not stream URLs. Redirects are disabled so an authorization header cannot be forwarded to another host.
- HTTPS certificate and hostname verification use the CA bundle embedded at build time. A private or self-signed certificate must be trusted by that bundle; otherwise use plain HTTP only on a network you trust.
- The client accepts only `http://` and `https://` server URLs and bounds API responses, requests, item names, and five-row result pages for 3DS memory limits.

## Current scope

- Default video and audio tracks; no subtitle picker or burn-in, media-version picker, live TV, DRM, offline downloads, music-only player, or stereoscopic playback.
- Jellyfin transcodes to H.264 Baseline Level 3.1, AAC stereo, MPEG-TS, with model-specific size and frame-rate limits. Server transcoding must be enabled for the user.
- Reverse-proxy base paths such as `https://media.example/jellyfin` are supported. HTTP redirects are not.
- Browse remains available while a video runs on the upper screen; SELECT returns to player controls.
- Progress is reported on playback start, pause/resume, about every five seconds, and stop. Power loss can lose the latest position.

`app/` contains the Solid/PocketJS interface. `native/` implements the bounded on-device provider and media adapter. `scripts/native-host.ts` stages the pinned reference decoder into PocketJS's 3DS host without modifying either submodule.

See [THIRD_PARTY.md](THIRD_PARTY.md) for attribution and [VALIDATION.md](VALIDATION.md) for verification status.
