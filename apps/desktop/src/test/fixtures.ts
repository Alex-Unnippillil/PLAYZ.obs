// SPDX-License-Identifier: GPL-2.0-or-later
// Test-only records; never imported into the production application.
import type { Capabilities, ExportJob, Recording, Settings, Snapshot } from '../contracts';
export const settingsFixture: Settings = {
  schema_version: 1, recording_folder: 'C:/Videos/PLAYZ', capture_kind: 'window',
  target_id: 'window-fixture', target_label: 'Practice session', encoder_id: 'obs_x264',
  width: 1920, height: 1080, fps: 30, bitrate_kbps: 10000,
  desktop_audio: false, audio_output_id: 'default', microphone_id: '',
  hotkey_record: 'Control+Shift+F9', hotkey_bookmark: 'Control+Shift+F10',
  hide_to_tray: true, theme: 'dark', reserve_gib: 5,
};
export const snapshotFixture: Snapshot = {
  phase: 'idle', recording_id: null, elapsed_ms: 0, written_bytes: '0',
  free_bytes: '107374182400', error: null, capture_warning: null, engine_connected: false,
  settings: settingsFixture,
};
export const devicesFixture: Capabilities = {
  protocol: 1, engine_version: 'fixture',
  targets: [{ id: 'window-fixture', label: 'Practice session', kind: 'window' }, { id: 'game-fixture', label: 'Game fixture', kind: 'game' }],
  encoders: [{ id: 'obs_x264', label: 'Software H.264', hardware: false, hardware_validated: false }],
  audio_inputs: [{ id: 'mic-fixture', label: 'USB microphone' }],
  audio_outputs: [{ id: 'default', label: 'Default output' }],
};
export const recordingFixture: Recording = {
  id: 'a1b2c3d4-1111-4111-8111-123456789abc', title: 'Practice session', created_at: '2026-09-24T12:00:00Z',
  phase: 'ready', duration_ms: 120000, bytes: '170000000', favorite: false, tags: ['practice'],
  notes: '', source_label: 'Selected window', capture_kind: 'window', has_playback: true, resume_ms: 0, error: null,
};
export function exportFixture(state: string, id = state): ExportJob {
  return { id, state, recording_id: recordingFixture.id, name: `${id}.mp4`, mode: 'accurate', start_ms: 0, end_ms: 15000, progress: state === 'completed' ? 100 : 25, error: state === 'failed' ? 'Disk unavailable' : null };
}
