// SPDX-License-Identifier: GPL-2.0-or-later
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.ts', fullyParallel: true,
  workers: 2, retries: 0, timeout: 30000,
  reporter: [['list'], ['html', { outputFolder: '../../artifacts/ui-report', open: 'never' }]],
  outputDir: '../../artifacts/ui-results',
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:1420', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm exec vite preview --host 127.0.0.1 --port 1420 --strictPort', url: 'http://127.0.0.1:1420', reuseExistingServer: false },
});
