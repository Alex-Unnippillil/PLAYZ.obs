#!/usr/bin/env python3
"""Generate deterministic original PLAYZ icons without external fonts/assets."""
import pathlib
import struct
import zlib


def chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


def main() -> None:
    size = 256
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            inside = 75 <= x <= 191 and abs(y - 128) <= (191 - x) * 0.64
            color = (107, 229, 206, 255) if inside else (16, 21, 31, 255)
            pixels.extend(color)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(pixels), 9)) + chunk(b'IEND', b'')
    folder = pathlib.Path(__file__).resolve().parents[1] / 'apps/desktop/src-tauri/icons'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'icon.png').write_bytes(png)
    header = struct.pack('<HHH', 0, 1, 1) + struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22)
    (folder / 'icon.ico').write_bytes(header + png)
    print('Generated original 256-pixel RGBA PNG and ICO')


if __name__ == '__main__':
    main()
