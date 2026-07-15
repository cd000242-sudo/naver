import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import {
  closeElectronTestSession,
  createElectronTestProfile,
  type ElectronTestProfile,
  waitForMainWindow,
} from './electronTestUtils';

let app: ElectronApplication;
let mainWindow: Page;
let testProfile: ElectronTestProfile;
const cachedStartupNotice = '렌더러 시작 전에 도착한 공지\n캐시 복구 확인';

test.beforeAll(async () => {
  testProfile = await createElectronTestProfile('bln-notice-e2e-');
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist', 'main.js')],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: {
      ...process.env,
      ...testProfile.env,
      E2E_ACTIVE_NOTICE: cachedStartupNotice,
    },
  });
  mainWindow = await waitForMainWindow(app);
});

test.afterAll(async () => {
  await closeElectronTestSession(app, testProfile);
});

test('main notice event crosses preload and opens the canonical modal', async () => {
  const notice = '인증 완료 후 표시되는 공지\n두 번째 줄';

  await mainWindow.waitForFunction(() => (
    typeof (window as any).showServerNotice === 'function'
    && (window as any).__noticeListenerReady === true
  ));
  await mainWindow.evaluate(() => {
    (window as any).__noticeE2EProbe = [];
    (window as any).api.on('app:show-notice', (message: string) => {
      (window as any).__noticeE2EProbe.push(message);
    });
  });

  let sent = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < 5 && !sent; attempt++) {
    try {
      await app.evaluate(({ BrowserWindow }, message) => {
        const target = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().replace(/\\/g, '/').includes('/dist/public/index.html'),
        );
        if (!target) throw new Error('Main window not found');
        target.webContents.send('app:show-notice', message);
      }, notice);
      sent = true;
    } catch (error) {
      lastError = error;
      await mainWindow.waitForTimeout(300);
    }
  }
  if (!sent) throw lastError;

  await expect.poll(() => mainWindow.evaluate(() => (window as any).__noticeE2EProbe)).toContain(notice);

  const modal = mainWindow.locator('#notice-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-hidden', 'false');
  await expect(mainWindow.locator('#notice-display-content')).toHaveText(notice);
  await mainWindow.waitForTimeout(350);
  await expect(mainWindow.locator('#notice-display-content')).toHaveText(notice);
  await expect(mainWindow.locator('[id="notice-modal"]')).toHaveCount(1);
});

test('renderer recovers an active notice after missing the one-shot event', async () => {
  await mainWindow.reload({ waitUntil: 'domcontentloaded' });
  await mainWindow.waitForFunction(() => typeof (window as any).showServerNotice === 'function');

  const modal = mainWindow.locator('#notice-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-hidden', 'false');
  await expect(mainWindow.locator('#notice-display-content')).toHaveText(cachedStartupNotice);
});
