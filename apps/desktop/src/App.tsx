// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import { Library, Scissors, Settings, Activity, Circle, Square, BookmarkPlus, HardDrive, ShieldCheck, Power, Film } from 'lucide-react';
import { api } from './lib/api';
import { busyPhase, bytes, duration, phaseLabel } from './lib/format';
import { useAction } from './lib/hooks';
import { Button, Feedback } from './components/ui';
import { LibraryView } from './features/Library';
import { SettingsView } from './features/Settings';
import { ReviewView } from './features/Review';
import { ExportsView, DiagnosticsView } from './features/Operations';

type View = 'library' | 'review' | 'exports' | 'settings' | 'diagnostics';
const navigation = [{ id: 'library', label: 'Library', icon: Library }, { id: 'review', label: 'Match review', icon: Film }, { id: 'exports', label: 'Export queue', icon: Scissors }, { id: 'settings', label: 'Capture settings', icon: Settings }, { id: 'diagnostics', label: 'Diagnostics', icon: Activity }] as const;
export default function App() {
  const [view, setView] = useState<View>('library');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const active = snapshot?.phase === 'recording';
  const busy = snapshot ? busyPhase(snapshot.phase) : false;
  function open(id: string) { setSelected(id); setView('review'); }
  return <div className="app-shell"><a className="skip-link" href="#workspace">Skip to workspace</a><aside className="sidebar"><div className="brand"><span className="brand-symbol" aria-hidden="true">▶</span><div>PLAYZ<span>YOUR GAME. YOUR FILES.</span></div></div><div className="build-label">LOCAL PREVIEW · 0.1</div><nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={view === item.id ? 'nav-item selected' : 'nav-item'} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}><item.icon size={19} aria-hidden="true"/>{item.label}</button>)}</nav><div className="sidebar-bottom"><ShieldCheck size={20} aria-hidden="true"/><strong>Private by design</strong><p>No account. No cloud upload.<br/>Originals stay on this computer.</p><Button variant="ghost" busy={action.pending} onClick={() => void action.run(api.quit)}><Power size={16} aria-hidden="true"/>Quit safely</Button></div></aside><div className="workspace-shell"><header className="capture-bar"><div className="capture-state"><span className={active ? 'status-dot live' : 'status-dot'} aria-hidden="true"/><div><strong>{snapshot ? phaseLabel[snapshot.phase] : 'Connecting to local library'}</strong><span>{snapshot?.settings.target_label || 'Choose a specific game or window to begin'}</span></div></div><div className="record-metrics"><span className="timer">{duration(snapshot?.elapsed_ms ?? 0)}</span><span className="muted">{bytes(snapshot?.written_bytes ?? '0')}</span></div><div className="row"><Button aria-label="Bookmark current recording" disabled={!active} busy={action.pending} onClick={() => void action.run(api.liveBookmark, 'Bookmark saved locally.')}><BookmarkPlus size={18}/></Button><Button variant={active ? 'danger' : 'primary'} busy={action.pending} disabled={!snapshot || (busy && !active) || (!active && !snapshot.settings.target_id)} onClick={() => void action.run(active ? api.stop : () => api.start(crypto.randomUUID()))}>{active ? <Square size={15} fill="currentColor"/> : <Circle size={15} fill="currentColor"/>}{active ? 'Stop recording' : 'Record'}</Button></div></header><div className="global-messages"><Feedback error={state.error || action.error || snapshot?.error} message={action.message}/>{snapshot?.capture_warning && <div className="notice warning" role="status">{snapshot.capture_warning}</div>}{notice && <div className="notice row between" role="status">{notice}<Button variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button></div>}</div><main id="workspace" tabIndex={-1}>{view === 'library' && <LibraryView onOpen={open} onSetup={() => setView('settings')} busy={busy}/>}{view === 'review' && <ReviewView id={selected} onBack={() => setView('library')} onExports={() => setView('exports')} busy={busy}/>}{view === 'settings' && snapshot && <SettingsView settings={snapshot.settings} busy={busy}/ >}{view === 'exports' && <ExportsView busy={busy}/>}{view === 'diagnostics' && <DiagnosticsView/>}{view === 'settings' && !snapshot && <p role="status">Capture settings are available when the local application core is connected.</p>}</main><footer className="status-bar"><span><HardDrive size={13} aria-hidden="true"/>{snapshot ? `${bytes(snapshot.free_bytes)} available at last disk check` : 'Local connection unavailable'}</span><span>H.264 / AAC · MKV masters · Offline workflow</span></footer></div></div>;
}
