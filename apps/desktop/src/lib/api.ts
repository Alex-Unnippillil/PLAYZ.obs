// SPDX-License-Identifier: GPL-2.0-or-later
import { invoke, isTauri, convertFileSrc } from '@tauri-apps/api/core';
import type { Bookmark, Capabilities, Details, Diagnostic, ExportJob, ExportRequest, LibraryPage, Recording, Settings, Snapshot } from '../contracts';

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Open the installed PLAYZ desktop application. A browser preview cannot record or access your library.');
  return invoke<T>(name, args);
}
// All paths originate from native pickers or registered asset IDs. No renderer
// shell, remote API, raw SQL, arbitrary path or runtime download is exposed.
export const api = {
  state: () => call<Snapshot>('app_state'),
  devices: () => call<Capabilities>('discover_devices'),
  list: (query: string, offset: number, favorites: boolean) => call<LibraryPage>('list_recordings', { query, offset, limit: 50, favorites }),
  recording: (id: string) => call<Recording>('get_recording', { id }),
  start: (requestId: string) => call<Snapshot>('start_recording', { requestId }),
  stop: () => call<Snapshot>('stop_recording'),
  chooseFolder: () => call<string | null>('choose_recording_folder'),
  settings: (settings: Settings) => call<Settings>('save_settings', { settings }),
  playback: async (id: string) => convertFileSrc(await call<string>('playback_asset', { id })),
  edit: (id: string, details: Details) => call<void>('edit_recording', { id, details }),
  remove: (id: string) => call<void>('remove_recording', { id }),
  restore: (id: string) => call<void>('restore_recording', { id }),
  resume: (id: string, positionMs: number) => call<void>('save_resume', { id, positionMs }),
  bookmarks: (id: string) => call<Bookmark[]>('list_bookmarks', { id }),
  saveBookmark: (bookmark: Bookmark) => call<Bookmark>('save_bookmark', { bookmark }),
  deleteBookmark: (id: string) => call<void>('delete_bookmark', { id }),
  liveBookmark: () => call<Bookmark>('live_bookmark'),
  queue: (request: ExportRequest) => call<ExportJob>('queue_export', { request }),
  exports: () => call<ExportJob[]>('list_exports'),
  cancel: (id: string) => call<void>('cancel_export', { id }),
  retry: (id: string) => call<void>('retry_export', { id }),
  reveal: (id: string) => call<void>('reveal_recording', { id }),
  revealExport: (id: string) => call<void>('reveal_export', { id }),
  recover: (id: string) => call<Recording>('recover_recording', { id }),
  import: () => call<Recording | null>('import_media'),
  relink: (id: string) => call<boolean>('relink_recording', { id }),
  diagnostics: () => call<Diagnostic[]>('diagnostics'),
  backup: () => call<string>('backup_library'),
  quit: () => call<void>('quit_application'),
};
