// SPDX-License-Identifier: GPL-2.0-or-later
// Renderer-only bridge fixtures; actual native/packaged verification is separate.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { recordingFixture, settingsFixture, snapshotFixture } from '../src/test/fixtures';
async function seed(page: Page, theme = 'dark', active = false) {
  await page.addInitScript(({ item, settings, snapshot, active }) => {
    const w = window as unknown as Record<string, any>;
    let recording = active; w.isTauri = true; w.__TEST_STOP_CALLED__ = 0;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1, unregisterCallback: () => {}, convertFileSrc: () => '/fixture.mp4',
      invoke: async (command: string) => {
        if (command.startsWith('plugin:event|')) return 1;
        const state = () => ({ ...snapshot, settings, phase: recording ? 'recording' : 'ready' });
        switch (command) {
          case 'app_state': return state();
          case 'list_recordings': return { items: [item], total: 1 };
          case 'get_recording': return item;
          case 'playback_asset': return 'fixture.mp4';
          case 'save_resume': return null;
          case 'list_bookmarks': return [{ id: 'moment', recording_id: item.id, position_ms: 2000, label: 'Review this moment', note: 'UI fixture bookmark' }];
          case 'stop_recording': recording = false; w.__TEST_STOP_CALLED__++; return state();
          default: throw new Error(`Unexpected review fixture command: ${command}`);
        }
      },
    };
  }, { item: recordingFixture, settings: { ...settingsFixture, theme }, snapshot: snapshotFixture, active });
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('review studio: keyboard range edits, grouped undo and bookmark navigation', async ({ page }, testInfo) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Open Practice session', exact: true }).click();
  const start = page.getByRole('slider', { name: 'Selection start', exact: true });
  const end = page.getByRole('slider', { name: 'Selection end', exact: true });
  await expect(end).toHaveAttribute('aria-valuenow', '120');
  await page.getByRole('button', { name: '30s around playhead' }).click();
  await start.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Trim in seconds')).toHaveValue('0.001');
  await page.getByRole('button', { name: 'Undo selection' }).click();
  await expect(page.getByLabel('Trim in seconds')).toHaveValue('0');
  await page.getByRole('button', { name: 'Undo selection' }).click();
  await expect(page.getByLabel('Trim out seconds')).toHaveValue('120');
  await page.getByRole('button', { name: 'Redo selection' }).click();
  await expect(page.getByLabel('Trim out seconds')).toHaveValue('30');
  // Many pointer updates are one history entry, not one undo per pixel.
  const bounds = await end.boundingBox(); expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds!.x + 80, bounds!.y + bounds!.height / 2, { steps: 20 }); await page.mouse.up();
  await expect(page.getByLabel('Trim out seconds')).not.toHaveValue('30');
  await page.getByRole('button', { name: 'Undo selection' }).click();
  await expect(page.getByLabel('Trim out seconds')).toHaveValue('30');
  await page.getByLabel('Find bookmark').fill('fixture');
  await page.getByRole('button', { name: 'Next bookmark', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(2, 1);
  await page.getByRole('button', { name: 'Clip 15 seconds around Review this moment' }).click();
  await expect(page.getByLabel('Trim out seconds')).toHaveValue('15');
  await accessible(page); await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('review-studio.png'), fullPage: true });
});

test('review studio: explicit looping, stopping and invalid numeric input', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Open Practice session', exact: true }).click();
  await expect(page.locator('video')).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByLabel('Trim in seconds').fill('0.5'); await page.getByLabel('Trim out seconds').fill('1.2');
  await page.getByLabel('Loop selection', { exact: true }).check();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    let before = v.currentTime; v.dataset.loops = '0';
    const deadline = performance.now() + 15000;
    const sample = setInterval(() => {
      if (before > v.currentTime + 0.2) v.dataset.loops = String(Number(v.dataset.loops) + 1);
      before = v.currentTime;
      if (Number(v.dataset.loops) >= 2 || performance.now() > deadline) clearInterval(sample);
    }, 30);
  });
  await page.getByRole('button', { name: 'Preview interval', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(v => Number((v as HTMLVideoElement).dataset.loops)), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByLabel('Trim in seconds').fill('');
  await expect(page.getByRole('slider', { name: 'Selection start', exact: true })).toHaveAttribute('data-disabled', '');
  await expect(page.getByRole('button', { name: 'Queue export', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo selection' }).click();
  await expect(page.getByLabel('Trim in seconds')).toHaveValue('0.5');
});

for (const theme of ['dark', 'light']) test(`review studio ${theme} narrow layout and accessibility`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await seed(page, theme); await page.goto('/');
  await page.getByRole('button', { name: 'Open Practice session', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Selection end', exact: true })).toBeVisible();
  await noHorizontalOverflow(page); await accessible(page);
});

test('a deferred workspace load failure preserves the capture shell and can return home', async ({ page }) => {
  await seed(page, 'dark', true); await page.route('**/assets/Settings-*.js', route => route.abort()); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your recordings' })).toBeVisible();
  await page.getByRole('button', { name: 'Capture settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This workspace could not open' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, any>).__TEST_STOP_CALLED__)).toBe(1);
  await page.getByRole('button', { name: 'Return to library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your recordings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export queue', exact: true })).toBeEnabled();
});
