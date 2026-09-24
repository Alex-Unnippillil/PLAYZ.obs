import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
afterEach(() => { cleanup(); onlineManager.setOnline(true); vi.restoreAllMocks(); });
// Keep the browser capability itself callable after a suite resets API spies.
// Individual tests can spy on matchMedia when they need to control a theme.
Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) });
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
