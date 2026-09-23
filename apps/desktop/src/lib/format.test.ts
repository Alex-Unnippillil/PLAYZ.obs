import { describe, expect, it } from 'vitest';
import { bytes, busyPhase, duration, filenameError, trimError } from './format';
describe('safe local display and edits', () => {
  it.each([[0, '00:00'], [61000, '01:01'], [3600000, '01:00:00'], [NaN, '00:00'], [-1, '00:00']])('formats time %s', (ms, expected) => expect(duration(ms)).toBe(expected));
  it('handles byte counters above JavaScript safe integer range', () => { expect(bytes('9007199254740993')).toBe('8388608 GiB'); expect(bytes('bad')).toBe('Unavailable'); expect(bytes('-1')).toBe('Unavailable'); });
  it.each(['../clip', 'CON', 'NUL.mp4', 'LPT1', 'clip.', 'clip ', '', 'a:b', 'x\u0000y'])('rejects unsafe clip filename %s', name => expect(filenameError(name)).not.toBeNull());
  it('accepts Unicode filenames without treating media as code', () => expect(filenameError('勝利 — round 2')).toBeNull());
  it.each([[NaN, 1, 2], [0, Infinity, 2], [-1, 1, 2], [1, 1.1, 2], [0, 3, 2]])('rejects invalid trim %s %s', (start, end, total) => expect(trimError(start, end, total)).not.toBeNull());
  it('accepts exact valid boundaries', () => expect(trimError(0, 0.25, 0.25)).toBeNull());
  it('does not equate ready with active recording', () => { expect(busyPhase('ready')).toBe(false); expect(busyPhase('preparing')).toBe(true); expect(busyPhase('finalizing')).toBe(true); });
});
