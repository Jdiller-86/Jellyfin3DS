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
assert [cap for cap in caps if cap >> 24 == 0xFC] == [0xFC00022C], 'CIA must request the MVD-compatible 2.44 linear heap layout'
services = [exheader[i:i+8].rstrip(b'\0') for i in range(0x250, 0x350, 8)]
assert b'mvd:STD' in services, 'Missing MVD service access'
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
assert struct.unpack_from('<H', exheader, 0xE)[0] == 15, 'CIA revision missing'
icon = entries.get('icon', b'')
assert icon[:4] == b'SMDH', 'HOME Menu icon missing'
title = icon[0x208:0x288].decode('utf-16le').split('\0')[0]
assert title == 'Jellyfin3DS', f'Unexpected HOME Menu title: {title!r}'
assert icon[0x288:0x388].decode('utf-16le').split('\0')[0] == 'Jellyfin client v0.3.7'
# SMDH stores tiled RGB565 pixels; histogram checks are independent of tiling.
for offset, pixels in ((0x2040, 24*24), (0x24C0, 48*48)):
    colors = struct.unpack_from('<' + str(pixels) + 'H', icon, offset)
    # The official gradient includes purple and cyan rather than a flat color.
    colored = sum(1 for color in colors if (color & 31) > 15 and ((color >> 11) & 31) < 24)
    assert colored > pixels // 8, 'Jellyfin gradient icon missing'
banner = entries['banner']
assert len(banner) > 256, 'Banner is empty'
assert u32(banner, 0x84) == 0, 'Banner must contain no audio reference'
assert b'CWAV' not in banner, 'Banner audio block was not removed'
print('CIA verified: DSP mapping, Jellyfin3DS title, SMDH icon, CBMD banner')
