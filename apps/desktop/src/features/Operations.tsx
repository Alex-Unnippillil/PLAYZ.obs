// SPDX-License-Identifier: GPL-2.0-or-later
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, RefreshCw, X, Database, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { duration } from '../lib/format';
import { matchesExportFilter, type ExportFilter } from '../lib/experience';
import { Button, Empty, Feedback, PageTitle } from '../components/ui';

const filters: { id: ExportFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'active', label: 'In progress' },
  { id: 'completed', label: 'Completed' }, { id: 'attention', label: 'Needs attention' },
];
export function ExportsView({ busy }: { busy: boolean }) {
  const action = useAction();
  const [filter, setFilter] = useState<ExportFilter>('all');
  const jobs = useQuery({ queryKey: ['exports'], queryFn: api.exports, refetchInterval: 1000 });
  const items = (jobs.data ?? []).filter(job => matchesExportFilter(job, filter));
  return <>
    <PageTitle eyebrow="YOUR CLIPS" title="Export queue">Track an export, retry a failed job, or open a finished clip. Originals stay intact.</PageTitle>
    <Feedback error={jobs.error || action.error} message={action.message}/>
    {busy && <div className="notice warning" role="status">Encoding pauses during capture. It restarts from trim-in afterward, not from an encoded byte offset.</div>}
    <div className="filter-strip" role="group" aria-label="Export filters">{filters.map(item => <Button key={item.id} aria-label={`Filter exports: ${item.label}`} aria-pressed={filter === item.id} variant="ghost" onClick={() => setFilter(item.id)}>{item.label}<span className="filter-count">{jobs.data ? jobs.data.filter(job => matchesExportFilter(job, item.id)).length : '—'}</span></Button>)}</div>
    {jobs.isPending && <p role="status">Reading export jobs…</p>}
    {jobs.data && items.length === 0 && <Empty title={jobs.data.length === 0 ? 'No exports queued' : 'No clips in this view'}><p>{jobs.data.length === 0 ? 'Open a recording, select your trim interval and choose Queue export.' : 'Choose another filter to see your other exports.'}</p>{filter !== 'all' && <Button onClick={() => setFilter('all')}>Show all exports</Button>}</Empty>}
    <div className="job-list">{items.map(job => {
      const running = ['running', 'queued'].includes(job.state);
      const percent = Number.isFinite(job.progress) ? Math.max(0, Math.min(100, job.progress)) : 0;
      return <article className="panel job" key={job.id}>
        <div className="row between"><div><h2>{job.name}</h2><p className="muted">{duration(job.start_ms)} → {duration(job.end_ms)} · {job.mode === 'accurate' ? 'Accurate H.264 / AAC' : 'Fast · keyframe-aligned copy'}</p></div><span className={`phase-tag phase-${job.state}`}>{busy && job.state === 'queued' ? 'Waiting for capture' : job.state.replaceAll('_', ' ')}</span></div>
        {running && <progress max={100} value={percent} aria-label={`Export progress for ${job.name}`}/>}
        <div className="row between"><span className="mono small muted">{running ? `${Math.round(percent)}%` : job.state === 'completed' ? 'Saved locally' : 'Original preserved'}</span><div className="row">
          {running && <Button busy={action.pending} onClick={() => void action.run(() => api.cancel(job.id))}><X size={16} aria-hidden="true"/>Cancel</Button>}
          {['failed', 'cancelled'].includes(job.state) && <Button busy={action.pending} onClick={() => void action.run(() => api.retry(job.id))}><RefreshCw size={16} aria-hidden="true"/>Retry</Button>}
          {job.state === 'completed' && <Button busy={action.pending} onClick={() => void action.run(() => api.revealExport(job.id))}><FolderOpen size={16} aria-hidden="true"/>Show clip</Button>}
        </div></div>
        {job.error && <p className={job.state === 'failed' ? 'field-error' : 'muted small'}>{job.error}</p>}
      </article>;
    })}</div>
  </>;
}
export function DiagnosticsView() {
  const action = useAction();
  const diagnostics = useQuery({ queryKey: ['diagnostics'], queryFn: api.diagnostics, refetchInterval: 5000 });
  return <><PageTitle eyebrow="LOCAL SYSTEM STATUS" title="Diagnostics" actions={<Button busy={diagnostics.isFetching} onClick={() => void diagnostics.refetch()}><RefreshCw size={17} aria-hidden="true"/>Refresh</Button>}>Presence checks are not proof of successful capture. Validate your first recording on this computer.</PageTitle><Feedback error={diagnostics.error || action.error} message={action.message}/><div className="diagnostic-list">{diagnostics.data?.map(d => <section className="panel diagnostic" key={d.name}><div className="row between"><h2>{d.name}</h2><span className={`phase-tag phase-${d.status}`}>{d.status.replaceAll('_', ' ')}</span></div><p className="muted">{d.detail}</p></section>)}</div><section className="panel"><h2><Database size={18} aria-hidden="true"/>Consistent library backup</h2><p>Back up the SQLite catalog through its backup API. Video masters and playback files are separate; this action does not copy them.</p><Button busy={action.pending} onClick={() => void action.run(async () => { const result = await api.backup(); return result; }, 'Consistent local catalog backup created and shown in Explorer. Copy video folders separately.')}><Database size={17} aria-hidden="true"/>Create catalog backup</Button></section><section className="panel"><h2><ShieldCheck size={18} aria-hidden="true"/>Troubleshooting without uploading your files</h2><p>For interrupted capture, preserve the master and use Recover in Match review. For a missing drive, reconnect it or use Relink. For capture errors, refresh devices and explicitly choose the same game/window again.</p><p className="muted">No diagnostics are sent anywhere. Review any information before manually sharing it. Signing, real Windows 11 installation and sustained GPU capture evidence are tracked in the repository release checklist.</p></section></>;
}
