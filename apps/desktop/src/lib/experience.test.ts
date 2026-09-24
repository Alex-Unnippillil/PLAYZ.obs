// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { capturePresets, clipAround, matchesExportFilter, selectedPreset, typingTarget } from './experience';
import { exportFixture, settingsFixture } from '../test/fixtures';
import { settingsSchema } from '../features/Settings';

it('recognizes every supported preset and validates each profile', () => {
  for (const preset of capturePresets) {
    const next = { ...settingsFixture, width: preset.width, height: preset.height, fps: preset.fps, bitrate_kbps: preset.bitrate_kbps };
    expect(selectedPreset(next)).toBe(preset.id);
    expect(settingsSchema.safeParse(next).success).toBe(true);
  }
  expect(selectedPreset({ ...settingsFixture, bitrate_kbps: 12345 })).toBe('custom');
});
it.each([
  [60000, 120000, 30, { start: 45, end: 75 }],
  [0, 120000, 15, { start: 0, end: 15 }],
  [120000, 120000, 30, { start: 90, end: 120 }],
  [2000, 4000, 30, { start: 0, end: 4 }],
  [-5000, 4000, 1, { start: 0, end: 1 }],
  [999999, 4000, 1, { start: 3, end: 4 }],
])('keeps a quick clip inside recorded coverage (%s, %s, %s)', (position, total, seconds, expected) => {
  expect(clipAround(position, total, seconds)).toEqual(expected);
});
it.each([[NaN, 1000, 1], [0, Infinity, 1], [0, 249, 15], [0, 1000, -1]])('rejects invalid quick ranges (%s, %s, %s)', (position, total, seconds) => {
  expect(clipAround(position, total, seconds)).toBeNull();
});
it('retains millisecond precision without crossing fractional media duration', () => {
  const range = clipAround(1234, 4111.25, 30)!;
  expect(range.start).toBe(0); expect(range.end).toBeLessThanOrEqual(4.11125);
});
it('classifies only supported job states and preserves unknown jobs in All', () => {
  expect(matchesExportFilter(exportFixture('queued'), 'active')).toBe(true);
  expect(matchesExportFilter(exportFixture('running'), 'active')).toBe(true);
  expect(matchesExportFilter(exportFixture('failed'), 'attention')).toBe(true);
  expect(matchesExportFilter(exportFixture('cancelled'), 'attention')).toBe(true);
  expect(matchesExportFilter(exportFixture('completed'), 'completed')).toBe(true);
  expect(matchesExportFilter(exportFixture('completed'), 'active')).toBe(false);
  expect(matchesExportFilter(exportFixture('future-state'), 'all')).toBe(true);
  expect(matchesExportFilter(exportFixture('future-state'), 'completed')).toBe(false);
});
it('guards editable targets, including descendants of contenteditable', () => {
  for (const tag of ['input', 'textarea', 'select']) expect(typingTarget(document.createElement(tag))).toBe(true);
  const editor = document.createElement('div'); editor.contentEditable = 'true'; editor.setAttribute('contenteditable', 'true');
  const child = document.createElement('span'); editor.append(child);
  expect(typingTarget(child)).toBe(true);
  expect(typingTarget(document.createElement('button'))).toBe(false);
  expect(typingTarget(null)).toBe(false);
});
