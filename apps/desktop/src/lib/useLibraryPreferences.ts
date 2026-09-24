// SPDX-License-Identifier: GPL-2.0-or-later
import { useRef, useState } from 'react';
import { emptyPreferences, LIBRARY_PREFERENCES_KEY, parseLibraryPreferences, type LibraryPreferences } from './libraryPreferences';

function load() {
  try { return { data: parseLibraryPreferences(localStorage.getItem(LIBRARY_PREFERENCES_KEY)), error: null as string | null, protected: false }; }
  catch { return { data: emptyPreferences(), error: 'Saved views could not be read. Existing preferences are preserved; changes apply only to this session.', protected: true }; }
}
export function useLibraryPreferences() {
  const [initial] = useState(load);
  const [preferences, setPreferences] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const protectedValue = useRef(initial.protected);
  function persist(next: LibraryPreferences): boolean {
    setPreferences(next);
    if (protectedValue.current) return false;
    try {
      localStorage.setItem(LIBRARY_PREFERENCES_KEY, JSON.stringify(next));
      setError(null); return true;
    } catch {
      setError('View preferences could not be saved. Changes apply only to this session; your recordings are unaffected.');
      return false;
    }
  }
  function reset(): boolean {
    try {
      localStorage.removeItem(LIBRARY_PREFERENCES_KEY);
      protectedValue.current = false; setPreferences(emptyPreferences()); setError(null); return true;
    } catch { setError('View preferences could not be reset. Your recordings are unaffected.'); return false; }
  }
  return { preferences, persist, reset, error };
}
