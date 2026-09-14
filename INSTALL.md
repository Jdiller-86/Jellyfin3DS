# Install Jellyfin3DS

## Requirements

- A **New 3DS / New 3DS XL (LL) / New 2DS XL** with custom firmware, Wi-Fi, and DSP firmware on the SD card
- Homebrew Launcher for the `.3dsx`, or FBI for the `.cia`
- A reachable Jellyfin server with transcoding enabled for your user
- The Jellyfin server URL, username, and password

No computer, phone, companion app, proxy, administrator API key, or Jellyfin plugin is required while using Jellyfin3DS.

## 1. Install the application

For a network install, open **FBI → Remote Install → Scan QR Code** and scan `FBI-QR.png` from the release or repository README. It downloads this exact CIA asset:

```text
https://github.com/Jdiller-86/Jellyfin3DS/releases/download/v0.2.0/Jellyfin3DS.cia
```

FBI must be able to reach that URL without a GitHub login. Private-repository release assets are not anonymously downloadable, so use the manual method until the repository or a binary-only release mirror is public.

For a manual install, open **Actions → Build 3DS homebrew → a successful run → Artifacts → Jellyfin3DS-install** in the GitHub repository and extract the ZIP.

For Homebrew Launcher, copy the extracted `3ds` directory to the SD-card root. The final path must be:

```text
/3ds/Jellyfin3DS/Jellyfin3DS.3dsx
```

For a HOME Menu entry, copy `cias/Jellyfin3DS.cia` to the SD card, then choose **FBI → SD → cias → Jellyfin3DS.cia → Install CIA**. Only one launch method is needed.

If audio DSP firmware is absent, open Rosalina with L + Down + SELECT and choose **Miscellaneous options → Dump DSP firmware**. This creates `/3ds/dspfirm.cdc`. Do not download another console's firmware.

## 2. Sign in on the 3DS

Launch Jellyfin3DS and complete **Jellyfin Connection Settings** on the lower screen:

1. Enter the full server URL, including `http://` or `https://`, port, and any reverse-proxy path. Example: `http://192.168.1.20:8096`.
2. Enter the Jellyfin username.
3. Enter the password and choose **Sign in**.

Touch a field or select it with the D-pad and A. The keyboard uses START to accept and B to close. The password is cleared after sign-in. The app stores the issued Jellyfin token at `/3ds/Jellyfin3DS/config.json`; open **Account** to change servers or sign out.

For HTTPS, the certificate must chain to a public CA included in the app. Self-signed or private-CA certificates are rejected. Plain HTTP is suitable only on a local network you trust.

## Controls

| Control | Action |
| --- | --- |
| D-pad Up/Down | Select a list or settings row |
| A | Edit/confirm; open folder/details; play; pause in controls |
| B | Back; close the keyboard |
| Left/Right | Previous/next page; seek in player controls |
| X | Open search; START submits the keyboard |
| Y | Continue watching |
| SELECT | Open Account, or switch back to active player controls |
| START | Pause/resume during playback |
| L / R | Seek backward/forward 10 seconds |
| Touch screen | Tabs, rows, account fields, playback, volume, and Stop |
| L + R + START | Exit the PocketJS host |

Stop playback before exiting when possible so Jellyfin receives the latest resume position.

## Troubleshooting

**Could not reach the Jellyfin server:** confirm the 3DS has Wi-Fi, the URL and port are correct, and the server allows connections from the console's network. Guest Wi-Fi isolation can block LAN servers.

**TLS certificate is not trusted:** use a certificate from a public CA in the bundled trust store, or use local HTTP on a trusted LAN. Certificate checking cannot be disabled in the app.

**Username or password is incorrect:** reopen Account and enter the credentials again. The password is not stored.

**Video could not start / hardware decoder unavailable:** playback requires a New 3DS-family system. Emulator MVD support varies.

**Audio output unavailable:** dump DSP firmware with Rosalina, then restart the application.

**Demux, decode, or buffering error:** confirm the item is playable by that Jellyfin user and the server can transcode it to H.264/AAC MPEG-TS. The first version does not support live TV, DRM, subtitles, or alternate track selection.

**CIA versus 3DSX:** both formats run the same direct client. Installing the CIA does not change the New 3DS, DSP, network, or server-transcoding requirements.

**FBI says the QR URL cannot be downloaded:** confirm the 3DS has Internet access and that the `v0.2.0` release is publicly accessible. FBI cannot authenticate to a private GitHub release.
