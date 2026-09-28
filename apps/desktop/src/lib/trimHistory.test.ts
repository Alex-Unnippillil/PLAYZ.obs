// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { HISTORY_LIMIT, newTrimHistory, trimReducer } from './trimHistory';
it('initializes from coverage and rejects invalid reset durations', () => {
  expect(newTrimHistory(120).present).toEqual({ start: 0, end: 120 });
  for (const duration of [NaN, Infinity, -1]) expect(newTrimHistory(duration).present.end).toBe(0);
});
it('records a preset as one reversible edit without changing its caller', () => {
  const original = newTrimHistory(120);
  const changed = trimReducer(original, { type: 'set', patch: { start: 10, end: 25 } });
  expect(original.present).toEqual({ start: 0, end: 120 });
  const undone = trimReducer(changed, { type: 'undo' });
  expect(undone.present).toEqual(original.present);
  expect(trimReducer(undone, { type: 'redo' }).present).toEqual(changed.present);
});
it('coalesces a long slider gesture into a single undo step', () => {
  let state = newTrimHistory(120);
  for (let start = 1; start <= 90; start++) state = trimReducer(state, { type: 'preview', range: { start, end: 120 } });
  expect(state.past).toHaveLength(0);
  state = trimReducer(state, { type: 'commit' });
  expect(state.past).toHaveLength(1);
  expect(trimReducer(state, { type: 'undo' }).present.start).toBe(0);
  expect(trimReducer(state, { type: 'commit' })).toBe(state);
});
it('pointer cancellation restores the pre-gesture edit and redo stack', () => {
  let state = trimReducer(newTrimHistory(120), { type: 'set', patch: { start: 10 } });
  state = trimReducer(state, { type: 'undo' });
  const before = state;
  state = trimReducer(state, { type: 'preview', range: { start: 80, end: 120 } });
  state = trimReducer(state, { type: 'cancel' });
  expect(state).toEqual(before);
});
it('drops redo only after a genuinely different committed edit', () => {
  let state = trimReducer(newTrimHistory(120), { type: 'set', patch: { start: 10 } });
  state = trimReducer(state, { type: 'undo' });
  expect(trimReducer(state, { type: 'set', patch: { start: 0 } }).future).toHaveLength(1);
  expect(trimReducer(state, { type: 'set', patch: { end: 60 } }).future).toHaveLength(0);
});
it('keeps invalid numeric edits visible and makes them reversible', () => {
  const changed = trimReducer(newTrimHistory(120), { type: 'set', patch: { start: NaN } });
  expect(Number.isNaN(changed.present.start)).toBe(true);
  expect(trimReducer(changed, { type: 'set', patch: { start: NaN } })).toBe(changed);
  expect(trimReducer(changed, { type: 'undo' }).present.start).toBe(0);
});
it('bounds history and clears every edit on new coverage', () => {
  let state = newTrimHistory(1000);
  for (let start = 1; start <= 200; start++) state = trimReducer(state, { type: 'set', patch: { start } });
  expect(state.past).toHaveLength(HISTORY_LIMIT);
  for (let i = 0; i < 200; i++) state = trimReducer(state, { type: 'undo' });
  expect(state.future).toHaveLength(HISTORY_LIMIT);
  expect(state.present.start).toBe(150);
  expect(trimReducer(state, { type: 'reset', duration: 8 })).toEqual(newTrimHistory(8));
});
it('does not add a history entry when a drag returns to its origin', () => {
  const original = newTrimHistory(120);
  let state = trimReducer(original, { type: 'preview', range: { start: 10, end: 120 } });
  state = trimReducer(state, { type: 'preview', range: { start: 0, end: 120 } });
  expect(trimReducer(state, { type: 'commit' })).toEqual(original);
});
