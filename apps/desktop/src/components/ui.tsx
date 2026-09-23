// SPDX-License-Identifier: GPL-2.0-or-later
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertTriangle, LoaderCircle } from 'lucide-react';
import { clsx } from 'clsx';

export function Button({ children, className, variant = 'secondary', busy = false, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return <button type="button" {...props} className={clsx('button', `button-${variant}`, className)} disabled={disabled || busy} aria-busy={busy || undefined}>{busy && <LoaderCircle className="spinner" size={16} aria-hidden="true"/>}{children}</button>;
}
export function Feedback({ error, message }: { error?: unknown; message?: string | null }) {
  return <>{error ? <div className="notice error" role="alert"><AlertTriangle size={18} aria-hidden="true"/><span>{String(error instanceof Error ? error.message : error)}</span></div> : null}{message && <div className="notice" role="status">{message}</div>}</>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><div className="empty-mark" aria-hidden="true">P</div><h2>{title}</h2><div className="muted">{children}</div></div>;
}
export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className="dialog-content"><div className="row between"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><Button variant="ghost" aria-label="Close dialog"><X size={18}/></Button></Dialog.Close></div><Dialog.Description className="muted">{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function PageTitle({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return <header className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children && <p className="muted">{children}</p>}</div><div className="row wrap">{actions}</div></header>;
}
