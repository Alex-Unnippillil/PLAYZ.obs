// SPDX-License-Identifier: GPL-2.0-or-later
import { useRef, useState } from 'react';
import { BookmarkPlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button, Feedback, Modal } from '../components/ui';
import { MAX_SAVED_VIEWS, matchesSavedView, savedViewError, type SavedView } from '../lib/libraryPreferences';
import { useLibraryPreferences } from '../lib/useLibraryPreferences';

export type ViewPreferences = ReturnType<typeof useLibraryPreferences>;
export function LibraryViews({ store, query, favorites, removed, onApply }: {
  store: ViewPreferences; query: string; favorites: boolean; removed: boolean; onApply: (view: SavedView) => void;
}) {
  const [dialog, setDialog] = useState<'save' | 'manage' | 'reset' | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const manageHeading = useRef<HTMLParagraphElement>(null);
  const { preferences, persist } = store;
  const error = savedViewError(name, preferences.views);
  function save() {
    if (error) return;
    const view: SavedView = { id: crypto.randomUUID(), name: name.trim(), query, favorites, removed };
    const saved = persist({ ...preferences, views: [...preferences.views, view] });
    setDialog(null); setMessage(saved ? `Saved view “${view.name}” on this computer.` : `View “${view.name}” is available for this session only.`);
  }
  return <>
    <div className="saved-views" aria-label="Saved library views">
      <span className="saved-views-label">SAVED VIEWS</span>
      <div className="saved-view-chips">{preferences.views.map(view => <Button key={view.id} className="saved-view" aria-label={`Apply saved view: ${view.name}`} aria-pressed={matchesSavedView(view, query, favorites, removed)} onClick={() => { onApply(view); setMessage(null); }}>{view.name}</Button>)}</div>
      <Button variant="ghost" aria-label="Save current library view" disabled={preferences.views.length >= MAX_SAVED_VIEWS} onClick={() => { setName(''); setDialog('save'); }}><BookmarkPlus size={16} aria-hidden="true"/>Save view</Button>
      {(preferences.views.length > 0 || store.error) && <Button variant="ghost" aria-label="Manage saved library views" onClick={() => { setDialog('manage'); setMessage(null); }}><SlidersHorizontal size={15} aria-hidden="true"/>Manage</Button>}
    </div>
    <Feedback error={store.error} message={message}/>
    <Modal open={dialog === 'save'} onClose={() => setDialog(null)} title="Save this library view" description="Keep this search, favorite filter and collection on this computer. Views are shortcuts, not copies of your recordings.">
      <form onSubmit={event => { event.preventDefault(); save(); }}>
        <label>View name<input data-initial-focus value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Practice highlights" aria-describedby="saved-view-name-help"/></label>
        <p id="saved-view-name-help" className={name && error ? 'field-error small' : 'muted small'}>{name && error ? error : 'Use a unique name. Up to eight views can be saved.'}</p>
        <dl className="view-criteria"><div><dt>Collection</dt><dd>{removed ? 'Removed' : 'Active'}</dd></div><div><dt>Search</dt><dd>{query || 'All titles, tags and notes'}</dd></div><div><dt>Favorites</dt><dd>{favorites ? 'Only favorites' : 'Any recording'}</dd></div></dl>
        <p className="muted small">Only names, search terms, filter choices and display density are stored in WebView local storage. Nothing is uploaded. Catalog backups do not include these preferences.</p>
        <Button type="submit" variant="primary" disabled={!!error}>Save view</Button>
      </form>
    </Modal>
    <Modal open={dialog === 'manage'} onClose={() => setDialog(null)} title="Manage saved views" description="Removing a saved view only removes its shortcut. Recordings, bookmarks and exports stay unchanged.">
      <p ref={manageHeading} tabIndex={-1} className="muted small">{preferences.views.length} of {MAX_SAVED_VIEWS} views saved</p>
      <div className="managed-views">{preferences.views.map(view => <div key={view.id} className="managed-view"><div><strong>{view.name}</strong><span>{view.removed ? 'Removed' : 'Active'}{view.favorites ? ' · Favorites' : ''} · {view.query || 'All recordings'}</span></div><Button variant="ghost" aria-label={`Remove saved view: ${view.name}`} onClick={() => { const saved = persist({ ...preferences, views: preferences.views.filter(item => item.id !== view.id) }); manageHeading.current?.focus(); setMessage(saved ? `Removed saved view “${view.name}”. Recordings unchanged.` : 'View removed for this session only.'); }}><Trash2 size={16} aria-hidden="true"/></Button></div>)}</div>
      <Button onClick={() => setDialog('reset')}>Reset view preferences</Button>
    </Modal>
    <Modal open={dialog === 'reset'} onClose={() => setDialog(null)} title="Reset view preferences?" description="This removes all saved view shortcuts and resets display density. The recording catalog, settings, bookmarks and media files are not changed.">
      <div className="row wrap"><Button variant="primary" onClick={() => setDialog('manage')}>Keep preferences</Button><Button onClick={() => { if (store.reset()) { setDialog(null); setMessage('View preferences reset. Recordings unchanged.'); } }}>Reset preferences</Button></div>
      <Feedback error={store.error}/>
    </Modal>
  </>;
}
