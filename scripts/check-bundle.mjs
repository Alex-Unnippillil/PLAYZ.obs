// SPDX-License-Identifier: GPL-2.0-or-later
// Build-size guard, not a startup-time or runtime-memory benchmark.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
export const LIMITS = { initialJs: 480 * 1024, chunkJs: 450 * 1024, totalJs: 800 * 1024 };
export const DEFERRED = ['src/features/Settings.tsx', 'src/features/Review.tsx', 'src/features/Operations.tsx'];
export function inspectBundle(dist, limits = LIMITS) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
  const entryKeys = Object.keys(manifest).filter(k => manifest[k].isEntry);
  if (entryKeys.length !== 1) throw new Error('Expected exactly one application entry');
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    if (!manifest[key]) throw new Error(`Missing manifest import: ${key}`);
    visited.add(key); for (const child of manifest[key].imports ?? []) visit(child);
  }
  visit(entryKeys[0]);
  for (const key of DEFERRED) {
    if (!manifest[key]?.isDynamicEntry || visited.has(key)) throw new Error(`Workspace must remain deferred: ${key}`);
  }
  const sizes = new Map();
  for (const value of Object.values(manifest)) {
    const relative = value.file;
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid bundle path');
    if (!relative.endsWith('.js') || sizes.has(relative)) continue;
    const content = fs.readFileSync(path.join(dist, relative));
    sizes.set(relative, { file: relative, bytes: content.length, gzipBytes: gzipSync(content).length });
  }
  const initial = new Set([...visited].map(k => manifest[k].file));
  const chunks = [...sizes.values()];
  const initialJs = chunks.filter(c => initial.has(c.file)).reduce((n, c) => n + c.bytes, 0);
  const totalJs = chunks.reduce((n, c) => n + c.bytes, 0);
  if (initialJs > limits.initialJs || totalJs > limits.totalJs || chunks.some(c => c.bytes > limits.chunkJs)) throw new Error(`JavaScript budget exceeded: initial=${initialJs}, total=${totalJs}`);
  return { schemaVersion: 1, initialJs, totalJs, limits, deferred: DEFERRED, chunks };
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = inspectBundle(path.join(root, 'apps/desktop/dist'));
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts/bundle-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Bundle budget passed: ${report.initialJs} initial JS bytes, ${report.totalJs} total; three secondary workspaces deferred.`);
}
