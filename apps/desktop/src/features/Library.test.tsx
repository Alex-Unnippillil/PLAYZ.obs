// SPDX-License-Identifier: GPL-2.0-or-later
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Recording } from '../contracts';
import { createLocalClient } from '../lib/query';
import { api } from '../lib/api';
import { LibraryView } from './Library';

vi.mock('../lib/api', () => ({ api: { list: vi.fn(), listRemoved: vi.fn(), restore: vi.fn(), edit: vi.fn(), import: vi.fn() } }));
// jsdom has no layout. Native virtualization is exercised separately by the
// installed Windows workflow; these tests exercise queries and user actions.
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({
  getTotalSize: () => count * 100,
  getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 100, size: 100 })),
}) }));
const clients: QueryClient[] = [];
function recording(id = 'r1', title = 'Session one'): Recording {
  return { id, title, created_at: '2026-09-24T00:00:00Z', phase: 'ready', duration_ms: 4000, bytes: '2048', favorite: false, tags: ['ace'], notes: 'Preserved notes', source_label: 'Local test', capture_kind: 'window', has_playback: true, resume_ms: 1000, error: null };
}
function mount(busy = false) {
  const client = createLocalClient(); clients.push(client);
  const onOpen = vi.fn(); const onSetup = vi.fn();
  render(<QueryClientProvider client={client}><LibraryView onOpen={onOpen} onSetup={onSetup} busy={busy}/></QueryClientProvider>);
  return { onOpen, onSetup, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.mocked(api.list).mockResolvedValue({ items: [recording()], total: 1 });
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(api.restore).mockResolvedValue(undefined);
});
afterEach(() => { clients.splice(0).forEach(client => client.clear()); });

it('starts in Active without querying removed records and opens the selected recording', async () => {
  const { onOpen } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Session one' }));
  expect(api.list).toHaveBeenCalledWith('', 0, false);
  expect(api.listRemoved).not.toHaveBeenCalled();
  expect(onOpen).toHaveBeenCalledWith('r1');
  expect(screen.getByRole('button', { name: 'Show active recordings' })).toHaveAttribute('aria-pressed', 'true');
});
it('shows a separate removed collection with restore actions and preservation guidance', async () => {
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording('hidden', 'Hidden session')], total: 1 });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  expect(await screen.findByRole('button', { name: 'Restore Hidden session' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Open Session one' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open Hidden session' })).not.toBeInTheDocument();
  expect(screen.getByText(/queued exports are not cancelled/)).toBeInTheDocument();
  expect(api.listRemoved).toHaveBeenCalledWith('', 0, false);
});
it('restores through the native API, refetches and returns keyboard focus to a stable control', async () => {
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording('hidden', 'Hidden session')], total: 1 });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  const restore = await screen.findByRole('button', { name: 'Restore Hidden session' });
  vi.mocked(api.restore).mockImplementation(async () => {
    vi.mocked(api.listRemoved).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.list).mockResolvedValue({ items: [recording('hidden', 'Hidden session')], total: 1 });
  });
  fireEvent.click(restore);
  expect(await screen.findByRole('status')).toHaveTextContent('Restored “Hidden session”');
  expect(api.restore).toHaveBeenCalledTimes(1);
  expect(api.restore).toHaveBeenCalledWith('hidden');
  await screen.findByRole('heading', { name: 'No removed recordings' });
  expect(screen.getByRole('button', { name: 'Show removed recordings' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Show active recordings' }));
  expect(await screen.findByRole('button', { name: 'Open Hidden session' })).toBeEnabled();
});
it('preserves the row and shows a failed restoration without a success message', async () => {
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording('hidden', 'Hidden session')], total: 1 });
  vi.mocked(api.restore).mockRejectedValue(new Error('Database is unavailable'));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore Hidden session' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Database is unavailable');
  expect(screen.getByRole('button', { name: 'Restore Hidden session' })).toBeEnabled();
  expect(screen.queryByText(/Restored “/)).not.toBeInTheDocument();
});
it('does not submit duplicate restore requests while one is pending', async () => {
  let finish!: () => void;
  vi.mocked(api.restore).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording()], total: 1 });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  const button = await screen.findByRole('button', { name: 'Restore Session one' });
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled(); expect(api.restore).toHaveBeenCalledTimes(1);
  finish(); await waitFor(() => expect(button).toBeEnabled());
});
it('queries and restores locally when network connectivity is offline', async () => {
  onlineManager.setOnline(false);
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording()], total: 1 });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore Session one' }));
  await waitFor(() => expect(api.restore).toHaveBeenCalledTimes(1));
  await screen.findByText(/Restored “Session one”/);
});
it('searches and filters removed recordings, then clears the filters', async () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search recordings' }), { target: { value: 'ace_100%' } });
  fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
  await waitFor(() => expect(api.listRemoved).toHaveBeenLastCalledWith('ace_100%', 0, true));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(api.listRemoved).toHaveBeenLastCalledWith('', 0, false));
});
it('resets pagination when changing collection or search filters', async () => {
  vi.mocked(api.list).mockResolvedValue({ items: [recording()], total: 101 });
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('', 50, false));
  fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  await waitFor(() => expect(api.listRemoved).toHaveBeenLastCalledWith('', 0, false));
  expect(vi.mocked(api.listRemoved).mock.calls.some(call => call[1] === 50)).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Show active recordings' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('', 0, false));
  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('', 50, false));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search recordings' }), { target: { value: 'changed' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith('changed', 0, false));
  expect(vi.mocked(api.list).mock.calls.some(call => call[0] === 'changed' && call[1] === 50)).toBe(false);
});
it('moves to the preceding page when the last removed item on a later page is restored', async () => {
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording()], total: 51 });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(api.listRemoved).toHaveBeenLastCalledWith('', 50, false));
  vi.mocked(api.restore).mockImplementation(async () => {
    vi.mocked(api.listRemoved).mockImplementation(async (_, offset) => ({ items: offset === 0 ? [recording('r2', 'Earlier session')] : [], total: 50 }));
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Restore Session one' }));
  expect(await screen.findByRole('button', { name: 'Restore Earlier session' })).toBeEnabled();
  expect(api.listRemoved).toHaveBeenLastCalledWith('', 0, false);
});
it('renders untrusted titles as text and keeps import disabled while recording', async () => {
  const title = '<img src=x onerror=alert(1)>';
  vi.mocked(api.listRemoved).mockResolvedValue({ items: [recording('r1', title)], total: 1 });
  mount(true); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  expect(await screen.findByRole('button', { name: `Restore ${title}` })).toBeEnabled();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByRole('button', { name: 'Import video' })).toBeDisabled();
});
it('shows removed query failures without pretending the collection is empty', async () => {
  vi.mocked(api.listRemoved).mockRejectedValue(new Error('Could not read catalog'));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Show removed recordings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not read catalog');
  expect(screen.queryByRole('heading', { name: 'No removed recordings' })).not.toBeInTheDocument();
});
