// SPDX-License-Identifier: GPL-2.0-or-later
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CaptureOverview } from './CaptureOverview';
import { snapshotFixture } from '../test/fixtures';
it('labels source selection honestly and discloses the estimate formula', () => {
  const setup = vi.fn(); render(<CaptureOverview snapshot={snapshotFixture} onSetup={setup}/>);
  expect(screen.getByText('No audio selected')).toBeVisible();
  expect(screen.getByText(/not hardware-qualified/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'How this estimate works' }));
  expect(screen.getByText(/this is not a guaranteed session length/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit capture profile' })); expect(setup).toHaveBeenCalledOnce();
});
it('does not show a capacity estimate when the connection has failed', () => {
  render(<CaptureOverview snapshot={snapshotFixture} stale onSetup={() => {}}/>);
  expect(screen.getByText('Disk reading unavailable')).toBeVisible();
  expect(screen.queryByText(/^~/)).not.toBeInTheDocument();
});
it('makes explicit microphone selection and low disk space visible', () => {
  render(<CaptureOverview snapshot={{ ...snapshotFixture, free_bytes: '1024', settings: { ...snapshotFixture.settings, microphone_id: 'mic', desktop_audio: true } }} onSetup={() => {}}/>);
  expect(screen.getByText('System + microphone')).toBeVisible(); expect(screen.getByText('Below configured reserve')).toBeVisible();
});
