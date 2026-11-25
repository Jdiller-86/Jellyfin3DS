"""Run from the repository root with Python 3, cc, ffprobe and libx264-enabled ffmpeg."""
import json
from pathlib import Path
import struct
import subprocess
import tempfile


def frame_hashes(path):
    result = subprocess.check_output([
        "ffmpeg", "-loglevel", "error", "-i", path, "-map", "0:v", "-f", "framemd5", "-"
    ], text=True)
    return [line.rsplit(",", 1)[1].strip() for line in result.splitlines() if not line.startswith("#")]


def demux_packets(path):
    result = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_packets",
        "-show_data", "-show_entries", "packet=data", "-of", "json", path
    ])
    for packet in json.loads(result)["packets"]:
        data = bytearray()
        for line in packet["data"].splitlines():
            if line:
                # ffprobe prints an offset, hex words, two spaces, then ASCII.
                data.extend(bytes.fromhex(line.split(": ", 1)[1].split("  ", 1)[0]))
        yield struct.pack("<I", len(data)) + data


with tempfile.TemporaryDirectory() as scratch:
    directory = Path(scratch)
    harness = directory / "replay"
    subprocess.run([
        "cc", "-fsanitize=address,undefined", "-fno-sanitize-recover=all",
        "-Itest/mvd-stubs", "-Ivendor/jellyfin-3ds/include",
        "test/mvd-transport.c", "-o", harness
    ], check=True)
    for width, height, slices in [(400, 240, 1), (400, 224, 4), (320, 180, 2), (256, 144, 1)]:
        original = directory / "original.ts"
        submitted = directory / "submitted.h264"
        subprocess.run([
            "ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi",
            "-i", f"testsrc2=size={width}x{height}:rate=24", "-frames:v", "48",
            "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1",
            "-refs", "2", "-g", "12", "-x264-params", f"slices={slices}",
            "-f", "mpegts", original
        ], check=True)
        with submitted.open("wb") as output:
            subprocess.run([harness, str(width), str(height)],
                           input=b"".join(demux_packets(original)), stdout=output, check=True)
        expected = frame_hashes(original)
        assert len(expected) == 48 and frame_hashes(submitted) == expected
        print(f"{width}x{height}, {slices} slice(s): all 48 frame hashes match")
