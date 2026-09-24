// SPDX-License-Identifier: GPL-2.0-or-later
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLocalClient } from '../lib/query';
import { api } from '../lib/api';
import { devicesFixture, settingsFixture } from '../test/fixtures';
import { SettingsView } from './Settings';
import type { Settings } from '../contracts';
vi.mock('../lib/api', () => ({ api: { devices: vi.fn(), settings: vi.fn(), chooseFolder: vi.fn() } }));
const clients: QueryClient[] = [];
function mount(settings: Settings = settingsFixture, busy = false) {
  const client = createLocalClient(); clients.push(client);
  const dirty = vi.fn(); const pending = vi.fn();
  const node = (value: Settings) => <QueryClientProvider client={client}><SettingsView settings={value} busy={busy} onDirtyChange={dirty} onPendingChange={pending}/></QueryClientProvider>;
  const result = render(node(settings));
  return { dirty, pending, rerender: (value: Settings) => result.rerender(node(value)) };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(api.devices).mockResolvedValue(devicesFixture);
  vi.mocked(api.settings).mockImplementation(async value => value);
  vi.mocked(api.chooseFolder).mockResolvedValue(null);
});
afterEach(() => clients.splice(0).forEach(client => client.clear()));
it('starts with advanced settings collapsed and mic explicitly off', async () => {
  mount(); await screen.findByRole('option', { name: 'USB microphone' });
  expect(screen.getByRole('button', { name: 'Advanced settings' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('spinbutton', { name: 'Video bitrate (kbps)' })).toBeNull();
  expect(screen.getByLabelText('Microphone (explicit opt-in)')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
});
it('presets update quality only and require an explicit save', async () => {
  const settings = { ...settingsFixture, microphone_id: 'mic-fixture', desktop_audio: true };
  const { dirty } = mount(settings);
  fireEvent.click(screen.getByRole('button', { name: 'Smooth quality' }));
  expect(api.settings).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Smooth quality' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(api.settings).toHaveBeenCalledTimes(1));
  expect(api.settings).toHaveBeenCalledWith({ ...settings, width: 1920, height: 1080, fps: 60, bitrate_kbps: 16000 });
  await waitFor(() => expect(dirty).toHaveBeenLastCalledWith(false));
});
it('does not erase drafts on repeated snapshots and can discard explicitly', async () => {
  const { rerender } = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Compact quality' }));
  rerender({ ...settingsFixture });
  expect(screen.getByRole('button', { name: 'Compact quality' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Balanced quality' })).toHaveAttribute('aria-pressed', 'true'));
  expect(api.settings).not.toHaveBeenCalled();
});
it('keeps saved unavailable audio device IDs rather than silently selecting defaults', async () => {
  mount({ ...settingsFixture, microphone_id: 'missing-mic', audio_output_id: 'missing-output', desktop_audio: true });
  await screen.findByRole('option', { name: /Saved microphone unavailable/ });
  expect(screen.getByLabelText('Microphone (explicit opt-in)')).toHaveValue('missing-mic');
  expect(screen.getByLabelText('System audio device')).toHaveValue('missing-output');
  fireEvent.click(screen.getByRole('button', { name: 'Compact quality' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(api.settings).toHaveBeenCalledWith(expect.objectContaining({ microphone_id: 'missing-mic', audio_output_id: 'missing-output' })));
});
it('switching scope clears the target instead of widening capture automatically', async () => {
  mount(); await screen.findByRole('option', { name: 'Practice session' });
  fireEvent.change(screen.getByLabelText('Capture scope'), { target: { value: 'game' } });
  expect(screen.getByLabelText('Game or window')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Game or window'), { target: { value: 'game-fixture' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(api.settings).toHaveBeenCalledWith(expect.objectContaining({ capture_kind: 'game', target_id: 'game-fixture', target_label: 'Game fixture' })));
});
it('reveals invalid advanced settings and retains the draft after a failed save', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
  fireEvent.change(screen.getByLabelText('Video bitrate (kbps)'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Advanced settings' })).toHaveAttribute('aria-expanded', 'true');
  expect(api.settings).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Video bitrate (kbps)'), { target: { value: '12000' } });
  vi.mocked(api.settings).mockRejectedValue(new Error('Shortcut already registered'));
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await screen.findByText('Shortcut already registered');
  expect(screen.getByLabelText('Video bitrate (kbps)')).toHaveValue(12000);
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
});
it('disables capture settings while recording and does not refresh hardware', () => {
  mount(settingsFixture, true);
  expect(screen.getByRole('button', { name: 'Smooth quality' })).toBeDisabled();
  expect(screen.getByLabelText('Microphone (explicit opt-in)')).toBeDisabled();
  expect(api.devices).not.toHaveBeenCalled();
});
it('cancelling the native folder picker does not change the folder or dirty state', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Choose local folder' }));
  await waitFor(() => expect(api.chooseFolder).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('Recording folder')).toHaveValue(settingsFixture.recording_folder);
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
});
