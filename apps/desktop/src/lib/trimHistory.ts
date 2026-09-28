// SPDX-License-Identifier: GPL-2.0-or-later
/** Session-local edit decisions, never media edits. Values use seconds. */
export type TrimRange = { start: number; end: number };
export type TrimHistory = { present: TrimRange; past: TrimRange[]; future: TrimRange[]; gesture: TrimRange | null };
export type TrimAction =
  | { type: 'reset'; duration: number }
  | { type: 'set'; patch: Partial<TrimRange> }
  | { type: 'preview'; range: TrimRange }
  | { type: 'commit' | 'cancel' | 'undo' | 'redo' };
export const HISTORY_LIMIT = 50;
export function newTrimHistory(duration: number): TrimHistory {
  return { present: { start: 0, end: Number.isFinite(duration) && duration > 0 ? duration : 0 }, past: [], future: [], gesture: null };
}
const equal = (a: TrimRange, b: TrimRange) => Object.is(a.start, b.start) && Object.is(a.end, b.end);
function commit(state: TrimHistory): TrimHistory {
  if (!state.gesture) return state;
  return equal(state.gesture, state.present) ? { ...state, gesture: null } : {
    ...state, past: [...state.past, state.gesture].slice(-HISTORY_LIMIT), future: [], gesture: null,
  };
}
export function trimReducer(state: TrimHistory, action: TrimAction): TrimHistory {
  if (action.type === 'reset') return newTrimHistory(action.duration);
  if (action.type === 'preview') return {
    ...state, gesture: state.gesture ?? state.present, present: { ...action.range },
  };
  if (action.type === 'cancel') return state.gesture ? { ...state, present: state.gesture, gesture: null } : state;
  const current = commit(state);
  if (action.type === 'commit') return current;
  if (action.type === 'set') {
    const present = { ...current.present, ...action.patch };
    // Retain invalid numeric input for validation instead of silently repairing it.
    if (equal(current.present, present)) return current;
    return { present, past: [...current.past, current.present].slice(-HISTORY_LIMIT), future: [], gesture: null };
  }
  if (action.type === 'undo' && current.past.length) return {
    present: current.past.at(-1)!, past: current.past.slice(0, -1),
    future: [current.present, ...current.future].slice(0, HISTORY_LIMIT), gesture: null,
  };
  if (action.type === 'redo' && current.future.length) return {
    present: current.future[0]!, past: [...current.past, current.present].slice(-HISTORY_LIMIT),
    future: current.future.slice(1), gesture: null,
  };
  return current;
}
