// SPDX-License-Identifier: GPL-2.0-or-later
// Renderer-only convenience state. Never stores recordings, paths or credentials.
export const LIBRARY_PREFERENCES_KEY = 'playz.library.preferences.v1';
export const MAX_SAVED_VIEWS = 8;
export type LibraryDensity = 'comfortable' | 'compact';
export interface SavedView { id: string; name: string; query: string; favorites: boolean; removed: boolean }
export interface LibraryPreferences { version: 1; density: LibraryDensity; views: SavedView[] }
export const emptyPreferences = (): LibraryPreferences => ({ version: 1, density: 'comfortable', views: [] });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseLibraryPreferences(raw: string | null): LibraryPreferences {
  if (raw === null) return emptyPreferences();
  if (raw.length > 16384) throw new Error('View preferences exceed their size limit.');
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !['comfortable', 'compact'].includes(String(value.density)) || !Array.isArray(value.views) || value.views.length > MAX_SAVED_VIEWS) throw new Error('Unsupported view preferences.');
  const ids = new Set<string>(); const names = new Set<string>();
  const views = value.views.map((v: unknown): SavedView => {
    if (!object(v) || typeof v.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40 || /[\u0000-\u001f]/.test(v.name) || typeof v.query !== 'string' || v.query.length > 200 || typeof v.favorites !== 'boolean' || typeof v.removed !== 'boolean') throw new Error('Invalid saved view.');
    const name = v.name.trim();
    if (ids.has(v.id) || names.has(name.toLowerCase())) throw new Error('Duplicate saved views.');
    ids.add(v.id); names.add(name.toLowerCase());
    return { id: v.id, name, query: v.query, favorites: v.favorites, removed: v.removed };
  });
  return { version: 1, density: value.density as LibraryDensity, views };
}
export function savedViewError(name: string, views: SavedView[]): string | null {
  if (!name.trim() || name.trim().length > 40 || /[\u0000-\u001f]/.test(name)) return 'Use a name between 1 and 40 characters.';
  if (views.length >= MAX_SAVED_VIEWS) return 'Eight views are already saved. Remove a saved view to make room.';
  if (views.some(v => v.name.toLowerCase() === name.trim().toLowerCase())) return 'A view with this name already exists.';
  return null;
}
export function matchesSavedView(view: SavedView, query: string, favorites: boolean, removed: boolean): boolean {
  return view.query === query && view.favorites === favorites && view.removed === removed;
}
