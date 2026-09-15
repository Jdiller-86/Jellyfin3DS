"""Generate a transparent launch archive from makerom's Homebrew template.

Usage: python scripts/blank-logo.py path/to/makerom/src/ncch_logo.h
Template: Project_CTR e8f5f529c54ff9b22a2491a480ffa69206bf7b19 (MIT).
Retain the loader's layout/animation names, replace every texture with transparent A4.
"""
import re
import struct
import sys
from pathlib import Path


def decompress(b):
    assert b[0] == 0x11
    size = int.from_bytes(b[1:4], 'little')
    out = bytearray()
    i = 4
    while len(out) < size:
        flags = b[i]; i += 1
        for bit in range(8):
            if len(out) >= size:
                break
            if flags & (128 >> bit):
                x, y = b[i:i+2]; i += 2
                n = x >> 4
                if n == 0:
                    z = b[i]; i += 1
                    n = ((x & 15) << 4 | y >> 4) + 17
                    d = ((y & 15) << 8 | z) + 1
                elif n == 1:
                    z, w = b[i:i+2]; i += 2
                    n = ((x & 15) << 12 | y << 4 | z >> 4) + 273
                    d = ((z & 15) << 8 | w) + 1
                else:
                    n += 1
                    d = ((x & 15) << 8 | y) + 1
                for _ in range(n):
                    out.append(out[-d])
            else:
                out.append(b[i]); i += 1
    assert len(out) == size
    return out


def compress(b):
    # Small deterministic LZ11 encoder; short matches suffice for blank textures.
    out = bytearray(b'\x11' + len(b).to_bytes(3, 'little'))
    pos = 0
    while pos < len(b):
        at = len(out); out.append(0)
        for bit in range(8):
            if pos >= len(b):
                break
            best, distance = 0, 0
            start = max(0, pos - 4096)
            candidate = b.rfind(b[pos:pos+3], start, pos)
            while candidate >= start and candidate >= 0:
                length = 3
                while length < min(272, len(b)-pos) and b[candidate+length] == b[pos+length]:
                    length += 1
                if length > best:
                    best, distance = length, pos-candidate
                if best == min(272, len(b)-pos):
                    break
                candidate = b.rfind(b[pos:pos+3], start, candidate)
            if best < 3:
                out.append(b[pos]); pos += 1
                continue
            out[at] |= 128 >> bit
            d = distance - 1
            if best <= 16:
                out.extend([((best-1) << 4) | (d >> 8), d & 255])
            else:
                n = best - 17
                out.extend([n >> 4, ((n & 15) << 4) | (d >> 8), d & 255])
            pos += best
    return out


def clear_textures(archive):
    assert archive[:4] == b'darc'
    table = struct.unpack_from('<I', archive, 16)[0]
    count = struct.unpack_from('<I', archive, table+8)[0]
    cleared = 0
    for i in range(count):
        kind, offset, size = struct.unpack_from('<III', archive, table+i*12)
        if kind >> 24 or archive[offset+size-40:offset+size-36] != b'CLIM':
            continue
        # ETC1 (10) and A4 (13) both occupy four bits per pixel.
        # Use A4: zero ETC1 color alone would be opaque, not transparent.
        assert struct.unpack_from('<I', archive, offset+size-8)[0] in (10, 13)
        struct.pack_into('<I', archive, offset+size-8, 13)
        assert struct.unpack_from('<I', archive, offset+size-4)[0] == size-40
        archive[offset:offset+size-40] = bytes(size-40)
        cleared += 1
    assert cleared == 4
    return archive


if __name__ == '__main__':
    source = Path(sys.argv[1]).read_text().split('Homebrew_LZ')[1].split('{')[1].split('}')[0]
    template = bytes(int(v,16) for v in re.findall(r'0x([0-9A-Fa-f]+)', source))
    blank = clear_textures(decompress(template))
    packed = compress(blank)
    assert decompress(packed) == blank
    assert len(packed) <= 0x2000
    Path('assets/blank-logo.lz').write_bytes(packed + bytes(0x2000-len(packed)))
    print(f'Transparent launch archive: {len(packed)} bytes, padded to 8192')
