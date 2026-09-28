// SPDX-License-Identifier: GPL-2.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectBundle, DEFERRED } from './check-bundle.mjs';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playz-bundle-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.vite')); fs.mkdirSync(path.join(root, 'assets'));
  const manifest = { 'index.html': { file: 'assets/main.js', isEntry: true, imports: ['shared'] }, shared: { file: 'assets/shared.js' } };
  DEFERRED.forEach((key, i) => { manifest[key] = { file: `assets/page${i}.js`, isDynamicEntry: true, imports: ['shared'] }; });
  for (const record of Object.values(manifest)) fs.writeFileSync(path.join(root, record.file), 'x'.repeat(10));
  const write = () => fs.writeFileSync(path.join(root, '.vite/manifest.json'), JSON.stringify(manifest)); write();
  return { root, manifest, write };
}
test('counts a shared initial chunk once and records all deferred code', t => {
  const { root } = fixture(t); const result = inspectBundle(root);
  assert.equal(result.initialJs, 20); assert.equal(result.totalJs, 50); assert.equal(result.chunks.length, 5);
});
test('fails when a secondary page is accidentally pulled into the initial graph', t => {
  const f = fixture(t); f.manifest['index.html'].imports.push(DEFERRED[0]); f.write();
  assert.throws(() => inspectBundle(f.root), /must remain deferred/);
});
test('rejects missing chunks and missing manifest dependencies', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, 'assets/main.js'));
  assert.throws(() => inspectBundle(f.root), /ENOENT/);
  f.manifest['index.html'].imports.push('missing'); f.write();
  assert.throws(() => inspectBundle(f.root), /Missing manifest import/);
});
test('fails oversized output without relaxing the thresholds', t => {
  const f = fixture(t); assert.throws(() => inspectBundle(f.root, { initialJs: 15, totalJs: 500, chunkJs: 100 }), /budget exceeded/);
});
test('rejects escaping manifest paths', t => {
  const f = fixture(t); f.manifest.shared.file = '../outside.js'; f.write();
  assert.throws(() => inspectBundle(f.root), /Invalid bundle path/);
});
