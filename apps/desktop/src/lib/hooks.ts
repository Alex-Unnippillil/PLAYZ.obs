// SPDX-License-Identifier: GPL-2.0-or-later
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from './format';

export function useAction() {
  const client = useQueryClient();
  const gate = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Deliberately not a retryable mutation: record/start must never be replayed
  // by connectivity changes. Rust also serializes and deduplicates commands.
  async function run<T>(work: () => Promise<T>, success?: string): Promise<T | undefined> {
    if (gate.current) return undefined;
    gate.current = true; setPending(true); setError(null); setMessage(null);
    try {
      const result = await work();
      void client.invalidateQueries();
      if (mounted.current && success) setMessage(success);
      return result;
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
      return undefined;
    } finally {
      gate.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { run, pending, error, message, clear: () => { setError(null); setMessage(null); } };
}
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return settled;
}
