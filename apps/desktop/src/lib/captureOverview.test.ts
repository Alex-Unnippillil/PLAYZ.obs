// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { budgetLabel, resumeProgress, storageBudget } from './captureOverview';
import { recordingFixture, settingsFixture } from '../test/fixtures';
it('budgets two media copies and matches the configured native reserve', () => {
  const budget = storageBudget('107374182400', settingsFixture)!;
  expect(budget.reserveBytes).toBe('5368709120'); expect(budget.oneHourBytes).toBe('9172800000');
  expect(budget.seconds).toBe(Math.floor((107374182400 - 5368709120) / (10192 * 125 * 2)));
});
it('uses the two-minute native reserve floor at high bitrates', () => {
  expect(storageBudget('10737418240', { bitrate_kbps: 80000, reserve_gib: 0 })!.reserveBytes).toBe(String(80192 * 125 * 120));
});
it('shows unknown instead of treating a failed zero-byte disk reading as full', () => {
  for (const bytes of ['0', '-1', 'bad', '1.5', '9'.repeat(25)]) expect(storageBudget(bytes, settingsFixture)).toBeNull();
  expect(storageBudget('10000', { ...settingsFixture, bitrate_kbps: NaN })).toBeNull();
});
it('does not produce negative capacity below reserve and retains large counters', () => {
  expect(storageBudget('1024', settingsFixture)).toMatchObject({ belowReserve: true, seconds: 0 });
  expect(budgetLabel(storageBudget('9007199254740993', settingsFixture)!.seconds)).toBe('48+ hours');
});
it('formats approximate planning durations without false precision', () => {
  expect(budgetLabel(30)).toBe('Less than 1 min'); expect(budgetLabel(125)).toBe('2 min'); expect(budgetLabel(3720)).toBe('1h 2m');
});
it('shows a resume hint only for a valid playable unfinished position', () => {
  expect(resumeProgress({ ...recordingFixture, resume_ms: 30000 })).toEqual({ percent: 25, position: 30000 });
  for (const value of [0, -1, NaN, Infinity, 120000, 130000]) expect(resumeProgress({ ...recordingFixture, resume_ms: value })).toBeNull();
  expect(resumeProgress({ ...recordingFixture, resume_ms: 30000, phase: 'interrupted' })).toBeNull();
  expect(resumeProgress({ ...recordingFixture, resume_ms: 30000, has_playback: false })).toBeNull();
});
