# Jellyfin3DS

An unofficial Jellyfin client built with **PocketJS**, using a 400×240 video display and a 320×240 touch interface. Browse movie and TV libraries, open seasons and episodes, search, continue watching, pause, seek, and report playback progress to Jellyfin.

**Video requires New Nintendo 3DS, New 3DS XL/LL, or New 2DS XL.** PocketJS uses the MVD H.264 hardware decoder, which original 3DS/3DS XL/2DS systems do not provide. This is an experimental client, not a hardware-certified release.

A paired companion computer runs Bun and FFmpeg, authenticates to your Jellyfin server, and transcodes a bounded H.264 + ADPCM stream for the console. The companion must stay running while using the app. You do not need a Jellyfin plugin or an administrator API key.

## Install

See [INSTALL.md](INSTALL.md) for the complete SD card, FBI, pairing, and companion instructions.

The **Build 3DS homebrew** GitHub Actions workflow produces a `Jellyfin3DS-install` artifact containing:

- `3ds/Jellyfin3DS/Jellyfin3DS.3dsx` — copy to SD and launch with Homebrew Launcher.
- `cias/Jellyfin3DS.cia` — install with FBI for a HOME Menu entry.
- Installation guide and SHA-256 checksums.

An artifact is available only after a successful build. A `.pocket` file alone is not a Homebrew Launcher application or an FBI-installable title.

## Develop

```sh
git clone --recurse-submodules https://github.com/Jdiller-86/Jellyfin3DS.git
cd Jellyfin3DS
bun run setup
bun run test
bun run build:guest       # JS, assets, and admitted 3DS .pocket package
bun run build             # Native .3dsx and .cia; requires Docker + pinned Rust
bun run package           # SD/FBI distribution layout
```

Bun 1.4.2 is the CI version. Native compilation uses PocketJS commit `a5a85356e172db8a32aefa983ee1259f60406f69`, Rust `nightly-2026-07-02` with `rust-src`, and devkitPro's container digest pinned in the workflow. The PocketJS submodule includes QuickJS and makerom build scripts with their own revision pins. Install/pull the toolchain as shown in `.github/workflows/build.yml`, and start Docker before building locally.

## Scope and limits

- First/default audio track; no subtitle selection or burn-in, alternate media-version picker, live TV, downloads, music-only playback, or stereoscopic video.
- Server paths beneath a reverse-proxy prefix are supported. TLS verification stays enabled for Jellyfin API calls. Use a trusted LAN for the paired console transport, which is authenticated but not encrypted.
- Titles are transliterated to ASCII to fit the baked font and small transport budget. The UI holds five rows per page.
- The companion reports progress roughly every five seconds and on pause/stop. Abrupt power loss/disconnection can lose the most recent few seconds; server timeouts may delay reporting further.
- The app can browse while a video continues on the upper screen. SELECT returns to its controls.
- Credentials are read from `.env` on the companion. Only the random per-app pairing key goes on the SD card. Each running companion instance serves one console/user.

## Implementation

`app/` contains the Solid/PocketJS interface; `host/` contains the Jellyfin API adapter, paired provider worker, and bounded video encoder; `scripts/` contains build, pairing, and packaging tasks. The native runtime is a pinned submodule, not a reimplementation of 3DS rendering or decoding.

See [THIRD_PARTY.md](THIRD_PARTY.md) for attribution and [VALIDATION.md](VALIDATION.md) for verification status and the physical-device checklist.
