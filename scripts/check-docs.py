#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Offline documentation checks; stdlib only, no network or media changes.

Checks local Markdown targets, README stack pins and recorded gallery integrity.
Chart fence checks are structural, not a claim to execute GitHub's Mermaid engine.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import tomllib
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
DOCS = ('README.md', 'docs/WORKSPACE_GUIDE.md')
EXPECTED_IMAGES = {'library-dark.png', 'saved-views.png', 'settings-light.png', 'capture-budget.png'}


def local_targets(root: Path, name: str, text: str) -> None:
    # Exclude fenced code so example paths are not treated as links.
    text = re.sub(r'```.*?```', '', text, flags=re.S)
    for target in re.findall(r'!?\[[^\]]*\]\(([^\s)]+)\)', text):
        parts = urlsplit(target)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        path = (root / name).parent / unquote(parts.path)
        resolved = path.resolve()
        if not resolved.is_relative_to(root.resolve()) or not resolved.exists():
            raise ValueError(f'{name}: missing or escaping local target: {target}')


def check_pins(root: Path, readme: str) -> int:
    table = readme.split('<!-- stack-pins:start -->', 1)[1].split('<!-- stack-pins:end -->', 1)[0]
    package = json.loads((root / 'apps/desktop/package.json').read_text())
    npm = {**package['dependencies'], **package['devDependencies']}
    aliases = {'react': 'React', 'typescript': 'TypeScript', '@tauri-apps/api': 'JavaScript API',
               'vite': 'Vite', 'tailwindcss': 'Tailwind CSS', '@radix-ui/react-dialog': 'Radix Dialog',
               'lucide-react': 'Lucide React', '@tanstack/react-query': 'TanStack Query',
               '@tanstack/react-virtual': 'Virtual', 'react-hook-form': 'React Hook Form',
               'zod': 'Zod', 'vitest': 'Vitest', '@testing-library/react': 'Testing Library React',
               '@playwright/test': 'Playwright', '@axe-core/playwright': 'axe-core Playwright'}
    pins = {label: npm[key] for key, label in aliases.items()}
    desktop = tomllib.loads((root / 'apps/desktop/src-tauri/Cargo.toml').read_text())
    core = tomllib.loads((root / 'crates/playz-core/Cargo.toml').read_text())
    workspace = tomllib.loads((root / 'Cargo.toml').read_text())['workspace']['dependencies']
    native = json.loads((root / 'third_party/native-lock.json').read_text())
    def version(value):
        return (value['version'] if isinstance(value, dict) else value).removeprefix('=')
    pins.update({'Tauri': version(desktop['dependencies']['tauri']),
                 'Tokio': version(workspace['tokio']), 'serde': version(workspace['serde']),
                 'ts-rs': version(workspace['ts-rs']), 'rusqlite': version(core['dependencies']['rusqlite']),
                 'rusqlite_migration': version(core['dependencies']['rusqlite_migration']),
                 'sha2': version(core['dependencies']['sha2']), 'OBS/libobs': native['obs']['version'],
                 'FFmpeg/ffprobe': native['ffmpeg']['version'], 'nlohmann/json': native['nlohmann_json']['version'],
                 'Node': (root / '.node-version').read_text().strip(),
                 'Rust': tomllib.loads((root / 'rust-toolchain.toml').read_text())['toolchain']['channel'],
                 'pnpm': json.loads((root / 'package.json').read_text())['packageManager'].split('@')[1]})
    for name, pin in pins.items():
        if f'{name} **{pin}**' not in table:
            raise ValueError(f'README stack pin missing or stale: {name} {pin}')
    return len(pins)


def verify_image(data: bytes, record: dict) -> None:
    if len(data) < 24 or not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Gallery image is not a PNG')
    width, height = struct.unpack('>II', data[16:24])
    if not (100 <= width <= 10000 and 100 <= height <= 20000):
        raise ValueError('Unexpected gallery dimensions')
    if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
        raise ValueError('Gallery byte identity mismatch')
    if hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() != record['git_blob_sha']:
        raise ValueError('Gallery Git blob mismatch')


def check_gallery(root: Path) -> int:
    manifest = json.loads((root / 'docs/assets/gallery.json').read_text())
    if manifest['schema_version'] != 1 or manifest['kind'] != 'renderer_fixture' or not re.fullmatch('[0-9a-f]{40}', manifest['source_commit']):
        raise ValueError('Invalid gallery provenance')
    seen = set()
    for image in manifest['images']:
        path = Path(image['path'])
        if path.parent.as_posix() != 'docs/assets' or path.name not in EXPECTED_IMAGES or path.name in seen:
            raise ValueError('Invalid or duplicated gallery target')
        seen.add(path.name)
        verify_image((root / path).read_bytes(), image)
    if seen != EXPECTED_IMAGES:
        raise ValueError('Incomplete gallery')
    return len(seen)


def self_test() -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory); (root / 'present.md').write_text('ok')
        local_targets(root, 'README.md', '[ok](present.md) [web](https://example.com/x)')
        for target in ('missing.md', '../escape.md'):
            try:
                local_targets(root, 'README.md', f'[bad]({target})')
            except ValueError:
                pass
            else:
                raise AssertionError('Missing/escaping link was accepted')
    data = b'\x89PNG\r\n\x1a\n' + b'\0'*8 + struct.pack('>II', 1440, 1000)
    record = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
              'git_blob_sha': hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()}
    verify_image(data, record)
    for changed in (data + b'x', b'not png'):
        try:
            verify_image(changed, record)
        except ValueError:
            pass
        else:
            raise AssertionError('Corrupted image was accepted')
    print('Documentation checker self-tests passed')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    for name in DOCS:
        text = (ROOT / name).read_text(encoding='utf-8')
        if text.count('```') % 2:
            raise ValueError(f'{name}: unclosed code fence')
        local_targets(ROOT, name, text)
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    charts = re.findall(r'```mermaid\n(.*?)```', readme, re.S)
    if len(charts) < 2 or any(not chart.strip().startswith('flowchart ') for chart in charts):
        raise ValueError('Expected the documented architecture/export flowcharts')
    pins, images = check_pins(ROOT, readme), check_gallery(ROOT)
    print(f'Documentation passed: {len(DOCS)} linked pages, {pins} stack pins, {images} image identities, {len(charts)} chart fences (structural only)')


if __name__ == '__main__':
    main()
