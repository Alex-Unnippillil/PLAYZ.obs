// SPDX-License-Identifier: GPL-2.0-or-later
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { createLocalClient } from '../lib/query';
import { recordingFixture, exportFixture } from '../test/fixtures';
import { ReviewView } from './Review';
vi.mock('../lib/api', () => ({ api: { recording: vi.fn(), playback: vi.fn(), bookmarks: vi.fn(), resume: vi.fn(), queue: vi.fn(), saveBookmark: vi.fn(), remove: vi.fn() } }));
const clients: QueryClient[] = [];
function mount() { const client = createLocalClient(); clients.push(client); const onExports = vi.fn(); render(<QueryClientProvider client={client}><ReviewView id={recordingFixture.id} onBack={vi.fn()} onExports={onExports} busy={false}/></QueryClientProvider>); return { onExports }; }
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(api.recording).mockResolvedValue(recordingFixture);
  vi.mocked(api.playback).mockResolvedValue('asset://fixture.mp4'); vi.mocked(api.bookmarks).mockResolvedValue([]);
  vi.mocked(api.resume).mockResolvedValue(undefined); vi.mocked(api.queue).mockResolvedValue(exportFixture('queued'));
});
afterEach(() => clients.splice(0).forEach(client => client.clear()));
it('selects a short range and queues exactly that interval with accurate export by default', async () => {
  const { onExports } = mount();
  const quick = await screen.findByRole('button', { name: '15s around playhead' });
  await waitFor(() => expect(quick).toBeEnabled()); fireEvent.click(quick);
  expect(screen.getByLabelText('Trim in seconds')).toHaveValue(0);
  expect(screen.getByLabelText('Trim out seconds')).toHaveValue(15);
  fireEvent.click(screen.getByRole('button', { name: 'Queue export' }));
  await waitFor(() => expect(api.queue).toHaveBeenCalledWith(expect.objectContaining({ recording_id: recordingFixture.id, start_ms: 0, end_ms: 15000, mode: 'accurate' })));
  await waitFor(() => expect(onExports).toHaveBeenCalledTimes(1));
});
it('does not queue invalid or blank trim values', async () => {
  mount(); await screen.findByLabelText('Trim in seconds');
  fireEvent.change(screen.getByLabelText('Trim in seconds'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Queue export' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('finite timestamps');
  expect(api.queue).not.toHaveBeenCalled();
});
it('keeps repair/removal actions behind a keyboard-accessible disclosure', async () => {
  mount(); await screen.findByRole('button', { name: 'Recording tools' });
  expect(screen.queryByRole('button', { name: 'Remove entry' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Recording tools' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove entry' }));
  expect(screen.getByRole('dialog', { name: 'Remove library entry?' })).toHaveTextContent('Queued exports are not cancelled');
  expect(api.remove).not.toHaveBeenCalled();
});
it('keeps the fast-copy boundary warning visible even after options collapse', async () => {
  mount(); await screen.findByRole('button', { name: 'Export options' });
  fireEvent.click(screen.getByRole('button', { name: 'Export options' }));
  fireEvent.change(screen.getByLabelText('Export method'), { target: { value: 'fast' } });
  fireEvent.click(screen.getByRole('button', { name: 'Export options' }));
  expect(screen.getByText('Fast mode may include footage before trim-in.')).toBeVisible();
});
it('uses player-local shortcuts without intercepting text entry', async () => {
  mount(); const quick = await screen.findByRole('button', { name: '15s around playhead' });
  await waitFor(() => expect(quick).toBeEnabled());
  const player = screen.getByRole('region', { name: 'Recording player' });
  const video = screen.getByLabelText(`Playback of ${recordingFixture.title}`) as HTMLVideoElement;
  video.currentTime = 40;
  fireEvent.keyDown(player, { key: 'i' });
  expect(screen.getByLabelText('Trim in seconds')).toHaveValue(40);
  fireEvent.keyDown(player, { key: 'l' }); expect(video.currentTime).toBe(45);
  fireEvent.keyDown(screen.getByLabelText('Clip name'), { key: 'j' }); expect(video.currentTime).toBe(45);
  fireEvent.keyDown(player, { key: 'j', repeat: true }); expect(video.currentTime).toBe(45);
  fireEvent.keyDown(player, { key: 'b' });
  expect(screen.getByRole('dialog', { name: 'Bookmark' })).toBeInTheDocument();
  expect(screen.getByLabelText('Position (seconds)')).toHaveValue(45);
});
