// SPDX-License-Identifier: GPL-2.0-or-later
import type { Recording, Settings } from '../contracts';
const GIB = 1073741824n;
export interface StorageBudget { reserveBytes: string; oneHourBytes: string; seconds: number; belowReserve: boolean }
/** Planning estimate, NOT live capacity or a guarantee. Match the Rust reserve
 * floor and budget a second full-size copy for the remuxed playback asset.
 * AAC is budgeted at 192 kbps even when audio is off. No filesystem access. */
export function storageBudget(freeBytes: string, settings: Pick<Settings, 'bitrate_kbps' | 'reserve_gib'>): StorageBudget | null {
  if (!/^\d{1,24}$/.test(freeBytes) || !Number.isSafeInteger(settings.bitrate_kbps) || settings.bitrate_kbps <= 0 || !Number.isSafeInteger(settings.reserve_gib) || settings.reserve_gib < 0) return null;
  const free = BigInt(freeBytes);
  // The native snapshot also uses zero when no disk reading was available.
  if (free === 0n) return null;
  const perSecond = (BigInt(settings.bitrate_kbps) + 192n) * 125n;
  const floor = perSecond * 120n;
  const configured = BigInt(settings.reserve_gib) * GIB;
  const reserve = configured > floor ? configured : floor;
  const available = free > reserve ? free - reserve : 0n;
  return { reserveBytes: String(reserve), oneHourBytes: String(perSecond * 7200n), seconds: Number(available / (perSecond * 2n)), belowReserve: free < reserve };
}
export function budgetLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'Less than 1 min';
  if (seconds >= 48 * 3600) return '48+ hours';
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}
/** Use persisted player position only. No frame-accurate or watched-completion claim. */
export function resumeProgress(recording: Recording): { percent: number; position: number } | null {
  if (recording.phase !== 'ready' || !recording.has_playback || !Number.isFinite(recording.duration_ms) || !Number.isFinite(recording.resume_ms) || recording.duration_ms <= 0 || recording.resume_ms <= 0 || recording.resume_ms >= recording.duration_ms) return null;
  return { percent: recording.resume_ms / recording.duration_ms * 100, position: recording.resume_ms };
}
