// SPDX-License-Identifier: GPL-2.0-or-later
import type { ExportJob, Settings } from '../contracts';

// These change only explicit quality fields, never capture/audio scope or encoder.
export const capturePresets = [
  { id: 'compact', label: 'Compact', detail: '720p · 30 fps', width: 1280, height: 720, fps: 30, bitrate_kbps: 6000 },
  { id: 'balanced', label: 'Balanced', detail: '1080p · 30 fps', width: 1920, height: 1080, fps: 30, bitrate_kbps: 10000 },
  { id: 'smooth', label: 'Smooth', detail: '1080p · 60 fps', width: 1920, height: 1080, fps: 60, bitrate_kbps: 16000 },
] as const;
export function selectedPreset(settings: Pick<Settings, 'width' | 'height' | 'fps' | 'bitrate_kbps'>): string {
  return capturePresets.find(p => p.width === settings.width && p.height === settings.height && p.fps === settings.fps && p.bitrate_kbps === settings.bitrate_kbps)?.id ?? 'custom';
}
/** An ordinary time selection, not a frame-accurate cut or automatic highlight. */
export function clipAround(positionMs: number, durationMs: number, seconds: number): { start: number; end: number } | null {
  if (![positionMs, durationMs, seconds].every(Number.isFinite) || durationMs < 250 || seconds < 0.25) return null;
  const total = durationMs / 1000;
  const length = Math.min(seconds, total);
  const position = Math.min(total, Math.max(0, positionMs / 1000));
  const start = Math.max(0, Math.min(total - length, position - length / 2));
  // Floor at millisecond precision so rounding never crosses recorded coverage.
  return { start: Math.floor(start * 1000) / 1000, end: Math.floor((start + length) * 1000) / 1000 };
}
export type ExportFilter = 'all' | 'active' | 'completed' | 'attention';
export function matchesExportFilter(job: ExportJob, filter: ExportFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ['queued', 'running'].includes(job.state);
  if (filter === 'attention') return ['failed', 'cancelled'].includes(job.state);
  return job.state === 'completed';
}
export function typingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}
