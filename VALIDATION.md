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
