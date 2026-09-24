#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Collect successful renderer screenshots; optionally upload immutable Git blobs.

Run after the UI suite. Never mutates refs, replaces screenshots from failed tests,
prints tokens, or writes a recording. Requires GH_TOKEN only for --upload-blobs.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request

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
    parser.add_argument('--upload-blobs', action='store_true')
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
        if args.upload_blobs:
            # Narrow allowlist: manual run on this owner-controlled branch only.
            if os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch' or os.environ.get('GITHUB_REF') != 'refs/heads/work/ui-library-docs' or os.environ.get('GITHUB_REPOSITORY') != 'Alex-Unnippillil/PLAYZ.obs':
                raise RuntimeError('Blob upload is restricted to the manual documentation branch')
            payload = json.dumps({'content': base64.b64encode(data).decode(), 'encoding': 'base64'}).encode()
            req = urllib.request.Request('https://api.github.com/repos/Alex-Unnippillil/PLAYZ.obs/git/blobs', data=payload,
                headers={'Authorization': f'Bearer {os.environ["GH_TOKEN"]}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req, timeout=60) as response:
                item['git_blob_sha'] = json.load(response)['sha']
            expected = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
            if item['git_blob_sha'] != expected:
                raise RuntimeError('Uploaded Git blob identity mismatch')
        manifest['images'].append(item)
    (args.output / 'gallery.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))

if __name__ == '__main__':
    main()
