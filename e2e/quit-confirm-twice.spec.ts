/**
 * [2026-10-09] Owner: "종료 버튼 눌렀는데 멈췄다 — 시니어 분들은 작업관리자 못 쓴다".
 * Close → [계속 사용] → close again → [종료] left the app running: the second confirmation's IPC listener was dropped
 * by the double-registration guard. This drives the real dialog twice and requires the app to exit.
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';
import {
  closeElectronTestSession,
  createElectronTestProfile,
  type ElectronTestProfile,
  waitForMainWindow,
} from './electronTestUtils';

let app: ElectronApplication;
let profile: ElectronTestProfile;
let mainPage: Page;
let appExited = false;

async function requestClose(): Promise<Page> {
  const dialog = app.waitForEvent('window', { predicate: (page) => page.url().includes('quit-confirm.html'), timeout: 20_000 });
  // Same as the window's X button: the renderer asks to close, the main 'close' handler shows the dialog.
  await mainPage.evaluate(() => window.close());
  const page = await dialog;
  await page.waitForSelector('#btnQuit', { state: 'visible', timeout: 15_000 });
  return page;
}

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-quit-twice-e2e-');
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist', 'main.js')],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: { ...process.env, ...profile.env, E2E_QUIT_CONFIRM: '1' },
  });
  mainPage = await waitForMainWindow(app);
});

test.afterAll(async () => {
  // The test quits the app itself; only the profile is left to clean up then.
  if (appExited) await profile.cleanup();
  else await closeElectronTestSession(app, profile);
});

test('cancel one close, then [종료] on the next close really quits', async () => {
  test.setTimeout(120_000);
  const first = await requestClose();
  // The dialog's own button handler: the same dialogAPI.send the click runs (a synthetic click on the frameless,
  // transparent always-on-top dialog is unreliable under Playwright).
  const firstClosed = first.waitForEvent('close', { timeout: 15_000 });
  await first.evaluate(() => (document.getElementById('btnCancel') as HTMLButtonElement).click());
  await firstClosed;

  const second = await requestClose();
  const exited = app.waitForEvent('close', { timeout: 40_000 });
  await second.evaluate(() => (document.getElementById('btnQuit') as HTMLButtonElement).click()).catch(() => undefined);
  await expect(exited).resolves.toBeUndefined();
  appExited = true;
});
