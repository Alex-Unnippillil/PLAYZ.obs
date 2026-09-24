#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Collect successful renderer screenshots and identity metadata.

Read-only CI helper: no network, credentials, repository writes or media changes.
Images can be reviewed and committed through the ordinary contributor workflow.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

GALLERY = {
    'library-dark-1440.png': 'library-dark.png',
    'settings-light-1440.png': 'settings-light.png',
    'library-saved-views.png': 'saved-views.png',
    'capture-budget.png': 'capture-budget.png',
}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--results', type=Path, default=Path('artifacts/ui-results'))
    parser.add_argument('--output', type=Path, default=Path('artifacts/gallery'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    manifest: dict = {'schema_version': 1, 'source_commit': commit, 'kind': 'renderer_fixture',
                      'notice': 'UI fixture data only; not native capture or hardware evidence.', 'images': []}
    for source_name, target_name in GALLERY.items():
        paths = list(args.results.rglob(source_name))
        if len(paths) != 1:
            raise RuntimeError(f'Expected one passing screenshot named {source_name}, found {len(paths)}')
        data = paths[0].read_bytes()
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise RuntimeError(f'Not a PNG: {source_name}')
        shutil.copyfile(paths[0], args.output / target_name)
        item = {'path': f'docs/assets/{target_name}', 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
        item['git_blob_sha'] = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        manifest['images'].append(item)
    (args.output / 'gallery.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    main()
