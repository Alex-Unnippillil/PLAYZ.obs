import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Button, Feedback, Modal } from './ui';
it('disables actions and announces pending status', () => { const action = vi.fn(); render(<Button busy onClick={action}>Record</Button>); const button = screen.getByRole('button', { name: 'Record' }); expect(button).toBeDisabled(); expect(button).toHaveAttribute('aria-busy', 'true'); fireEvent.click(button); expect(action).not.toHaveBeenCalled(); });
it('renders failures as text instead of executable markup', () => { render(<Feedback error={'<img src=x onerror=alert(1)>'}/>); expect(screen.getByRole('alert')).toHaveTextContent('<img src=x onerror=alert(1)>'); expect(document.querySelector('img')).toBeNull(); });
it('provides an accessible confirmation dialog', () => { render(<Modal open onClose={vi.fn()} title="Remove entry?" description="Original files are preserved."><Button>Keep entry</Button></Modal>); expect(screen.getByRole('dialog', { name: 'Remove entry?' })).toBeInTheDocument(); expect(screen.getByText('Original files are preserved.')).toBeInTheDocument(); });
