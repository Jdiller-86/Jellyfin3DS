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
exefs_at = u32(ncch, 0x1A0) * 512
exefs = ncch[exefs_at:]
entries = {}
for i in range(10):
    name = exefs[i*16:i*16+8].split(b'\0')[0].decode('ascii')
    offset, size = struct.unpack_from('<II', exefs, i*16+8)
    if name:
        entries[name] = exefs[512+offset:512+offset+size]
assert entries.get('banner', b'')[:4] == b'CBMD', 'HOME Menu banner missing'
icon = entries.get('icon', b'')
assert icon[:4] == b'SMDH', 'HOME Menu icon missing'
title = icon[0x208:0x288].decode('utf-16le').split('\0')[0]
assert title == 'Jellyfin3DS', f'Unexpected HOME Menu title: {title!r}'
assert len(entries['banner']) > 256, 'Banner is empty'
print('CIA verified: DSP mapping, Jellyfin3DS title, SMDH icon, CBMD banner')
