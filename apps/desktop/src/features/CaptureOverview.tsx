// SPDX-License-Identifier: GPL-2.0-or-later
import { Monitor, AudioLines, HardDrive, ArrowUpRight } from 'lucide-react';
import type { Snapshot } from '../contracts';
import { bytes } from '../lib/format';
import { budgetLabel, storageBudget } from '../lib/captureOverview';
import { Button } from '../components/ui';
import { Disclosure } from '../components/Disclosure';

export function CaptureOverview({ snapshot, stale = false, onSetup }: { snapshot: Snapshot; stale?: boolean; onSetup: () => void }) {
  const { settings } = snapshot;
  const budget = stale ? null : storageBudget(snapshot.free_bytes, settings);
  const sound = settings.desktop_audio ? (settings.microphone_id ? 'System + microphone' : 'System audio') : settings.microphone_id ? 'Microphone only' : 'No audio selected';
  return <section className="capture-overview" aria-label="Recording overview">
    <div className="overview-heading"><span className="eyebrow">YOUR LOCAL WORKSPACE</span><Button variant="ghost" onClick={onSetup}>Edit capture profile<ArrowUpRight size={14} aria-hidden="true"/></Button></div>
    <div className="overview-grid">
      <div className="overview-cell"><Monitor size={18} aria-hidden="true"/><div><span>Saved source</span><strong title={settings.target_label}>{settings.target_label || 'Choose a game or window'}</strong><small>{settings.target_id ? `${settings.height}p · ${settings.fps} fps · not hardware-qualified` : 'Explicit selection required before recording'}</small></div></div>
      <div className="overview-cell"><AudioLines size={18} aria-hidden="true"/><div><span>Capture audio</span><strong>{sound}</strong><small>{settings.microphone_id ? 'Microphone explicitly selected' : 'Microphone stays off until selected'}</small></div></div>
      <div className="overview-cell"><HardDrive size={18} aria-hidden="true"/><div><span>Estimated recording budget</span><strong>{budget ? budget.belowReserve ? 'Below configured reserve' : `~${budgetLabel(budget.seconds)}` : 'Disk reading unavailable'}</strong><small>Includes master + playback · last disk check</small></div></div>
    </div>
    <Disclosure title="How this estimate works" description="Planning only. Recording, audio and storage still need a short test on this computer.">
      <p className="muted small">Budget = (last reported free bytes − the larger of your reserve or two minutes of output) ÷ twice the configured video + 192 kbps audio rate. The second copy allows for MP4 playback. Actual bitrate, temporary exports and other disk writes can change capacity; this is not a guaranteed session length or a live measurement.</p>
      {budget && <p className="small">At this profile, one recorded hour plus its playback copy uses approximately <strong>{bytes(budget.oneHourBytes)}</strong>. Reserved: <strong>{bytes(budget.reserveBytes)}</strong>.</p>}
      <p className="muted small">The last disk check occurs at app startup, recording start or during recording. Device selection does not prove working video or sound. Verify a short recording and export before important sessions.</p>
    </Disclosure>
  </section>;
}
