"""Check the installable container, not just the source descriptor."""
import struct
import sys
from pathlib import Path

data = Path(sys.argv[1]).read_bytes()
u32 = lambda b, at: struct.unpack_from('<I', b, at)[0]
align = lambda n: (n + 63) & ~63
header, cert, ticket, tmd = (u32(data, at) for at in (0, 8, 12, 16))
content = align(header) + align(cert) + align(ticket) + align(tmd)
ncch = data[content:]
assert ncch[0x100:0x104] == b'NCCH', 'Missing NCCH content'
exheader = ncch[0x200:0x600]
caps = [u32(exheader, at) for at in range(0x370, 0x3E0, 4)]
# makerom GetARM11IOMappings encodes an exclusive end page (AddressEnd+0x1000).
# Both descriptors must be writable static mappings, not merely matching pages.
assert any(a == 0xFF81FF00 and b == 0xFF81FF80
           for a, b in zip(caps, caps[1:])), 'DSP RAM range missing from CIA'
assert any(a == 0xFF91F000 and b == 0xFF91F600 for a, b in zip(caps, caps[1:])), 'Read-only VRAM mapping missing from CIA'
exefs_at = u32(ncch, 0x1A0) * 512
exefs = ncch[exefs_at:]
entries = {}
for i in range(10):
    name = exefs[i*16:i*16+8].split(b'\0')[0].decode('ascii')
    offset, size = struct.unpack_from('<II', exefs, i*16+8)
    if name:
        entries[name] = exefs[512+offset:512+offset+size]
assert entries.get('banner', b'')[:4] == b'CBMD', 'HOME Menu banner missing'
# Compare the complete authenticated resource with the working baseline.
# The old checks only proved our modified file had been copied, not that HOME
# Menu would accept its authentication footer.
import hashlib
assert hashlib.sha256(entries.get('logo', b'')).hexdigest() == \
    '62a5a1f9091aefb46b52e31fbeca2fdba9a99fe2473237e21e35b8d2e5659dff', \
    'Launch logo differs from the authenticated working baseline'
assert struct.unpack_from('<H', exheader, 0xE)[0] == 7, 'CIA revision missing'
icon = entries.get('icon', b'')
assert icon[:4] == b'SMDH', 'HOME Menu icon missing'
title = icon[0x208:0x288].decode('utf-16le').split('\0')[0]
assert title == 'Jellyfin3DS', f'Unexpected HOME Menu title: {title!r}'
assert icon[0x288:0x388].decode('utf-16le').split('\0')[0] == 'Jellyfin client v0.2.7'
# SMDH stores tiled RGB565 pixels; histogram checks are independent of tiling.
for offset, pixels in ((0x2040, 24*24), (0x24C0, 48*48)):
    colors = struct.unpack_from('<' + str(pixels) + 'H', icon, offset)
    purple = ((0xAA >> 3) << 11) | ((0x5C >> 2) << 5) | (0xC3 >> 3)
    assert colors.count(purple) > pixels // 5, 'Purple HOME Menu icon missing'
banner = entries['banner']
assert len(banner) > 256, 'Banner is empty'
cwav_at = u32(banner, 0x84)
assert banner[cwav_at:cwav_at+4] == b'CWAV', 'Banner sound pointer is invalid'
cwav = banner[cwav_at:]
info_at, data_at = u32(cwav, 24), u32(cwav, 36)
assert cwav[info_at:info_at+4] == b'INFO' and cwav[data_at:data_at+4] == b'DATA'
assert cwav[info_at+8:info_at+10] == b'\x01\x00', 'Chime must be non-looping PCM16'
assert u32(cwav, info_at+12) == 22050 and u32(cwav, info_at+20) == 44100
assert u32(cwav, info_at+28) == 1, 'Chime must be mono'
import wave
with wave.open('.pocket/banner/banner.wav') as wav:
    pcm = wav.readframes(wav.getnframes())
assert cwav[data_at+32:data_at+32+len(pcm)] == pcm, 'Packaged chime differs from source'
samples = struct.unpack('<' + str(len(pcm)//2) + 'h', pcm)
assert max(map(abs, samples)) < 4096 and samples[0] == samples[-1] == 0, 'Chime level/fade regression'
print('CIA verified: DSP mapping, Jellyfin3DS title, SMDH icon, CBMD banner')
