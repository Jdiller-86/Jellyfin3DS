# Validation

Automated checks cover Jellyfin base URLs, authentication, API errors, bounded pagination, resume tick conversion, metadata transport limits, stream selection, playback reporting, H.264 packet boundaries, aspect-ratio fitting, and a real FFmpeg encode with silent audio synthesis. Guest compilation checks the manifest and the actual PocketJS component/compiler interface. CI builds the native `.3dsx` and `.cia` and assembles the install artifact.

This project has **not yet been validated on a physical 3DS or against the user's Jellyfin server**. A passing native build does not establish working hardware video, audio, or Wi-Fi.

Before calling a release hardware-tested, verify on a New 3DS-family device:

- Launch each distribution format and pair without a developer key.
- Browse more than one page, navigate series/seasons/episodes, search by touch and buttons, and use empty/error views.
- Play a movie with audio for at least five minutes; check aspect ratio, sync, pause/resume, repeated seeking, and volume.
- Stop and confirm the Jellyfin resume position, including seeking backward and starting from zero.
- Browse while playing, switch back to controls, and test companion restart/Wi-Fi loss.
- Verify permission errors, invalid credentials, silent media, missing DSP firmware, and unsupported decoder messages.

Known limitations are listed in README.md and INSTALL.md.
