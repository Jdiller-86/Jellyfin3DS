# Validation

Automated checks cover the direct-provider build overlay, authenticated header transport, TLS verification, CA embedding, reference decoder texture bounds, bounded pagination, the PocketJS manifest/compiler contract, and a simulated two-screen browse/player journey. CI cross-compiles FFmpeg and the 3DS host, builds both `.3dsx` and `.cia`, packages their checksums and FBI QR, uploads the install layout, and byte-compares the published FBI release asset with the packaged CIA.

The user reported a physical-console v0.2.0 CIA crash. Rebuilding the same sources resolved PC `0x00428ed8` to libctru 2.7.0 `ndspSetCounter`, and the fault address `0x1ff57ffe` lies in DSP RAM, absent from the old CIA descriptor. v0.2.1 adds `IORegisterMapping: 1ff00000-1ff7ffff` and checks write access before calling `ndspInit`.

**The repaired build and original-model software playback have not yet been tested on physical hardware or against the user's Jellyfin server.** A successful cross-build proves format generation and linking, not hardware playback or compatibility with every Jellyfin version.

Before marking v0.2.1 hardware-tested, verify on both an original 3DS/2DS and a New 3DS-family system:

- Launch the `.3dsx` from Homebrew Launcher and install/launch the `.cia` with FBI.
- Complete first-run sign-in using LAN HTTP and trusted HTTPS; reboot and confirm token restore; sign out and confirm reauthentication is required.
- Browse multiple pages, series, seasons, and episodes; search with touch and buttons; exercise empty and error views.
- Play video with audio for at least five minutes and check aspect ratio, sync, buffering recovery, pause/resume, repeated seeking, volume, and end-of-stream behavior.
- Stop and confirm the Jellyfin resume position, including seeking backward and starting from zero.
- Browse while playing and return to player controls.
- Test Wi-Fi loss, server restart, expired credentials, denied transcoding, self-signed TLS, silent media, missing DSP firmware, and original-model software decoding.

Known product limits are listed in README.md and INSTALL.md.

## v0.2.2 follow-up

The user confirmed startup and browsing work with v0.2.1, but playback crashed the MVD system service (process mvd, PC 0x0010fac8, read FAR 0x14dcde00). The local decoder now converts old linear addresses to the new FCRAM alias before IPC and splits Annex B packets into individual NAL units. This is a source-level repair; playback must be retested on hardware. The UI journey now covers vertical window movement and an artwork reply.

## v0.3.0 UX update

The user confirmed v0.2.7 streaming and the native keyboard work on their console.
The decoder, DSP/VRAM mappings, keyboard implementation and authenticated launch
logo are unchanged. This does not establish compatibility on every model.

Artwork now receives a transparent 256x256 texture, with its aspect-preserving
image centered in the visible 256x144 region. A native AddressSanitizer/UBSan test
covers landscape/portrait placement, padding, and invalid dimensions. The UI
journey covers multi-batch scrolling, metadata/art replies, and returning to a
running player's controls without reopening the stream. CIA verification checks
the exact silent PCM and the authenticated logo digest.

Console checks still required: scroll a large library in both directions, enter
and return from folders, load real PNG/JPEG art (including missing images), inspect
series metadata, and browse/return to playback while streaming. Verify the banner
version after installation; the console's own launch sound is not app audio.

Safe splash removal remains blocked on an authenticated blank archive. Upstream
https://github.com/yellows8/ctr-logobuilder documents an HMAC footer requiring a
HOME Menu-derived key. No such key or verified blank archive is in this build.
Retaining the proven resource avoids repeating the earlier launch regression.
