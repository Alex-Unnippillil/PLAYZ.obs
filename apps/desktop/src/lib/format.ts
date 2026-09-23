// SPDX-License-Identifier: GPL-2.0-or-later
import type { Phase } from '../contracts';
export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].slice(s >= 3600 ? 0 : 1).map(n => String(n).padStart(2, '0')).join(':');
}
export function bytes(value: string): string {
  try {
    const n = BigInt(value);
    if (n < 0n) return 'Unavailable';
    for (const [divisor, label] of [[1073741824n, 'GiB'], [1048576n, 'MiB'], [1024n, 'KiB']] as const) {
      if (n >= divisor) return `${Number(n * 10n / divisor) / 10} ${label}`;
    }
    return `${n} B`;
  } catch { return 'Unavailable'; }
}
export const busyPhase = (phase: Phase) => ['preparing', 'recording', 'finalizing'].includes(phase);
export const phaseLabel: Record<Phase, string> = { idle: 'Ready to record', preparing: 'Starting capture', recording: 'Recording', finalizing: 'Preparing playback', ready: 'Recording saved', interrupted: 'Recovery needed', failed: 'Needs attention' };
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : typeof error === 'string' ? error : 'The local operation failed. Check Diagnostics before trying again.';
export function trimError(start: number, end: number, total: number): string | null {
  if (![start, end, total].every(Number.isFinite)) return 'Enter finite timestamps in seconds.';
  if (start < 0 || end > total || end - start < 0.25) return 'Select at least 0.25 seconds within the recording.';
  return null;
}
export function filenameError(name: string): string | null {
  if (!name.trim() || name.length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return 'Use a valid Windows filename without path separators, reserved names or a trailing dot/space.';
  return null;
}
