// SPDX-License-Identifier: GPL-2.0-or-later
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Disclosure({ title, description, children, open, onOpenChange }: {
  title: string; description?: string; children: ReactNode;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = open ?? localOpen;
  const id = useId();
  return <section className="disclosure">
    <h2><button type="button" id={`${id}-trigger`} className="disclosure-trigger" aria-label={title} aria-describedby={description ? `${id}-description` : undefined} aria-expanded={expanded} aria-controls={`${id}-content`} onClick={() => {
      setLocalOpen(!expanded); onOpenChange?.(!expanded);
    }}><span><span className="disclosure-title">{title}</span>{description && <span id={`${id}-description`} className="disclosure-description">{description}</span>}</span><ChevronDown size={18} aria-hidden="true"/></button></h2>
    <div id={`${id}-content`} aria-labelledby={`${id}-trigger`} hidden={!expanded} className="disclosure-content">{children}</div>
  </section>;
}
