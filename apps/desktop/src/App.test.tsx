// SPDX-License-Identifier: GPL-2.0-or-later
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './lib/api';
import { createLocalClient } from './lib/query';
import { devicesFixture, settingsFixture, snapshotFixture } from './test/fixtures';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('./lib/api', () => ({ api: { state: vi.fn(), devices: vi.fn(), settings: vi.fn(), list: vi.fn(), exports: vi.fn(), diagnostics: vi.fn(), start: vi.fn(), stop: vi.fn(), quit: vi.fn() } }));
const clients: QueryClient[] = [];
function mount() { const client = createLocalClient(); clients.push(client); render(<QueryClientProvider client={client}><App/></QueryClientProvider>); return client; }
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(api.state).mockResolvedValue(snapshotFixture);
  vi.mocked(api.devices).mockResolvedValue(devicesFixture); vi.mocked(api.list).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.exports).mockResolvedValue([]); vi.mocked(api.diagnostics).mockResolvedValue([]);
  vi.mocked(api.settings).mockImplementation(async value => value);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => clients.splice(0).forEach(client => client.clear()));
it('uses setup rather than an unexplained disabled Record button without a target', async () => {
  vi.mocked(api.state).mockResolvedValue({ ...snapshotFixture, settings: { ...settingsFixture, target_id: '', target_label: '' } });
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Set up recording' }));
  expect(await screen.findByRole('heading', { name: 'Set up your recording' })).toBeInTheDocument();
  expect(api.start).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Match review' })).toBeNull();
});
it('guards navigation from a dirty profile, preserves on Stay and discards only explicitly', async () => {
  mount(); await screen.findByRole('button', { name: 'Record' });
  fireEvent.click(screen.getByRole('button', { name: 'Capture settings' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Smooth quality' }));
  fireEvent.click(screen.getByRole('button', { name: 'Library', exact: true }));
  expect(await screen.findByRole('dialog', { name: 'Keep your profile changes?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stay and edit' }));
  expect(screen.getByRole('button', { name: 'Smooth quality' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Library', exact: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Discard and continue' }));
  expect(await screen.findByRole('heading', { name: 'Your recordings' })).toBeInTheDocument();
  expect(api.settings).not.toHaveBeenCalled();
});
it('guards explicit Quit and does not call native quit until discard is confirmed', async () => {
  mount(); await screen.findByRole('button', { name: 'Record' });
  fireEvent.click(screen.getByRole('button', { name: 'Capture settings' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Compact quality' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quit safely' }));
  await screen.findByRole('dialog', { name: 'Keep your profile changes?' });
  expect(api.quit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard and continue' }));
  await waitFor(() => expect(api.quit).toHaveBeenCalledTimes(1));
});
it('opens searchable quick navigation without starting a recording', async () => {
  mount(); await screen.findByRole('button', { name: 'Record' });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const dialog = await screen.findByRole('dialog', { name: 'Quick actions' });
  fireEvent.change(within(dialog).getByLabelText('Find a page or action'), { target: { value: 'backup' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Diagnostics/ }));
  expect(await screen.findByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument();
  expect(api.start).not.toHaveBeenCalled();
});
it('does not capture modified quick-action keys while typing or on repeat', async () => {
  mount(); const search = await screen.findByLabelText('Search recordings');
  fireEvent.keyDown(search, { key: 'k', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true, repeat: true });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('deduplicates the native Record command while it is pending', async () => {
  let finish!: (value: typeof snapshotFixture) => void;
  vi.mocked(api.start).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  mount(); const record = await screen.findByRole('button', { name: 'Record' });
  fireEvent.click(record); fireEvent.click(record);
  expect(api.start).toHaveBeenCalledTimes(1); expect(record).toBeDisabled();
  finish(snapshotFixture); await waitFor(() => expect(record).toBeEnabled());
});
it('retains Stop and the live bookmark action while actively recording', async () => {
  vi.mocked(api.state).mockResolvedValue({ ...snapshotFixture, phase: 'recording', elapsed_ms: 65000 });
  mount(); expect(await screen.findByRole('button', { name: 'Stop recording' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Bookmark current recording' })).toBeEnabled();
  expect(screen.getByText('01:05')).toBeInTheDocument();
});
