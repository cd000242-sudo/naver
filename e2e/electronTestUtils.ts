import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ElectronTestProfile {
  root: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function createElectronTestProfile(prefix: string): Promise<ElectronTestProfile> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const userDataDir = path.join(root, 'userdata');
  const appDataDir = path.join(root, 'appdata');
  const localAppDataDir = path.join(root, 'localappdata');
  await Promise.all(
    [userDataDir, appDataDir, localAppDataDir].map((dir) => fs.mkdir(dir, { recursive: true })),
  );

  return {
    root,
    env: {
      NODE_ENV: 'test',
      E2E_TEST: '1',
      E2E_USER_DATA_DIR: userDataDir,
      APPDATA: appDataDir,
      LOCALAPPDATA: localAppDataDir,
    },
    cleanup: () =>
      fs.rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      }),
  };
}

function isMainWindow(page: Page): boolean {
  const url = page.url().replace(/\\/g, '/');
  return url.includes('/dist/public/index.html');
}

export async function waitForMainWindow(app: ElectronApplication, timeoutMs = 60_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const mainWindow = app.windows().find((page) => !page.isClosed() && isMainWindow(page));
    if (mainWindow) {
      await mainWindow.waitForLoadState('domcontentloaded', { timeout: 10_000 });
      return mainWindow;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const windowUrls = app.windows().map((page) => page.url()).join(', ');
  throw new Error(`Main Electron window did not load within ${timeoutMs}ms. Windows: ${windowUrls}`);
}

export async function closeElectronApp(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return;

  const childProcess = app.process();
  await Promise.race([
    app.close(),
    delay(5_000),
  ]).catch(() => undefined);

  if (!childProcess.killed && childProcess.exitCode === null) {
    childProcess.kill();
  }

  if (childProcess.exitCode === null) {
    await Promise.race([
      new Promise<void>((resolve) => childProcess.once('exit', () => resolve())),
      delay(5_000),
    ]);
  }

  // Chromium dictionary and cache workers can release their Windows handles
  // a moment after the parent process exits.
  await delay(250);
}
