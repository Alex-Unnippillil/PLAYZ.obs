// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import { Library, Scissors, Settings, Activity, Circle, Square, BookmarkPlus, HardDrive, ShieldCheck, Power, Film, Search, ArrowRight, Mic, MicOff } from 'lucide-react';
import { api } from './lib/api';
import { busyPhase, bytes, duration, phaseLabel } from './lib/format';
import { typingTarget } from './lib/experience';
import { useAction } from './lib/hooks';
import { Button, Feedback, Modal } from './components/ui';
import { LibraryView } from './features/Library';
import { SettingsView } from './features/Settings';
import { ReviewView } from './features/Review';
import { ExportsView, DiagnosticsView } from './features/Operations';

type View = 'library' | 'review' | 'exports' | 'settings' | 'diagnostics';
type Destination = { view: View; id?: string } | { quit: true };
const navigation = [
  { id: 'library', label: 'Library', detail: 'Find, import and restore recordings', icon: Library },
  { id: 'exports', label: 'Export queue', detail: 'Track clips, cancel or retry a job', icon: Scissors },
  { id: 'settings', label: 'Capture settings', detail: 'Source, quality, sound and shortcuts', icon: Settings },
  { id: 'diagnostics', label: 'Diagnostics', detail: 'Local checks and catalog backup', icon: Activity },
] as const;
export default function App() {
  const [view, setView] = useState<View>('library');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const workspace = useRef<HTMLElement>(null);
  const client = useQueryClient();
  const action = useAction();
  const state = useQuery({ queryKey: ['state'], queryFn: api.state, refetchInterval: 1000 });
  const snapshot = state.data;
  useEffect(() => {
    if (!isTauri()) return;
    let closed = false; const cleanup: (() => void)[] = [];
    const subscriptions = [listen('playz:changed', () => { void client.invalidateQueries(); }), listen<string>('playz:notice', event => setNotice(event.payload))];
    for (const p of subscriptions) void p.then(unlisten => { if (closed) unlisten(); else cleanup.push(unlisten); }).catch(() => setNotice('Native event subscription failed. Status polling remains active.'));
    return () => { closed = true; cleanup.forEach(fn => fn()); };
  }, [client]);
  useEffect(() => {
    const preference = snapshot?.settings.theme ?? 'dark';
    const media = matchMedia('(prefers-color-scheme: light)');
    const apply = () => { document.documentElement.dataset.theme = preference === 'system' ? (media.matches ? 'light' : 'dark') : preference; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [snapshot?.settings.theme]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || typingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setQuickSearch(''); setQuickOpen(true);
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { workspace.current?.focus({ preventScroll: true }); }, [view, selected]);
  const active = snapshot?.phase === 'recording';
  const busy = snapshot ? busyPhase(snapshot.phase) : false;
  const configured = !!snapshot?.settings.target_id;
  function go(next: Destination) {
    if ('quit' in next) { void action.run(api.quit); return; }
    if (next.id) setSelected(next.id);
    setView(next.view);
  }
  function navigate(next: Destination) {
    if (settingsPending) return;
    setQuickOpen(false);
    if (view === 'settings' && settingsDirty && ('quit' in next || next.view !== 'settings')) setDestination(next);
    else go(next);
  }
  const matches = navigation.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(quickSearch.trim().toLowerCase()));
  return <div className="app-shell polished-shell">
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-symbol" aria-hidden="true">▶</span><div>PLAYZ<span>RECORD. REVIEW. KEEP.</span></div></div>
      <div className="build-label">LOCAL PREVIEW · 0.1</div>
      <nav aria-label="Main navigation">
        {navigation.filter(item => item.id !== 'diagnostics').map(item => <button type="button" key={item.id} className={view === item.id ? 'nav-item selected' : 'nav-item'} aria-current={view === item.id ? 'page' : undefined} disabled={settingsPending} onClick={() => navigate({ view: item.id })}><item.icon size={19} aria-hidden="true"/><span>{item.label}</span></button>)}
        {selected && <button type="button" className={view === 'review' ? 'nav-item selected' : 'nav-item'} aria-current={view === 'review' ? 'page' : undefined} disabled={settingsPending} onClick={() => navigate({ view: 'review' })}><Film size={19} aria-hidden="true"/><span>Match review</span></button>}
      </nav>
      <div className="sidebar-bottom">
        <Button className="quick-launch" onClick={() => { setQuickSearch(''); setQuickOpen(true); }}><Search size={16} aria-hidden="true"/>Quick actions<kbd>Ctrl K</kbd></Button>
        <button type="button" className={view === 'diagnostics' ? 'nav-item selected' : 'nav-item'} aria-current={view === 'diagnostics' ? 'page' : undefined} disabled={settingsPending} onClick={() => navigate({ view: 'diagnostics' })}><Activity size={17} aria-hidden="true"/>Diagnostics</button>
        <Button variant="ghost" busy={action.pending} disabled={settingsPending} onClick={() => navigate({ quit: true })}><Power size={16} aria-hidden="true"/>Quit safely</Button>
        <div className="local-note"><ShieldCheck size={15} aria-hidden="true"/><span>Local files. No account.</span></div>
      </div>
    </aside>
    <div className="workspace-shell">
      <header className="capture-bar">
        <div className="capture-state"><span className={active ? 'status-dot live' : 'status-dot'} aria-hidden="true"/><div>
          <strong>{!snapshot ? 'Connecting to PLAYZ' : !configured && !busy ? 'Choose your capture source' : phaseLabel[snapshot.phase]}</strong>
          <span title={snapshot?.settings.target_label}>{snapshot?.settings.target_label || 'Select a game or window in Capture settings'}</span>
        </div></div>
        {snapshot && <div className="capture-summary" aria-label="Saved capture profile">
          <span>{snapshot.settings.height}p · {snapshot.settings.fps} fps</span>
          <span>{snapshot.settings.microphone_id ? <Mic size={13} aria-hidden="true"/> : <MicOff size={13} aria-hidden="true"/>}{snapshot.settings.microphone_id ? 'Mic selected' : 'Mic off'}</span>
        </div>}
        {busy && <div className="record-metrics"><span className="timer">{duration(snapshot?.elapsed_ms ?? 0)}</span><span className="muted">{bytes(snapshot?.written_bytes ?? '0')}</span></div>}
        <div className="row">
          {active && <Button aria-label="Bookmark current recording" title={snapshot?.settings.hotkey_bookmark} busy={action.pending} onClick={() => void action.run(api.liveBookmark, 'Bookmark saved locally.')}><BookmarkPlus size={18} aria-hidden="true"/></Button>}
          {!configured && !busy ? <Button variant="primary" disabled={!snapshot || settingsPending} onClick={() => navigate({ view: 'settings' })}>Set up recording<ArrowRight size={16} aria-hidden="true"/></Button> : <Button variant={active ? 'danger' : 'primary'} busy={action.pending} disabled={!snapshot || (busy && !active) || (!active && settingsPending)} title={snapshot?.settings.hotkey_record} onClick={() => void action.run(active ? api.stop : () => api.start(crypto.randomUUID()))}>{active ? <Square size={15} fill="currentColor" aria-hidden="true"/> : <Circle size={15} fill="currentColor" aria-hidden="true"/>}{active ? 'Stop recording' : busy ? 'Finalizing…' : 'Record'}</Button>}
        </div>
      </header>
      <div className="global-messages"><Feedback error={state.error || action.error || snapshot?.error} message={action.message}/>{snapshot?.capture_warning && <div className="notice warning" role="status">{snapshot.capture_warning}</div>}{notice && <div className="notice row between" role="status">{notice}<Button variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button></div>}</div>
      <main ref={workspace} id="workspace" tabIndex={-1}>
        {view === 'library' && <LibraryView onOpen={id => navigate({ view: 'review', id })} onSetup={() => navigate({ view: 'settings' })} busy={busy}/>}
        {view === 'review' && <ReviewView key={selected ?? 'empty'} id={selected} onBack={() => navigate({ view: 'library' })} onExports={() => navigate({ view: 'exports' })} busy={busy}/>}
        {view === 'settings' && snapshot && <SettingsView settings={snapshot.settings} busy={busy} onDirtyChange={setSettingsDirty} onPendingChange={setSettingsPending}/>}
        {view === 'exports' && <ExportsView busy={busy}/>}
        {view === 'diagnostics' && <DiagnosticsView/>}
        {view === 'settings' && !snapshot && <p role="status">Capture settings are available when the local application core is connected.</p>}
      </main>
      <footer className="status-bar"><span><HardDrive size={13} aria-hidden="true"/>{snapshot ? `${bytes(snapshot.free_bytes)} free at last check` : 'Local connection unavailable'}</span><span>Originals preserved · Offline workflow</span></footer>
    </div>
    <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Quick actions" description="Jump to a workspace. Recording shortcuts are managed by the desktop application.">
      <label className="quick-search">Find a page or action<input autoFocus value={quickSearch} onChange={e => setQuickSearch(e.target.value)} placeholder="Library, capture, backup…"/></label>
      <div className="quick-results">{matches.map(item => <button type="button" key={item.id} disabled={settingsPending} onClick={() => navigate({ view: item.id })}><item.icon size={19} aria-hidden="true"/><span><strong>{item.label}</strong><span>{item.detail}</span></span><ArrowRight size={16} aria-hidden="true"/></button>)}{matches.length === 0 && <p className="muted" role="status">No matching actions. Try “capture” or “library”.</p>}</div>
      {snapshot && <div className="shortcut-reference"><span>Record / stop<kbd>{snapshot.settings.hotkey_record}</kbd></span><span>Live bookmark<kbd>{snapshot.settings.hotkey_bookmark}</kbd></span></div>}
    </Modal>
    <Modal open={!!destination} onClose={() => setDestination(null)} title="Keep your profile changes?" description="Your changes have not been saved. Stay to save them, or discard them and continue. Your recordings will not be changed.">
      <div className="row wrap"><Button variant="primary" onClick={() => setDestination(null)}>Stay and edit</Button><Button onClick={() => { const next = destination; setDestination(null); setSettingsDirty(false); if (next) go(next); }}>Discard and continue</Button></div>
    </Modal>
  </div>;
}
