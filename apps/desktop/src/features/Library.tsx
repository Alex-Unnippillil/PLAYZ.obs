// SPDX-License-Identifier: GPL-2.0-or-later
import './Library.css';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderInput, Search, Star, Play, ChevronLeft, ChevronRight, SlidersHorizontal, ArchiveRestore } from 'lucide-react';
import { api } from '../lib/api';
import { useAction, useDebounced } from '../lib/hooks';
import { bytes, duration, phaseLabel } from '../lib/format';
import { Button, Empty, Feedback, PageTitle } from '../components/ui';

const PAGE_SIZE = 50;
export function LibraryView({ onOpen, onSetup, busy }: { onOpen: (id: string) => void; onSetup: () => void; busy: boolean }) {
  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const [favorites, setFavorites] = useState(false);
  const [removed, setRemoved] = useState(false);
  // Bind each page to its filters so changing collection/search never requests
  // an old page offset against a new filter, even before effects have run.
  const filterKey = JSON.stringify([query, favorites, removed]);
  const [page, setPage] = useState({ key: '', offset: 0 });
  const offset = page.key === filterKey ? page.offset : 0;
  const action = useAction();
  const scroll = useRef<HTMLDivElement>(null);
  const removedControl = useRef<HTMLButtonElement>(null);
  const library = useQuery({
    queryKey: ['library', query, offset, favorites, removed],
    queryFn: () => removed ? api.listRemoved(query, offset, favorites) : api.list(query, offset, favorites),
    refetchInterval: 3000,
  });
  const items = library.data?.items ?? [];
  const total = library.data?.total;
  useEffect(() => { scroll.current?.scrollTo(0, 0); }, [filterKey]);
  useEffect(() => {
    // Restoring the last entry on a page must not strand users on an empty page.
    if (total !== undefined && offset > 0 && offset >= total) {
      setPage({ key: filterKey, offset: Math.floor(Math.max(0, total - 1) / PAGE_SIZE) * PAGE_SIZE });
      scroll.current?.scrollTo(0, 0);
    }
  }, [total, offset, filterKey]);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroll.current,
    getItemKey: index => items[index]?.id ?? index,
    estimateSize: () => 100,
    overscan: 5,
    initialRect: { width: 800, height: 500 },
  });
  function changeCollection(value: boolean) {
    setRemoved(value);
    setPage({ key: '', offset: 0 });
    action.clear();
  }
  function clearFilters() { setSearch(''); setFavorites(false); setPage({ key: '', offset: 0 }); }
  function movePage(next: number) {
    setPage({ key: filterKey, offset: next });
    scroll.current?.scrollTo(0, 0);
  }
  const filtered = !!query || favorites;
  const emptyTitle = filtered ? 'No matching recordings' : removed ? 'No removed recordings' : 'Your next session starts here';
  return <>
    <PageTitle eyebrow={removed ? 'LOCAL COLLECTION · REMOVED' : 'LOCAL COLLECTION'} title={removed ? 'Removed recordings' : 'Your recordings'} actions={<>
      <Button disabled={busy} busy={action.pending} onClick={() => void action.run(async () => { const item = await api.import(); if (item) onOpen(item.id); })}><FolderInput size={17}/>Import video</Button>
      <Button onClick={onSetup}><SlidersHorizontal size={17}/>Capture setup</Button>
    </>}>
      {removed ? 'Restore hidden entries to your library. This is not the Windows Recycle Bin.' : 'Find the moment. Keep the original. Everything stays local.'}
    </PageTitle>
    <Feedback error={library.error || action.error} message={action.message}/>
    <div className="row wrap library-collections" role="group" aria-label="Library collection">
      <Button aria-label="Show active recordings" aria-pressed={!removed} variant={!removed ? 'primary' : 'secondary'} onClick={() => changeCollection(false)}>Active</Button>
      <button type="button" ref={removedControl} className={`button button-${removed ? 'primary' : 'secondary'}`} aria-label="Show removed recordings" aria-pressed={removed} onClick={() => changeCollection(true)}><ArchiveRestore size={17} aria-hidden="true"/>Removed</button>
    </div>
    {removed && <div className="notice">
      Removal only hides an entry. Masters, playback copies, bookmarks and exports are preserved; queued exports are not cancelled.
      Restoring an entry does not recover a video deleted or moved outside PLAYZ. Reconnect its drive or use Relink in Match review when needed.
    </div>}
    <div className="toolbar">
      <label className="search"><Search size={18} aria-hidden="true"/><input aria-label="Search recordings" placeholder="Search titles, tags and notes" value={search} maxLength={200} onChange={e => setSearch(e.target.value)}/></label>
      <Button aria-pressed={favorites} onClick={() => setFavorites(!favorites)}><Star size={17} fill={favorites ? 'currentColor' : 'none'} aria-hidden="true"/>Favorites</Button>
      {(search || favorites) && <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>}
      <span className="muted count">{total !== undefined ? `${total} ${removed ? 'removed ' : ''}recordings` : 'Loading library…'}</span>
    </div>
    {library.isPending && <p role="status">Reading your local library…</p>}
    {library.data && items.length === 0 && <Empty title={emptyTitle}>
      {filtered ? <p>Change the search or clear the filters to see this collection.</p> : removed ? <p>Entries hidden with Remove entry appear here, including after restarting PLAYZ.<br/>Nothing is deleted automatically.</p> : <>
        <p>Select a game or window in Capture setup, save your profile, then press Record.<br/>After stopping, PLAYZ prepares a local playback copy and keeps your MKV master.</p>
        <Button variant="primary" onClick={onSetup}>Set up your first recording</Button>
        <p className="small">You can also import a local H.264 / AAC MKV or MP4 to test review and export.</p>
      </>}
    </Empty>}
    {items.length > 0 && <section aria-label={removed ? 'Removed recordings list' : 'Recordings'}>
      <div className={removed ? 'list-heading removed-heading' : 'list-heading'}><span>RECORDING / SOURCE</span><span>DURATION</span><span>SIZE</span><span>{removed ? 'RESTORE ENTRY' : 'STATUS'}</span></div>
      <div ref={scroll} className="virtual-list" role="list">
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map(row => {
            const item = items[row.index];
            if (!item) return null;
            const description = <>
              <span className="video-tile"><Play size={24} aria-hidden="true"/></span>
              <span className="recording-text"><strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString()} · {item.source_label || 'Local video'}</span>{item.tags.length > 0 && <span className="tags">{item.tags.slice(0, 3).join(' · ')}</span>}</span>
            </>;
            return <div role="listitem" className={removed ? 'recording-row removed-row' : 'recording-row'} key={item.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: row.size, transform: `translateY(${row.start}px)` }}>
              {removed ? <div className="recording-open">{description}</div> : <button className="recording-open" onClick={() => onOpen(item.id)} aria-label={`Open ${item.title}`}>{description}</button>}
              <span className="mono">{duration(item.duration_ms)}</span>
              <span className="muted">{bytes(item.bytes)}</span>
              {removed ? <Button aria-label={`Restore ${item.title}`} busy={action.pending} onClick={() => void action.run(async () => {
                await api.restore(item.id);
                // The restored row disappears on refetch. Leave keyboard focus
                // on a stable control, not the document body or a different row.
                removedControl.current?.focus();
              }, `Restored “${item.title}” to Active recordings. No media files were changed.`)}><ArchiveRestore size={16} aria-hidden="true"/>Restore</Button> : <>
                <span className={`phase-tag phase-${item.phase}`}>{phaseLabel[item.phase]}</span>
                <Button variant="ghost" aria-label={`${item.favorite ? 'Unfavorite' : 'Favorite'} ${item.title}`} aria-pressed={item.favorite} busy={action.pending} onClick={() => void action.run(() => api.edit(item.id, { title: item.title, tags: item.tags, notes: item.notes, favorite: !item.favorite }))}><Star size={17} fill={item.favorite ? 'currentColor' : 'none'} aria-hidden="true"/></Button>
              </>}
            </div>;
          })}
        </div>
      </div>
      <div className="pagination"><span className="muted">Showing {offset + 1}–{offset + items.length} of {total ?? 0}</span><div className="row">
        <Button aria-label="Previous page" disabled={offset === 0} onClick={() => movePage(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft size={17}/></Button>
        <Button aria-label="Next page" disabled={offset + PAGE_SIZE >= (total ?? 0)} onClick={() => movePage(offset + PAGE_SIZE)}><ChevronRight size={17}/></Button>
      </div></div>
    </section>}
  </>;
}
