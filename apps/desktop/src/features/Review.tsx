// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookmarkPlus, FolderOpen, RotateCcw, Pencil, Trash2, Scissors, Play } from 'lucide-react';
import type { Bookmark, Details, ExportMode } from '../contracts';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { duration, filenameError, trimError } from '../lib/format';
import { clipAround, typingTarget } from '../lib/experience';
import { Button, Empty, Feedback, Modal, PageTitle } from '../components/ui';
import { Disclosure } from '../components/Disclosure';

export function ReviewView({ id, onBack, onExports, busy }: { id: string | null; onBack: () => void; onExports: () => void; busy: boolean }) {
  const action = useAction();
  const video = useRef<HTMLVideoElement>(null);
  const lastResume = useRef(0);
  const previewing = useRef(false);
  const [position, setPosition] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [name, setName] = useState('clip');
  const [mode, setMode] = useState<ExportMode>('accurate');
  const [edit, setEdit] = useState<Details | null>(null);
  const [tagText, setTagText] = useState('');
  const [mark, setMark] = useState<Bookmark | null>(null);
  const [remove, setRemove] = useState(false);
  const [removed, setRemoved] = useState(false);
  const recording = useQuery({ queryKey: ['recording', id], queryFn: () => api.recording(id!), enabled: !!id, refetchInterval: 3000 });
  const item = recording.data;
  const playback = useQuery({ queryKey: ['playback', id, item?.has_playback], queryFn: () => api.playback(id!), enabled: !!id && !!item?.has_playback, staleTime: Infinity });
  const bookmarks = useQuery({ queryKey: ['bookmarks', id], queryFn: () => api.bookmarks(id!), enabled: !!id, refetchInterval: 3000 });
  useEffect(() => {
    setStart(0); setEnd((item?.duration_ms ?? 0) / 1000); setName(`clip-${id?.slice(0, 8) ?? 'local'}`);
    setPlayerError(null); setRemoved(false); lastResume.current = 0;
  }, [id, item?.duration_ms]);
  function seek(ms: number) {
    if (video.current && Number.isFinite(ms)) {
      previewing.current = false;
      video.current.currentTime = Math.min(item?.duration_ms ?? 0, Math.max(0, ms)) / 1000;
      setPosition(video.current.currentTime * 1000);
    }
  }
  function persistPosition(ms: number) {
    if (id && Number.isFinite(ms) && ms >= 0) void api.resume(id, ms).catch(e => setPlayerError(`Playback position was not saved: ${String(e)}`));
  }
  function bookmark() {
    if (!id || !playback.data) return;
    action.clear(); setMark({ id: crypto.randomUUID(), recording_id: id, position_ms: position, label: 'Bookmark', note: '' });
  }
  function playerKey(event: KeyboardEvent<HTMLDivElement>) {
    // Player-local only: never capture typing, repeat events, modified shortcuts,
    // native control/button activation, or shortcuts elsewhere in the app.
    if (!playback.data || !video.current || event.repeat || event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || typingTarget(event.target)) return;
    if (event.target !== event.currentTarget && event.target !== video.current) return;
    const key = event.key.toLowerCase();
    if (!['j', 'k', 'l', 'i', 'o', 'b'].includes(key)) return;
    event.preventDefault();
    const ms = video.current.currentTime * 1000;
    if (key === 'j') seek(ms - 5000);
    if (key === 'l') seek(ms + 5000);
    if (key === 'k') {
      if (video.current.paused) void video.current.play().catch(e => setPlayerError(String(e)));
      else video.current.pause();
    }
    if (key === 'i') setStart(Math.round(ms) / 1000);
    if (key === 'o') setEnd(Math.round(ms) / 1000);
    if (key === 'b' && id) { action.clear(); setMark({ id: crypto.randomUUID(), recording_id: id, position_ms: ms, label: 'Bookmark', note: '' }); }
  }
  if (!id) return <Empty title="Choose a recording to review"><p>Open a session from your local library to play, bookmark or trim it.</p><Button onClick={onBack}>Open library</Button></Empty>;
  if (!item) return <><Button onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>Library</Button><Feedback error={recording.error}/>{!recording.error && <p role="status">Loading recording…</p>}</>;
  const clipError = trimError(start, end, item.duration_ms / 1000) || filenameError(name);
  return <>
    <PageTitle eyebrow="REVIEW & CLIP" title={item.title} actions={<Button onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>Library</Button>}>{item.source_label} · {duration(item.duration_ms)} · Original preserved</PageTitle>
    <Feedback error={recording.error || playback.error || bookmarks.error || action.error || playerError || item.error} message={action.message}/>
    {removed && <div className="notice row between">Library entry removed; original files and exports were not deleted.<Button busy={action.pending} onClick={() => void action.run(async () => { await api.restore(id); setRemoved(false); })}>Undo removal</Button></div>}
    <div className="review-grid">
      <section>
        <div className="player" role="region" aria-label="Recording player" aria-keyshortcuts="J K L I O B" tabIndex={0} onKeyDown={playerKey}>
          {playback.data ? <video ref={video} src={playback.data} controls playsInline preload="metadata" aria-label={`Playback of ${item.title}`}
            onLoadedMetadata={e => { e.currentTarget.currentTime = Math.min(item.resume_ms / 1000, Math.max(0, e.currentTarget.duration - 0.05)); setPosition(e.currentTarget.currentTime * 1000); }}
            onError={() => setPlayerError('This playback copy could not be decoded. Open Recording tools and try Recover; the original remains unchanged.')}
            onPause={e => persistPosition(e.currentTarget.currentTime * 1000)}
            onTimeUpdate={e => {
              const ms = e.currentTarget.currentTime * 1000; setPosition(ms);
              if (Math.abs(ms - lastResume.current) >= 5000) { lastResume.current = ms; persistPosition(ms); }
              if (previewing.current && ms >= end * 1000) { previewing.current = false; e.currentTarget.pause(); }
            }}/>
            : <div className="player-empty"><Play size={42} aria-hidden="true"/><h2>Playback is not ready</h2><p>Finish recording first. Recover prepares a compatible copy of interrupted or imported media.</p><Button disabled={busy} busy={action.pending} onClick={() => void action.run(() => api.recover(id), 'Playback preparation completed.')}>Recover / prepare playback</Button></div>}
        </div>
        <div className="player-tools"><span className="mono">{duration(position)} / {duration(item.duration_ms)}</span><label>Speed<select defaultValue="1" onChange={e => { if (video.current) video.current.playbackRate = Number(e.target.value); }}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label><Button disabled={!playback.data} onClick={bookmark}><BookmarkPlus size={17} aria-hidden="true"/>Add bookmark</Button></div>
        <p className="player-shortcuts muted">Focus the player: J / L seek 5s · K play / pause · I / O trim · B bookmark</p>
        <section className="panel"><div className="section-title"><h2>Bookmarks & moments</h2><span className="muted small">{bookmarks.data?.length ?? 0} saved</span></div>
          {bookmarks.data?.length === 0 && <p className="muted">Mark a moment to find it again or build a clip around it.</p>}
          <div className="bookmark-list">{bookmarks.data?.map(b => <div className="bookmark-row" key={b.id}><button type="button" className="bookmark-seek" disabled={!playback.data} onClick={() => seek(b.position_ms)}><span className="mono">{duration(b.position_ms)}</span><span><strong>{b.label}</strong>{b.note && <span className="muted">{b.note}</span>}</span></button><Button variant="ghost" aria-label={`Edit bookmark ${b.label}`} onClick={() => { action.clear(); setMark({ ...b }); }}><Pencil size={15} aria-hidden="true"/></Button><Button variant="ghost" busy={action.pending} aria-label={`Delete bookmark ${b.label}`} onClick={() => void action.run(() => api.deleteBookmark(b.id), 'Bookmark deleted.')}><Trash2 size={15} aria-hidden="true"/></Button></div>)}</div>
          <p className="small muted">Manual bookmarks. League event ingestion is not enabled.</p>
        </section>
        <div className="row wrap"><Button busy={action.pending} onClick={() => void action.run(() => api.reveal(id))}><FolderOpen size={16} aria-hidden="true"/>Show original</Button><Button onClick={() => { action.clear(); setEdit({ title: item.title, favorite: item.favorite, notes: item.notes, tags: item.tags }); setTagText(item.tags.join(', ')); }}><Pencil size={16} aria-hidden="true"/>Title, tags & notes</Button></div>
        <Disclosure title="Recording tools" description="Recover playback, relink moved files or remove a library entry">
          <div className="row wrap recording-tools-row"><Button disabled={busy} busy={action.pending} onClick={() => void action.run(() => api.relink(id))}>Relink master</Button><Button disabled={busy} busy={action.pending} onClick={() => void action.run(() => api.recover(id), 'Playback copy verified.')}><RotateCcw size={16} aria-hidden="true"/>Recover</Button><Button disabled={busy || removed || action.pending} variant="ghost" onClick={() => { action.clear(); setRemove(true); }}>Remove entry</Button></div>
          <p className="small muted">Removal hides the entry only. Restore it from Library → Removed. Masters, bookmarks and exported clips remain on disk.</p>
        </Disclosure>
      </section>
      <aside className="panel clip-panel">
        <div className="eyebrow">NON-DESTRUCTIVE EDIT</div><h2>Make a clip</h2>
        <div className="clip-length"><strong>{clipError ? '—' : duration((end - start) * 1000)}</strong><span className="small muted">selected · {mode === 'accurate' ? 'Accurate export' : 'Fast export'}</span></div>
        <div className="clip-presets" role="group" aria-label="Quick clip selection">{[15, 30].map(seconds => <Button key={seconds} disabled={!playback.data || item.duration_ms < 250} title={`Select up to ${seconds} seconds around the playhead`} onClick={() => { const range = clipAround(position, item.duration_ms, seconds); if (range) { previewing.current = false; setStart(range.start); setEnd(range.end); } }}>{seconds}s around playhead</Button>)}<Button disabled={item.duration_ms < 250} onClick={() => { previewing.current = false; setStart(0); setEnd(item.duration_ms / 1000); }}>Full recording</Button></div>
        <div className="trim-fields"><label>In (seconds)<input aria-label="Trim in seconds" type="number" step="0.001" min="0" value={Number.isFinite(start) ? start : ''} onChange={e => { previewing.current = false; setStart(e.target.valueAsNumber); }}/><Button variant="ghost" aria-label="Set trim in to playhead" disabled={!playback.data} onClick={() => setStart(Math.round(position) / 1000)}>Use playhead</Button></label><label>Out (seconds)<input aria-label="Trim out seconds" type="number" step="0.001" min="0" value={Number.isFinite(end) ? end : ''} onChange={e => { previewing.current = false; setEnd(e.target.valueAsNumber); }}/><Button variant="ghost" aria-label="Set trim out to playhead" disabled={!playback.data} onClick={() => setEnd(Math.round(position) / 1000)}>Use playhead</Button></label></div>
        <label>Clip name<input value={name} maxLength={100} onChange={e => setName(e.target.value)}/></label>
        <Disclosure title="Export options" description={mode === 'accurate' ? 'Accurate H.264 / AAC · default' : 'Fast copy · keyframe-aligned'}>
          <label>Export method<select value={mode} onChange={e => setMode(e.target.value as ExportMode)}><option value="accurate">Accurate · re-encode H.264 / AAC</option><option value="fast">Fast · keyframe-aligned copy</option></select></label>
          <p className="small muted">{mode === 'accurate' ? 'Decodes and re-encodes the interval. Audio encoder padding can affect final duration.' : 'May include footage before the selected start. Fast mode is not frame-accurate.'}</p>
        </Disclosure>
        {mode === 'fast' && <p className="notice warning small">Fast mode may include footage before trim-in.</p>}
        {clipError && <p className="field-error" role="status">{clipError}</p>}
        <Button disabled={!playback.data || !!clipError} onClick={() => { if (video.current) { video.current.currentTime = start; previewing.current = true; void video.current.play().catch(e => setPlayerError(String(e))); } }}><Play size={16} aria-hidden="true"/>Preview interval</Button>
        <Button variant="primary" disabled={!!clipError || !item.has_playback} busy={action.pending} onClick={() => void action.run(async () => { await api.queue({ recording_id: id, start_ms: start * 1000, end_ms: end * 1000, name, mode }); onExports(); })}><Scissors size={17} aria-hidden="true"/>Queue export</Button>
        <p className="small muted">Clips get unique names in this recording’s exports folder. Encoding pauses during capture. No original is trimmed in place.</p>
      </aside>
    </div>
    <Modal open={!!edit} onClose={() => { if (!action.pending) setEdit(null); }} title="Recording details" description="Update local metadata, not the encoded video.">{edit && <form onSubmit={e => { e.preventDefault(); void action.run(async () => { await api.edit(id, { ...edit, tags: tagText.split(',').map(s => s.trim()).filter(Boolean) }); setEdit(null); }); }}><label>Title<input required maxLength={180} value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}/></label><label>Tags (comma-separated)<input value={tagText} onChange={e => setTagText(e.target.value)}/></label><label>Notes<textarea maxLength={10000} rows={5} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })}/></label><label className="check"><input type="checkbox" checked={edit.favorite} onChange={e => setEdit({ ...edit, favorite: e.target.checked })}/>Favorite</label><Feedback error={action.error}/><Button type="submit" variant="primary" busy={action.pending}>Save details</Button></form>}</Modal>
    <Modal open={!!mark} onClose={() => { if (!action.pending) setMark(null); }} title="Bookmark" description="Save a playback position. This is not a frame-accurate marker.">{mark && <form onSubmit={e => { e.preventDefault(); void action.run(async () => { await api.saveBookmark(mark); setMark(null); }); }}><label>Label<input required maxLength={120} value={mark.label} onChange={e => setMark({ ...mark, label: e.target.value })}/></label><label>Position (seconds)<input type="number" step="0.001" min={0} max={item.duration_ms / 1000} required value={Number.isFinite(mark.position_ms) ? mark.position_ms / 1000 : ''} onChange={e => setMark({ ...mark, position_ms: e.target.valueAsNumber * 1000 })}/></label><label>Note<textarea rows={3} maxLength={2000} value={mark.note} onChange={e => setMark({ ...mark, note: e.target.value })}/></label><Feedback error={action.error}/><Button type="submit" variant="primary" busy={action.pending}>Save bookmark</Button></form>}</Modal>
    <Modal open={remove} onClose={() => { if (!action.pending) setRemove(false); }} title="Remove library entry?" description="This hides the entry only. The original master, playback copy and exported clips stay on disk. Restore it later from Library → Removed, even after restarting. Queued exports are not cancelled."><Feedback error={action.error}/><div className="row"><Button disabled={action.pending} onClick={() => setRemove(false)}>Keep entry</Button><Button variant="danger" busy={action.pending} onClick={() => void action.run(async () => { await api.remove(id); setRemoved(true); setRemove(false); })}>Remove entry only</Button></div></Modal>
  </>;
}
