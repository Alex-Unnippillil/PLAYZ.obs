// SPDX-License-Identifier: GPL-2.0-or-later
import { expect, it } from 'vitest';
import { emptyPreferences, matchesSavedView, parseLibraryPreferences, savedViewError, type SavedView } from './libraryPreferences';
const view: SavedView = { id: 'view-one', name: 'Practice', query: '100%_ace', favorites: true, removed: false };
it('uses a fresh default without creating a stored value', () => { expect(parseLibraryPreferences(null)).toEqual(emptyPreferences()); expect(emptyPreferences()).not.toBe(emptyPreferences()); });
it('roundtrips Unicode and literal search punctuation without rewriting criteria', () => {
  const data = { version: 1, density: 'compact', views: [{ ...view, name: '勝利 highlights' }] };
  expect(parseLibraryPreferences(JSON.stringify(data))).toEqual(data);
});
it.each(['{broken', '{"version":2}', ' '.repeat(16385), JSON.stringify({ version: 1, density: 'other', views: [] }), JSON.stringify({ ...emptyPreferences(), views: Array(9).fill(view) }), JSON.stringify({ ...emptyPreferences(), views: [{ ...view, favorites: 'false' }] }), JSON.stringify({ ...emptyPreferences(), views: [{ ...view, query: 'x'.repeat(201) }] }), JSON.stringify({ ...emptyPreferences(), views: [view, { ...view, id: 'other', name: 'practice' }] })])('rejects malformed, unsupported or unbounded data without mutating it: %s', raw => { expect(() => parseLibraryPreferences(raw)).toThrow(); });
it('validates names and the saved-view limit', () => {
  expect(savedViewError('  ', [])).toBeTruthy(); expect(savedViewError('x'.repeat(41), [])).toBeTruthy();
  expect(savedViewError('practice', [view])).toContain('already exists'); expect(savedViewError('New', Array(8).fill(view))).toContain('Eight');
  expect(savedViewError('Evening', [view])).toBeNull();
});
it('matches all three criteria rather than just the saved view name', () => {
  expect(matchesSavedView(view, '100%_ace', true, false)).toBe(true);
  expect(matchesSavedView(view, '100%_ace', false, false)).toBe(false);
  expect(matchesSavedView(view, '100%_ace', true, true)).toBe(false);
  expect(matchesSavedView(view, 'other', true, false)).toBe(false);
});
