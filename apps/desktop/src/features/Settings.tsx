// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RefreshCw, FolderOpen, Save, MicOff, Monitor, Keyboard, SlidersHorizontal } from 'lucide-react';
import type { Settings } from '../contracts';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { capturePresets, selectedPreset } from '../lib/experience';
import { Button, Feedback, PageTitle } from '../components/ui';
import { Disclosure } from '../components/Disclosure';

export const settingsSchema = z.strictObject({
  schema_version: z.number().int().refine(n => n === 1), recording_folder: z.string().min(1),
  capture_kind: z.string().refine(s => s === 'game' || s === 'window'), target_id: z.string().max(2048), target_label: z.string().max(2048), encoder_id: z.string().min(1).max(2048),
  width: z.number().int(), height: z.number().int(), fps: z.number().refine(n => n === 30 || n === 60), bitrate_kbps: z.number().int().min(2000).max(80000),
  desktop_audio: z.boolean(), audio_output_id: z.string().max(2048), microphone_id: z.string().max(2048),
  hotkey_record: z.string().min(1).max(80), hotkey_bookmark: z.string().min(1).max(80), hide_to_tray: z.boolean(),
  theme: z.string().refine(s => ['dark', 'light', 'system'].includes(s)), reserve_gib: z.number().int().min(1).max(100),
}).superRefine((s, ctx) => {
  if (!((s.width === 1920 && s.height === 1080) || (s.width === 1280 && s.height === 720))) ctx.addIssue({ code: 'custom', path: ['width'], message: 'Choose 1080p or 720p.' });
  if (s.hotkey_record === s.hotkey_bookmark) ctx.addIssue({ code: 'custom', path: ['hotkey_bookmark'], message: 'Choose different shortcuts.' });
});
export function SettingsView({ settings, busy, onDirtyChange, onPendingChange }: {
  settings: Settings; busy: boolean; onDirtyChange?: (dirty: boolean) => void; onPendingChange?: (pending: boolean) => void;
}) {
  const action = useAction();
  const [advanced, setAdvanced] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const devices = useQuery({ queryKey: ['devices'], queryFn: api.devices, enabled: !busy, staleTime: Infinity, refetchOnWindowFocus: false });
  const form = useForm<Settings>({ resolver: zodResolver(settingsSchema), defaultValues: settings, shouldFocusError: false });
  const { register, watch, setValue, reset, handleSubmit, formState: { errors, isDirty } } = form;
  const values = watch();
  const { capture_kind: kind, target_id: target, encoder_id: encoderId } = values;
  const incoming = JSON.stringify(settings);
  const lastIncoming = useRef(incoming);
  // Polling returns new object identities. Only a changed saved profile may
  // reset a pristine form; neither polling nor a save may resurrect old values.
  useEffect(() => {
    if (!isDirty && lastIncoming.current !== incoming) { lastIncoming.current = incoming; reset(settings); }
  }, [incoming, isDirty, reset, settings]);
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => { onPendingChange?.(action.pending); }, [action.pending, onPendingChange]);
  useEffect(() => () => { onDirtyChange?.(false); onPendingChange?.(false); }, [onDirtyChange, onPendingChange]);
  const targets = devices.data?.targets.filter(t => t.kind === kind) ?? [];
  const encoder = devices.data?.encoders.find(e => e.id === encoderId);
  const preset = selectedPreset(values);
  const change = { shouldDirty: true, shouldValidate: true };
  const inputs = devices.data?.audio_inputs ?? [];
  const outputs = devices.data?.audio_outputs ?? [];
  return <>
    <PageTitle eyebrow="YOUR CAPTURE PROFILE" title="Set up your recording">Choose what to capture. Fine-tune only what you need.</PageTitle>
    <Feedback error={devices.error || action.error} message={action.message}/>
    {busy && <div className="notice warning" role="status">Capture is busy. Stop and finalize before changing this profile.</div>}
    <form noValidate onSubmit={handleSubmit(values => action.run(async () => {
      const saved = await api.settings(values); reset(saved);
    }, 'Profile saved. Make a short recording and check picture and sound before a long session.'), () => {
      setAdvanced(true); requestAnimationFrame(() => errorSummary.current?.focus());
    })}>
      <fieldset disabled={busy || action.pending}>
        <div className="setup-layout">
          <section className="panel setup-source">
            <div className="section-title"><h2><Monitor size={18} aria-hidden="true"/>Video source</h2><Button busy={devices.isFetching} onClick={() => void devices.refetch()}><RefreshCw size={16} aria-hidden="true"/>Refresh devices</Button></div>
            <div className="form-two">
              <label>Capture scope<select value={kind} onChange={e => { setValue('capture_kind', e.target.value, change); setValue('target_id', '', change); setValue('target_label', '', change); }}><option value="window">Specific window</option><option value="game">Specific game</option></select></label>
              <label>Game or window<select value={target} onChange={e => { const t = targets.find(v => v.id === e.target.value); setValue('target_id', t?.id ?? '', change); setValue('target_label', t?.label ?? '', change); }}><option value="">Choose a target</option>{target && !targets.some(t => t.id === target) && <option value={target}>Saved target unavailable — refresh or reselect</option>}{targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            </div>
            <p className="small muted">Open your game, then refresh. Capture never falls back to your whole desktop.</p>
            <label>Video encoder<select {...register('encoder_id')}>{!devices.data?.encoders.some(e => e.id === encoderId) && <option value={encoderId}>{encoderId} — discovery pending</option>}{devices.data?.encoders.map(e => <option key={e.id} value={e.id}>{e.label}{e.hardware ? ' · hardware' : ' · software'}</option>)}</select></label>
            <p className="small muted">{encoder?.hardware ? 'Detected, not hardware-qualified. Test this encoder on your computer; PLAYZ will not silently choose another.' : 'Software H.264 uses CPU resources. Check game performance with a short test.'}</p>
            <div className="section-title quality-heading"><h2>Recording quality</h2><span className="small muted">{preset === 'custom' ? 'Custom profile' : 'H.264 · SDR'}</span></div>
            <div className="preset-grid" role="group" aria-label="Recording quality presets">{capturePresets.map(p => <button type="button" key={p.id} className="quality-preset" aria-pressed={preset === p.id} aria-label={`${p.label} quality`} onClick={() => {
              setValue('width', p.width, change); setValue('height', p.height, change); setValue('fps', p.fps, change); setValue('bitrate_kbps', p.bitrate_kbps, change);
            }}><strong>{p.label}</strong><span>{p.detail}</span></button>)}</div>
            <p className="small muted">{values.height}p · {values.fps} fps · {(values.bitrate_kbps / 1000).toLocaleString()} Mb/s. Presets change quality only and are not hardware recommendations.</p>
          </section>
          <section className="panel setup-audio">
            <h2><MicOff size={18} aria-hidden="true"/>Audio & privacy</h2>
            <label className="check"><input type="checkbox" {...register('desktop_audio')}/>Record selected system-output audio</label>
            <label>System audio device<select {...register('audio_output_id')} disabled={!values.desktop_audio}><option value="default">Windows default output</option>{values.audio_output_id !== 'default' && !outputs.some(d => d.id === values.audio_output_id) && <option value={values.audio_output_id}>Saved output unavailable — reselect to change</option>}{outputs.filter(d => d.id !== 'default').map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <p className="small muted">Includes other apps using this output. This is not isolated game audio.</p>
            <label>Microphone (explicit opt-in)<select {...register('microphone_id')}><option value="">Off — do not capture microphone</option>{values.microphone_id && !inputs.some(d => d.id === values.microphone_id) && <option value={values.microphone_id}>Saved microphone unavailable — reselect to change</option>}{inputs.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <p className="small muted">One mixed 48 kHz track. No separate tracks or live meters in this preview.</p>
          </section>
          <section className="panel setup-storage">
            <h2><FolderOpen size={18} aria-hidden="true"/>Storage & appearance</h2>
            <div className="storage-fields"><label>Recording folder<input readOnly value={values.recording_folder} aria-label="Recording folder"/></label><Button onClick={() => void action.run(async () => { const folder = await api.chooseFolder(); if (folder) setValue('recording_folder', folder, change); })}><FolderOpen size={16} aria-hidden="true"/>Choose local folder</Button><label>Appearance<select {...register('theme')}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow Windows</option></select></label></div>
            <p className="small muted">Use local NTFS storage with room for the MKV master and MP4 playback copy. Appearance also applies when you save.</p>
          </section>
        </div>
        <Disclosure title="Advanced settings" description="Custom quality, disk reserve, global shortcuts and tray behavior" open={advanced} onOpenChange={setAdvanced}>
          <div className="advanced-grid">
            <section><h2><SlidersHorizontal size={18} aria-hidden="true"/>Quality & storage limits</h2><div className="form-two">
              <label>Resolution<select value={`${values.width}x${values.height}`} onChange={e => { const full = e.target.value === '1920x1080'; setValue('width', full ? 1920 : 1280, change); setValue('height', full ? 1080 : 720, change); }}><option value="1920x1080">1920 × 1080 · SDR</option><option value="1280x720">1280 × 720 · SDR</option></select></label>
              <label>Frame rate<select {...register('fps', { valueAsNumber: true })}><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label>
              <label>Video bitrate (kbps)<input type="number" min={2000} max={80000} step={1000} {...register('bitrate_kbps', { valueAsNumber: true })}/></label>
              <label>Minimum free-space reserve (GiB)<input type="number" min={1} max={100} {...register('reserve_gib', { valueAsNumber: true })}/></label>
            </div><p className="small muted">H.264 / AAC only; no HDR. Disk reserve is a safety floor, not a storage quota. Originals are never deleted automatically.</p></section>
            <section><h2><Keyboard size={18} aria-hidden="true"/>Shortcuts & desktop</h2><label>Start / stop recording<input {...register('hotkey_record')} placeholder="Control+Shift+F9"/></label><label>Bookmark current recording<input {...register('hotkey_bookmark')} placeholder="Control+Shift+F10"/></label><p className="small muted">Conflicts are checked when saving. Key-repeat events are suppressed.</p><label className="check"><input type="checkbox" {...register('hide_to_tray')}/>Closing the window hides PLAYZ to the tray</label><p className="small muted">Quit safely stops and finalizes active capture before exiting. Global shortcuts always use your last saved profile.</p></section>
          </div>
        </Disclosure>
      </fieldset>
      {Object.keys(errors).length > 0 && <div ref={errorSummary} tabIndex={-1} className="notice error validation-summary" role="alert"><strong>Check your profile</strong>{Object.entries(errors).map(([field, error]) => <p key={field}>{field.replaceAll('_', ' ')}: {error?.message ?? 'Invalid value'}</p>)}</div>}
      <div className="save-bar"><span className="muted">{isDirty ? 'Unsaved changes · Record uses your saved profile.' : 'Saved on this computer'}</span><div className="row"><Button disabled={!isDirty || busy || action.pending} onClick={() => reset(settings)}>Discard changes</Button><Button type="submit" variant="primary" disabled={!isDirty || busy} busy={action.pending}><Save size={17} aria-hidden="true"/>Save profile</Button></div></div>
    </form>
    <p className="preview-boundary small muted">Unsigned preview. Verify a short recording and export before an important session. Windows 11 offline, real-game/audio/GPU and sustained-session qualification remain open. No account, cloud upload or enabled League automation.</p>
  </>;
}
