/**
 * [2026-11-20] Probe after the 2.11.398 autosave fix: with a slow license lookup the "생성된 글 목록" tab stayed empty
 * for the whole session (switching tabs did not redraw it) although the posts were readable once the lookup answered.
 * The calendar's memo dot was missing on every start, because the calendar is drawn before the account scope exists.
 * Both screens must redraw once the startup lookup has set the account.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

const LICENSE_DELAY_MS = 6_000;
const POST_ID = 'ldb_scope_redraw';
let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-scope-redraw-');
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'scope-redraw-main.cjs');
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

const todayMemoKey = () => {
  const d = new Date();
  return `calendar-memo-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('post list and calendar memo dot show the account data after a slow license lookup', async () => {
  // Seed through the app's own import path and memo storage while the account scope is active.
  await page.waitForFunction(() => (window as any).__ldbPostsBound === true && !!localStorage.getItem('__current_license_user_id__'),
    undefined, { timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'))!.webContents.send('ldb:import-posts', [{
      id, title: '범위 다시 그리기 글', content: '본문입니다.\n\n## 소제목\n\n소제목 본문입니다.',
      headings: [{ title: '소제목', content: '소제목 본문입니다.', prompt: 'desk' }], hashtags: [], images: [], publishMode: 'draft',
    }], 'scope-redraw');
  }, POST_ID);
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('naver_blog_generated_posts') || '').includes('ldb_scope_redraw'))).toBe(true);
  await page.evaluate((key) => { localStorage.setItem(key, '다시 그리기 메모'); localStorage.removeItem('naver_blog_autosave'); }, todayMemoKey());

  await app.evaluate((_electron, delay) => { (globalThis as any).__licenseDelayMs = delay; }, LICENSE_DELAY_MS);
  await page.reload();

  // Without the redraw both stay empty for the whole session; with it they fill shortly after the lookup answers.
  const list = page.locator(`#generated-posts-list [data-post-id="${POST_ID}"]`).first();
  await expect(list).toBeAttached({ timeout: 25_000 });
  await expect(page.locator('#calendar-widget .calendar-day.today')).toHaveClass(/has-memo/, { timeout: 10_000 });
  await page.locator('.tab-button[data-tab="post-list"]').click();
  await expect(list).toBeVisible();
});
