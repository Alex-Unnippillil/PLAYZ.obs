import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager, useQuery } from '@tanstack/react-query';
import { useAction } from './hooks';
import { createLocalClient } from './query';

describe('offline commands and duplicate action protection', () => {
  it('executes a local query while the browser is offline', async () => {
    onlineManager.setOnline(false); const local = vi.fn().mockResolvedValue('Local catalog'); const client = createLocalClient();
    function View() { const query = useQuery({ queryKey: ['offline'], queryFn: local }); return <p>{query.data ?? 'Loading'}</p>; }
    render(<QueryClientProvider client={client}><View/></QueryClientProvider>);
    expect(await screen.findByText('Local catalog')).toBeInTheDocument(); expect(local).toHaveBeenCalledTimes(1); client.clear();
  });
  it('does not retry a failed native query', async () => {
    const client = createLocalClient(); const call = vi.fn().mockRejectedValue(new Error('native failure'));
    await expect(client.fetchQuery({ queryKey: ['failure'], queryFn: call })).rejects.toThrow('native failure');
    expect(call).toHaveBeenCalledTimes(1); expect(client.getDefaultOptions().mutations?.retry).toBe(false); client.clear();
  });
  it('serializes repeated clicks and surfaces failures without replaying actions', async () => {
    let release!: () => void; const work = vi.fn(() => new Promise<void>(resolve => { release = resolve; })); const client = createLocalClient();
    function View() { const action = useAction(); return <><button onClick={() => void action.run(work, 'Saved')}>Start</button><span>{action.pending ? 'Busy' : action.message}</span></>; }
    render(<QueryClientProvider client={client}><View/></QueryClientProvider>);
    fireEvent.click(screen.getByText('Start')); fireEvent.click(screen.getByText('Start')); expect(work).toHaveBeenCalledTimes(1);
    await act(async () => release()); await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument()); client.clear();
  });
});
