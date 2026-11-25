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

## v0.3.1

The user reports artwork still missing and unchanged beeping in v0.3.0. Its
banner PCM had been verified silent; the source did not prove what version was
installed/cached or which sound was heard. v0.3.1 removes the CWAV block and
checks its pointer is zero in the final CIA, and adds an in-app version label.

Artwork authentication is modernized; fallback transfers are split across RPCs
to stay below the offload deadline. Native tests cover resize/padding bounds.
The UI test exercises a missing first image followed by a successful fallback.

MVD config/render must occur after a frame-ready result, following libctru and
ThirdTube. The mocked native test rejects early configuration and rendering on
MVD_STATUS_OK, and checks delimiter filtering and malformed AVCC rejection.
New models enable MVD; original models retain software. Holding L at startup
forces software. These checks do not establish hardware success: real-console
MVD playback, image fetches against the user's server, and audible behavior
remain unverified.

## v0.3.2

The user reports another MVD system-service svcBreak in v0.3.1. The photo
shows PC 00119ABC and a saved crash dump; a photo alone cannot establish the
internal failing assertion. Inputs were submitted at base+1 or arbitrary NAL
offsets; every unit now copies to the aligned allocation base before IPC.
The native test asserts alignment. This remains a candidate hardware repair.
Software is the default and R at launch opts New models into MVD testing.

Cache tests cover the eight-entry cap, LRU eviction and account reset. The
UI journey exercises neighbor preload and D-pad Back/Start over activation.
Artwork is retained in memory only, capped at 2 MiB; preloading does not upload
a GPU texture or replace the selected image. Real-console MVD and cache/UI
behavior remain unverified.

## v0.3.3

The original-model screenshot shows red and blue swapped in software video. The
software YUV420P converter packed RGB565 with red in the low five bits, while
Citro3D's GPU_RGB565 expects red in the high five. A native primary-color test
checks the conversion, and the code now uses the correct ordering. The MVD
hardware path remains opt-in and unverified; the screenshot reports CPU decode.

Player navigation adds a draggable timeline that submits one seek after finger
release. The Stream panel distinguishes measured decoded size from requested
resolution, frame-rate and bitrate caps. Standard/High selects bounded video
bitrate settings without increasing decoder load. The UI journey checks a
dragged seek, the playback actions and quality change; CI renders both screens.

Artwork starts earlier on library load and sequentially warms the first visible
rows and the selected item's neighbors into the eight-image cache. The
first screen, slider, real Jellyfin transcoding response and color rendition
still need a physical-console check.

## v0.3.4

The New-model Native preset requests up to 400×240 at 30 fps for software decoding,
or 60 fps with launch-time MVD opt-in. Original models stay within 256×144 at 12 fps.
A native profile test covers model and decoder combinations, including an invalid
Native request on an original 3DS. The renderer now counts a frame as presented
only after the main thread accepts its texture; the player reports that measured
rate and the decoded size next to the request caps. CI exercises the New-model
quality switch in the two-screen UI journey and cross-compiles both install files.
Performance at 400×240, the 60 fps MVD service, server output cadence and audio
sync have not been verified on a real New 3DS. A quality request is a ceiling,
not proof of the effective video resolution or frame rate.

## New 3DS MVD audit on the v0.3.6 checkout

The previous diagnostic CIA contained ARM11 release-kernel descriptor
`0xFC000221` (2.33). The devkitPro MVD example documents a minimum of 2.44.
Both ThirdTube and Video_player_for_3DS specify 2.44 in their application
descriptors. Azahar's process memory implementation independently places the
linear heap in the old address range for versions below 0x22C. Luma's
homebrew loader also documents this cutoff. The CIA build now requests 2.44.
The verifier reads the packed NCCH and checks both `0xFC00022C` and the
`mvd:STD` access-list entry. It rejected the previous diagnostic CIA.

The transcript identifies an ARM11 service break inside process `mvd`, PC
`00119ABC`. The words `30E0E000` and `20E0E000` are consistent with the new
linear virtual and physical addresses of the same allocation. libctru sends
both addresses on NAL submission. Computing a virtual alias does not create
a mapping. This explains how both addresses could look aligned and plausible
while the client was running with the old layout. The transcript does not
identify the installed binary, launch format, service command, assertion or
contents of the buffer. A .3dsx runs with its loader's process capabilities.

### Implementation and reference checks

- Check a real linear allocation before opening MVD. Fall back on legacy
  layouts. Accept only zero from initialization. Keep H.264 hardware opt-in.
- Request video transcoding for the hardware profile and check the codec
  reported by the demuxer before opening MVD. Jellyfin's video endpoint
  allows stream copy by default. Software fallback after MVD initialization
  failure can reuse the open demuxer and buffered packets.
- Submit supported H.264 NAL units from the aligned allocation with a
  three-byte start code. Render each frame-ready result before submitting
  the next NAL. Poll with libctru's nonblocking render call so the existing
  retry limit applies when the service replies busy. A synchronous IPC call
  itself still depends on the service returning.
- The default work buffer and 16-pixel padded output dimensions have
  precedent in the references. ThirdTube and FourthTube duplicate the first
  submission in their playback paths. The devkitPro example does not require
  this, so the client submits each unit once.
- After successful rendering, invalidate the output cache, copy into the
  frame queue, and pass tiled texture data to the main thread. Normal stop
  joins the workers before releasing their buffers and closing MVD.

Sources used for these comparisons include the
[devkitPro example](https://github.com/devkitPro/3ds-examples/tree/be2001fee08cf8ec7d3366e095e83f6f75da8942/mvd),
[libctru MVD implementation](https://github.com/devkitPro/libctru/blob/v2.7.0/libctru/source/services/mvd.c),
[libctru address conversion](https://github.com/devkitPro/libctru/blob/v2.7.0/libctru/source/os.c),
[Luma homebrew loader](https://github.com/LumaTeam/Luma3DS/blob/c7790ee1d79574471f948e1078bb6f2c5c620e9b/sysmodules/loader/source/hbldr.c),
[Azahar process memory](https://github.com/azahar-emu/azahar/blob/master/src/core/hle/kernel/process.cpp),
[ThirdTube](https://github.com/windows-server-2003/ThirdTube/tree/dc65af8512826d0f3af8e9c2a259403a010d812a),
[FourthTube](https://github.com/erievs/FourthTube/tree/6d8bcb286e0423531e98819a3ad9129b833386d9),
[Video_player_for_3DS](https://github.com/Core-2-Extreme/Video_player_for_3DS/tree/87cb1caa9261e611f9583a9c41f3e8120a6a1864),
and the [Jellyfin video endpoint](https://github.com/jellyfin/jellyfin/blob/6b786b36eed49bf83860d9b652b96f475aeb2668/Jellyfin.Api/Controllers/VideosController.cs).

### Reproducing offline validation

Run `bun run test` for native service-contract and unit checks. The MVD harness
uses ASan and UBSan and covers legacy layout rejection before service IPC,
positive initialization failures, aligned submissions, parameter sets,
render gating, multiple ready results in one packet, busy retries and timeout.
Run `python3 test/mvd-replay.py` with FFmpeg, ffprobe and libx264 available.
It creates four 48-frame baseline H.264 MPEG-TS clips, demuxes the packets,
captures the byte stream submitted by the C decoder at the mocked IPC call,
and compares every independently decoded frame hash with the original.
All 192 hashes matched, including 400×224 four-slice and 320×180 two-slice
video. The test validates input framing. Hardware status codes, DMA, output
colors, audio sync and real playback timing require a console. Azahar's
public MVD service table registers null handlers for Initialize and
ProcessNALUnit, so its normal high-level emulation cannot validate this
service path. [Azahar MVD service](https://github.com/azahar-emu/azahar/blob/master/src/core/hle/service/mvd/mvd_std.cpp)

For a hardware comparison, install the locally built CIA from `dist/install/cias`.
Use the QR supplied with v0.3.7 to select this build. Preserve any existing log
before launch. Record the launch format and whether the log shows
`MVD heap probe ... layout=new`, `DEC: MVD OK`, the first submit/return
pairs and the first render/return pair. Check visible moving video and sound,
then seek, stop and replay. If the service breaks, preserve the log and ARM11
dump before relaunching. A process address in the system module needs matching
system-module code to resolve its internal call site.
