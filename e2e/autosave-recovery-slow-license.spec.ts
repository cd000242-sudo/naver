/**
 * [2026-11-20] Release gate 2.11.398 stopped twice on semi-auto-readiness "autosaved draft recovery": after a reload
 * the recovery prompt never appeared. Autosave is stored under the account-scoped key, but the scope (license user id)
 * is only set once the async license lookup returns. On a busy machine the recovery check ran first, read the
 * unscoped key, found nothing and returned silently. This spec makes the license lookup slow on purpose.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

const LICENSE_DELAY_MS = 6_000;
let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
const warnings: string[] = [];

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-autosave-slow-');
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'slow-license-main.cjs');
  // Delay only the license lookup, and only once the test switches the delay on. No production test hook is needed.
  await fs.writeFile(bootstrap, `
    const electron = require('electron');
    const root = ${JSON.stringify(root)};
    electron.app.setAppPath(root);
    globalThis.__licenseDelayMs = 0;
    const handle = electron.ipcMain.handle.bind(electron.ipcMain);
    electron.ipcMain.handle = (channel, listener) => handle(channel, channel === 'license:get' ? async (...args) => {
      if (globalThis.__licenseDelayMs > 0) await new Promise(resolve => setTimeout(resolve, globalThis.__licenseDelayMs));
      return listener(...args);
    } : listener);
    require(root + '/dist/main.js');
  `);
  app = await electron.launch({ args: [bootstrap], cwd: root, env: { ...process.env, ...profile.env } });
  page = await waitForMainWindow(app);
  page.on('dialog', dialog => { void dialog.dismiss(); });
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('recovery prompt still appears when the license lookup answers after startup has finished', async () => {
  // The draft must be written while the account scope is active, as it is for a signed-in user.
  await page.waitForFunction(() => !!localStorage.getItem('__current_license_user_id__'), undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.setItem('naver_blog_autosave', JSON.stringify({
      timestamp: Date.now(), mode: 'semi-auto', generatedImages: [],
      structuredContent: { selectedTitle: '느린 조회 뒤 복구한 제목', bodyPlain: '느린 조회 뒤에도 복구되는 본문입니다.', headings: [], hashtags: [] },
    }));
  });
  await app.evaluate((_electron, delay) => { (globalThis as any).__licenseDelayMs = delay; }, LICENSE_DELAY_MS);
  await page.reload();
  await page.locator('[data-choice-id="restore-autosave"]').click({ timeout: 40_000 });
  // The prompt must come from the lookup finishing, not from the wait running out (which would also show it, late).
  expect(warnings.filter(text => text.includes('license lookup did not finish'))).toEqual([]);
  await expect(page.locator('#unified-generated-title')).toHaveValue('느린 조회 뒤 복구한 제목');
  await expect(page.locator('#unified-generated-content')).toHaveValue('느린 조회 뒤에도 복구되는 본문입니다.');
});
