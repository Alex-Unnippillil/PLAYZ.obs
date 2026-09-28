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

it('undoes and redoes a complete preset, and branches history on numeric edits', async () => {
  mount(); const quick = await screen.findByRole('button', { name: '15s around playhead' });
  await waitFor(() => expect(quick).toBeEnabled()); fireEvent.click(quick);
  fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
  expect(screen.getByLabelText('Trim out seconds')).toHaveValue(120);
  fireEvent.click(screen.getByRole('button', { name: 'Redo selection' }));
  expect(screen.getByLabelText('Trim out seconds')).toHaveValue(15);
  fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
  fireEvent.change(screen.getByLabelText('Trim out seconds'), { target: { value: '35' } });
  expect(screen.getByRole('button', { name: 'Redo selection' })).toBeDisabled();
  expect(api.queue).not.toHaveBeenCalled();
});
it('exposes keyboard trim handles and disables them for invalid numeric edits', async () => {
  mount(); const quick = await screen.findByRole('button', { name: '15s around playhead' });
  await waitFor(() => expect(quick).toBeEnabled());
  const handle = screen.getByRole('slider', { name: 'Selection start' });
  handle.focus(); fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(screen.getByLabelText('Trim in seconds')).toHaveValue(0.001);
  fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
  expect(screen.getByLabelText('Trim in seconds')).toHaveValue(0);
  fireEvent.change(screen.getByLabelText('Trim in seconds'), { target: { value: '' } });
  expect(handle).toHaveAttribute('data-disabled');
  expect(screen.getByRole('button', { name: 'Queue export' })).toBeDisabled();
});
it('filters bookmarks and builds one reversible clip selection around a moment', async () => {
  vi.mocked(api.bookmarks).mockResolvedValue([
    { id: 'one', recording_id: recordingFixture.id, position_ms: 40000, label: 'Objective', note: 'Review approach' },
    { id: 'two', recording_id: recordingFixture.id, position_ms: 80000, label: 'Finish', note: '' },
  ]);
  mount(); const input = await screen.findByLabelText('Find bookmark');
  fireEvent.change(input, { target: { value: 'approach' } });
  expect(screen.queryByRole('button', { name: 'Clip 15 seconds around Finish' })).toBeNull();
  const clip = screen.getByRole('button', { name: 'Clip 15 seconds around Objective' });
  await waitFor(() => expect(clip).toBeEnabled()); fireEvent.click(clip);
  expect(screen.getByLabelText('Trim in seconds')).toHaveValue(32.5);
  expect(screen.getByLabelText('Trim out seconds')).toHaveValue(47.5);
  fireEvent.click(screen.getByRole('button', { name: 'Undo selection' }));
  expect(screen.getByLabelText('Trim out seconds')).toHaveValue(120);
  fireEvent.click(screen.getByRole('button', { name: 'Next bookmark' }));
  expect((screen.getByLabelText(`Playback of ${recordingFixture.title}`) as HTMLVideoElement).currentTime).toBe(40);
  expect(screen.getByRole('button', { name: 'Next bookmark' })).toBeDisabled();
  fireEvent.change(input, { target: { value: 'absent' } });
  expect(screen.getByRole('status')).toHaveTextContent('No bookmarks match');
  expect(api.queue).not.toHaveBeenCalled();
});
it('loops only an explicitly previewed selection and stops when it is edited', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  mount(); const preview = await screen.findByRole('button', { name: 'Preview interval' });
  await waitFor(() => expect(preview).toBeEnabled());
  const element = screen.getByLabelText(`Playback of ${recordingFixture.title}`) as HTMLVideoElement;
  fireEvent.change(screen.getByLabelText('Trim in seconds'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('Trim out seconds'), { target: { value: '2' } });
  fireEvent.click(screen.getByLabelText('Loop selection'));
  element.currentTime = 3; fireEvent.timeUpdate(element); expect(element.currentTime).toBe(3);
  fireEvent.click(preview); expect(element.currentTime).toBe(1);
  element.currentTime = 2.1; fireEvent.timeUpdate(element); expect(element.currentTime).toBe(1);
  expect(play).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText('Trim out seconds'), { target: { value: '3' } });
  expect(pause).toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Stop preview' })).toBeNull();
  element.currentTime = 4; fireEvent.timeUpdate(element); expect(element.currentTime).toBe(4);
});
it('stops a one-shot preview and reports playback failures', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  mount(); const preview = await screen.findByRole('button', { name: 'Preview interval' });
  await waitFor(() => expect(preview).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Trim out seconds'), { target: { value: '2' } });
  fireEvent.click(preview);
  const element = screen.getByLabelText(`Playback of ${recordingFixture.title}`) as HTMLVideoElement;
  element.currentTime = 2.1; fireEvent.timeUpdate(element);
  expect(pause).toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Stop preview' })).toBeNull();
  play.mockRejectedValue(new Error('decoder unavailable')); fireEvent.click(preview);
  await screen.findByText(/decoder unavailable/);
  expect(screen.queryByRole('button', { name: 'Stop preview' })).toBeNull();
});
