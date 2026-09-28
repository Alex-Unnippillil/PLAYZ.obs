// SPDX-License-Identifier: GPL-2.0-or-later
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PageBoundary, PageLoading } from './PageBoundary';
it('contains a page failure without removing controls outside its boundary', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stop = vi.fn(); const back = vi.fn();
  function Failed(): never { throw new Error('failed local chunk'); }
  render(<><button onClick={stop}>Stop recording</button><PageBoundary onBack={back}><Failed/></PageBoundary></>);
  expect(screen.getByRole('alert')).toHaveTextContent('Recording controls remain available');
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })); expect(stop).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Return to library' })); expect(back).toHaveBeenCalledTimes(1);
});
it('announces local loading without claiming a network connection', () => {
  render(<PageLoading/>); expect(screen.getByRole('status')).toHaveTextContent('bundled local screen');
});
