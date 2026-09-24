// SPDX-License-Identifier: GPL-2.0-or-later
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { createLocalClient } from '../lib/query';
import { exportFixture } from '../test/fixtures';
import { ExportsView } from './Operations';
vi.mock('../lib/api', () => ({ api: { exports: vi.fn(), cancel: vi.fn(), retry: vi.fn(), revealExport: vi.fn() } }));
const clients: QueryClient[] = [];
function mount(busy = false) { const client = createLocalClient(); clients.push(client); render(<QueryClientProvider client={client}><ExportsView busy={busy}/></QueryClientProvider>); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.exports).mockResolvedValue(['queued', 'running', 'completed', 'failed', 'cancelled'].map(state => exportFixture(state))); });
afterEach(() => clients.splice(0).forEach(client => client.clear()));
it('filters real job data without deleting or changing jobs', async () => {
  mount(); await screen.findByText('completed.mp4');
  fireEvent.click(screen.getByRole('button', { name: 'Filter exports: Needs attention' }));
  expect(screen.getByText('failed.mp4')).toBeInTheDocument(); expect(screen.getByText('cancelled.mp4')).toBeInTheDocument();
  expect(screen.queryByText('completed.mp4')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Filter exports: Completed' }));
  expect(screen.getByRole('button', { name: 'Show clip' })).toBeEnabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(api.cancel).not.toHaveBeenCalled(); expect(api.retry).not.toHaveBeenCalled();
});
it('keeps waiting states truthful while capture is active and permits cancellation', async () => {
  vi.mocked(api.exports).mockResolvedValue([exportFixture('queued')]);
  mount(true); await screen.findByText('Waiting for capture');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('queued'));
});
it('retries the intended failed job and reveals the intended completed clip', async () => {
  vi.mocked(api.exports).mockResolvedValue([exportFixture('failed')]);
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(api.retry).toHaveBeenCalledWith('failed'));
});
it('shows query errors without claiming there are no exports', async () => {
  vi.mocked(api.exports).mockRejectedValue(new Error('Catalog unavailable')); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Catalog unavailable');
  expect(screen.queryByText('No exports queued')).toBeNull();
});
it('offers an escape from a filter with no matching jobs', async () => {
  vi.mocked(api.exports).mockResolvedValue([exportFixture('completed')]); mount();
  await screen.findByText('completed.mp4');
  fireEvent.click(screen.getByRole('button', { name: 'Filter exports: In progress' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show all exports' }));
  expect(screen.getByText('completed.mp4')).toBeInTheDocument();
});
