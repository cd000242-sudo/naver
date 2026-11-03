import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { closeElectronTestSession, createElectronTestProfile, type ElectronTestProfile, waitForMainWindow } from './electronTestUtils';

let app: ElectronApplication;
let profile: ElectronTestProfile;
let page: Page;

const mainOutput: string[] = [];

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-minimize-taskbar-');
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'minimize-probe-main.cjs');
  // Install persistent native-method observers in the app main realm before window creation.
  await fs.writeFile(bootstrap, `
    const electron = require('electron');
    const root = ${JSON.stringify(root)};
    const nodeRequire = require('node:module').createRequire(root + '/package.json');
    electron.app.setAppPath(root);
    electron.app.on('browser-window-created', (_event, win) => {
      const state = { skips: [], hides: 0 };
      win.__minimizeProbe = state;
      const setSkip = win.setSkipTaskbar.bind(win);
      win.setSkipTaskbar = skip => { state.skips.push(skip); setSkip(skip); };
      const hide = win.hide.bind(win);
      win.hide = () => { state.hides += 1; hide(); };
    });
    nodeRequire(root + '/dist/main.js');
  `, 'utf8');
  app = await electron.launch({ args: [bootstrap], cwd: root,
    timeout: 60_000, env: { ...process.env, ...profile.env } });
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on('data', data => {
      mainOutput.push(String(data));
      if (mainOutput.length > 500) mainOutput.shift();
    });
  }
  page = await waitForMainWindow(app);
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('electron-main-output', { body: mainOutput.join(''), contentType: 'text/plain' });
  }
});
test.afterAll(async () => { await closeElectronTestSession(app, profile); });

for (const trigger of ['native', 'legacy-ipc'] as const) {
  test(`${trigger} minimizes without hiding the taskbar entry and restores the same window`, async () => {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!;
      win.restore(); win.show();
      (win as any).__minimizeProbe.skips = [];
      (win as any).__minimizeProbe.hides = 0;
    });
    if (trigger === 'native') {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!.minimize());
    } else {
      await page.evaluate(() => (window as any).api.minimizeToTray());
    }
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!;
      return { minimized: win.isMinimized(), hides: (win as any).__minimizeProbe.hides,
        skipped: (win as any).__minimizeProbe.skips.includes(true) };
    })).toEqual({ minimized: true, hides: 0, skipped: false });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!.restore());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!;
      return { visible: win.isVisible(), minimized: win.isMinimized() };
    })).toEqual({ visible: true, minimized: false });
  });
}
