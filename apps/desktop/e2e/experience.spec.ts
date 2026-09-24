// SPDX-License-Identifier: GPL-2.0-or-later
// Renderer-only fixture injected by Playwright into built static assets.
// Not included in Vite's application graph; not native/hardware evidence.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { devicesFixture, exportFixture, recordingFixture, settingsFixture, snapshotFixture } from '../src/test/fixtures';

async function seed(page: Page, theme = 'dark') {
  await page.addInitScript(({ settings, snapshot, devices, recordings, jobs }) => {
    const w = window as unknown as Record<string, any>;
    w.isTauri = true;
    let saved = settings;
    let removed = false;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 1, unregisterCallback: () => {},
      convertFileSrc: () => '/fixture.mp4',
      invoke: async (cmd: string, args: Record<string, any> = {}) => {
        if (cmd.startsWith('plugin:event|')) return 1;
        switch (cmd) {
          case 'app_state': return { ...snapshot, settings: saved };
          case 'discover_devices': return devices;
          case 'save_settings': saved = args.settings; return saved;
          case 'choose_recording_folder': return null;
          case 'list_recordings': {
            const items = (removed ? [] : recordings).filter(r => (!args.favorites || r.favorite) && `${r.title} ${r.tags.join(' ')}`.toLowerCase().includes(String(args.query ?? '').toLowerCase()));
            return { items, total: items.length };
          }
          case 'list_removed_recordings': return { items: removed ? recordings : [], total: removed ? recordings.length : 0 };
          case 'get_recording': return recordings[0];
          case 'playback_asset': return 'fixture.mp4';
          case 'list_bookmarks': return [{ id: 'bookmark-fixture', recording_id: recordings[0].id, position_ms: 2000, label: 'Review this moment', note: 'UI fixture bookmark' }];
          case 'list_exports': return jobs;
          case 'save_resume': return null;
          case 'remove_recording': removed = true; return null;
          case 'restore_recording': removed = false; return null;
          case 'diagnostics': return [{ name: 'UI fixture', status: 'pending', detail: 'Renderer test data only. Native verification runs separately.' }];
          default: throw new Error(`Unexpected command in renderer fixture: ${cmd}`);
        }
      },
    };
  }, { settings: { ...settingsFixture, theme }, snapshot: snapshotFixture, devices: devicesFixture,
    recordings: [recordingFixture, { ...recordingFixture, id: 'second-fixture', title: 'Evening practice · final round', favorite: true, tags: ['favorite', 'review'] }],
    jobs: [exportFixture('running', 'round-highlight'), exportFixture('completed', 'practice-clip'), exportFixture('failed', 'retry-clip')],
  });
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
}
for (const theme of ['dark', 'light']) {
  for (const size of [{ width: 1440, height: 1000 }, { width: 960, height: 720 }, { width: 680, height: 850 }, { width: 390, height: 844 }]) {
    test(`${theme} library and settings at ${size.width}px`, async ({ page }, testInfo) => {
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await page.setViewportSize(size); await seed(page, theme); await page.goto('/');
      await expect(page.getByRole('button', { name: 'Open Practice session', exact: true })).toBeVisible();
      await noHorizontalOverflow(page); await accessible(page);
      await page.screenshot({ path: testInfo.outputPath(`library-${theme}-${size.width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Capture settings', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Balanced quality' })).toHaveAttribute('aria-pressed', 'true');
      await noHorizontalOverflow(page); await accessible(page);
      await page.screenshot({ path: testInfo.outputPath(`settings-${theme}-${size.width}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}
test('unsaved navigation, advanced settings and explicit save', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Capture settings', exact: true }).click();
  await page.getByRole('button', { name: 'Smooth quality' }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Keep your profile changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay and edit' }).click();
  await expect(page.getByRole('button', { name: 'Smooth quality' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Advanced settings' }).click();
  await expect(page.getByLabel('Video bitrate (kbps)')).toHaveValue('16000');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  await expect(page.getByText('Saved on this computer')).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your recordings' })).toBeVisible();
});
test('quick actions keyboard, search, Escape and focus restoration', async ({ page }, testInfo) => {
  await seed(page); await page.goto('/');
  const launch = page.getByRole('button', { name: /Quick actions/ });
  await launch.focus(); await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick actions' }); await expect(dialog).toBeVisible();
  await dialog.getByLabel('Find a page or action').fill('backup');
  await accessible(page); await page.screenshot({ path: testInfo.outputPath('quick-actions.png') });
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(launch).toBeFocused();
  await page.getByLabel('Search recordings').focus(); await page.keyboard.press('Control+k'); await expect(dialog).toBeHidden();
});
test('review controls, clip selection and honest fast-export disclosure', async ({ page }, testInfo) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Open Practice session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make a clip' })).toBeVisible();
  await page.getByRole('button', { name: '30s around playhead' }).click();
  await expect(page.getByLabel('Trim out seconds')).toHaveValue('30');
  await page.getByRole('button', { name: 'Export options' }).click();
  await page.getByLabel('Export method').selectOption('fast');
  await page.getByRole('button', { name: 'Export options' }).click();
  await expect(page.getByText('Fast mode may include footage before trim-in.')).toBeVisible();
  await noHorizontalOverflow(page); await page.screenshot({ path: testInfo.outputPath('review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Recording tools' }).click();
  await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Queued exports are not cancelled');
  await page.getByRole('button', { name: 'Keep entry' }).click();
});
test('export filters retain finished and failed jobs', async ({ page }, testInfo) => {
  await seed(page); await page.goto('/'); await page.getByRole('button', { name: 'Export queue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'round-highlight.mp4' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('exports.png'), fullPage: true });
  await page.getByRole('button', { name: 'Filter exports: Completed' }).click();
  await expect(page.getByRole('button', { name: 'Show clip' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter exports: Needs attention' }).click();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible(); await accessible(page);
});
test('production browser page does not contain an enabled mock recorder', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/A browser preview cannot record or access your library/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up recording' })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__)).toBeUndefined();
});
