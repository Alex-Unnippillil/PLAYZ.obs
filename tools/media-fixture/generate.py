#!/usr/bin/env python3
"""Generate labeled deterministic video and audible impulses; no downloaded assets."""
import argparse
import math
import pathlib
import struct
import subprocess
import wave

DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111']


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    width, height, fps, frames = 160, 96, 30, 120
    for n in range(frames):
        image = bytearray(bytes((18, 25, 35)) * width * height)
        def rect(x, y, w, h, color):
            for yy in range(y, y + h):
                for xx in range(x, x + w):
                    i = (yy * width + xx) * 3
                    image[i:i + 3] = bytes(color)
        for bit in range(8):
            rect(8 + bit * 18, 60, 14, 24, (245, 245, 245) if n & (1 << bit) else (18, 18, 18))
        for place, digit in enumerate(f'{n:03}'):
            for cell, enabled in enumerate(DIGITS[int(digit)]):
                if enabled == '1':
                    rect(10 + place * 15 + (cell % 3) * 3, 10 + (cell // 3) * 3, 3, 3, (245, 245, 245))
        rect(5 + n % 140, 35, 8, 8, (100, 220, 180))
        (output / f'frame-{n:03}.ppm').write_bytes(f'P6\n{width} {height}\n255\n'.encode() + image)
    with wave.open(str(output / 'audio.wav'), 'wb') as stream:
        stream.setnchannels(2)
        stream.setsampwidth(2)
        stream.setframerate(48000)
        samples = bytearray()
        for i in range(48000 * 4):
            # A 20-ms tone at every whole second, on both channels.
            value = int(16000 * math.sin(2 * math.pi * 1000 * i / 48000)) if i % 48000 < 960 else 0
            samples.extend(struct.pack('<hh', value, value))
        stream.writeframes(samples)
    ffmpeg = args.runtime.resolve() / 'media/ffmpeg.exe'
    command = [str(ffmpeg), '-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-framerate', str(fps), '-i', str(output / 'frame-%03d.ppm'), '-i', str(output / 'audio.wav'), '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-pix_fmt', 'yuv420p', '-g', '30', '-bf', '0', '-c:a', 'aac', '-ar', '48000', '-shortest', str(output / 'fixture.mkv')]
    subprocess.run(command, check=True, timeout=90)
    print('Created 120 labeled frames at 30 fps with synchronized 48-kHz audio impulses. Synthetic media does not prove game capture.')


if __name__ == '__main__':
    main()
