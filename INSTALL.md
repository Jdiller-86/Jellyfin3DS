# Install Jellyfin3DS

## Requirements

- A **New 3DS / New 3DS XL (LL) / New 2DS XL** with homebrew, Wi-Fi, and DSP firmware on the SD card. Original 3DS models lack the decoder used by this client.
- Homebrew Launcher for `.3dsx`, or FBI and custom firmware for `.cia`.
- A Windows, Linux, or macOS computer on the same trusted LAN, with **Bun** and **FFmpeg with libx264** on PATH. Linux is the automated build/test environment; the companion needs a hardware smoke test on your setup.
- Jellyfin with a user permitted to access and stream the requested libraries. Use that user's credentials, not an admin API key.

## 1. Obtain and copy the application

In the GitHub repository, open **Actions → Build 3DS homebrew → a successful run → Artifacts → Jellyfin3DS-install**. Extract the downloaded ZIP.

**Homebrew Launcher:** copy the extracted `3ds` directory to the root of the SD card, preserving `3ds/Jellyfin3DS/Jellyfin3DS.3dsx`.

**FBI/HOME Menu:** copy `cias/Jellyfin3DS.cia` to the SD card and use FBI's **SD → cias → Jellyfin3DS.cia → Install CIA**. You only need one launch method. Pairing is required for either method.

If DSP audio firmware is absent, use Rosalina's **Miscellaneous options → Dump DSP firmware**. It should create `/3ds/dspfirm.cdc`. Do not download somebody else's firmware.

## 2. Set up the companion

Clone this repository with submodules on the computer that will run alongside Jellyfin:

```sh
git clone --recurse-submodules https://github.com/Jdiller-86/Jellyfin3DS.git
cd Jellyfin3DS
bun run setup
```

If testing a pull request, check out its branch before setup. Copy `.env.example` to `.env` and edit all five values. `JELLYFIN_URL` is the server's base URL (including any `/jellyfin` prefix). Use the console's IP for `DEVICE_IP` and the companion's LAN IPv4 for `COMPANION_IP`. Jellyfin can run on a different machine.

Reserve the console and companion IPs in your router for convenient reconnects. The companion's `MEDIA_PORT` defaults to 8742. Permit LAN inbound TCP 8742 on the companion computer and outbound TCP 8741 to the console. Keep these ports off the public internet.

## 3. Pair the SD card

With the SD card mounted on the companion, run one of:

```sh
bun run pair --sd E:/
bun run pair --sd /media/yourname/SDCARD
```

The command creates a random key at `SD:/pocketjs/offload/<app-slot>.key` and keeps the matching `.pocket/offload.key` on the computer. It preserves existing matching keys and refuses conflicting ones. Keep that local folder when upgrading.

If using ftpd instead of a card reader, create an empty staging directory, run `bun run pair --sd <staging-directory>`, then upload its `pocketjs` folder to the root of the console SD card. Also upload the `.3dsx` from the install artifact to `/3ds/Jellyfin3DS/`. The pairing command copies a local build's `.3dsx` when available; with a downloaded artifact, copy its application file yourself.

Eject the SD card and return it to the console. Close ftpd before launching the app.

## 4. Start watching

Open Jellyfin3DS, then run on the companion:

```sh
bun run companion
```

Keep this process running. The console will connect, show libraries, and reconnect after a dropped connection. Reconnection stops the old video; choose it again from Continue watching.

| Control | Action |
| --- | --- |
| D-pad Up/Down | Select a list row |
| A | Open folder/details; resume or play; pause in player controls |
| B | Back / return to browsing |
| Left/Right | Previous/next page; seek in player controls |
| X | Search keyboard (touch or D-pad); START submits |
| Y | Continue watching |
| SELECT | Switch between browsing and active player controls |
| START | Pause/resume |
| L / R | Seek backward/forward 10 seconds |
| Touch screen | Tabs, rows, playback buttons, volume and Stop |
| L + R + START | Exit the PocketJS host |

Stop playback before exiting to send the latest resume position.

## Troubleshooting

**Waiting for companion:** confirm both IPs, Wi-Fi, matching keys, the running companion, and firewall rules. Guest Wi-Fi/client isolation can prevent the connection. No developer key or PocketJS devserver is required.

**Credentials invalid:** correct `.env`, stop the companion and restart it. The client does not store your password on the 3DS.

**Hardware decoder unavailable:** video is unsupported on original 3DS/3DS XL/2DS. This also may occur in emulators without MVD support.

**Audio unavailable:** confirm `/3ds/dspfirm.cdc` and reboot the app.

**Buffering/source error:** check FFmpeg has libx264 (`ffmpeg -encoders`), the user can stream the item, and the companion can reach Jellyfin. First-version playback uses the default audio track and does not support live/DRM media or subtitles.

**CIA versus 3DSX:** installing a CIA does not remove the companion or hardware requirements. A `.pocket` file cannot be installed with FBI.
