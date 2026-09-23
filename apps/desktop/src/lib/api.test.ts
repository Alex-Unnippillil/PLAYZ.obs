import { expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn(), convertFileSrc: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { api } from './api';
it('never simulates recording in an ordinary browser', async () => {
  await expect(api.start('00000000-0000-4000-8000-000000000000')).rejects.toThrow('installed PLAYZ desktop application');
  expect(invoke).not.toHaveBeenCalled();
});
