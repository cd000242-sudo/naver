import type { ElectronApplication, Page } from '@playwright/test';

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
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]).catch(() => undefined);

  if (!childProcess.killed && childProcess.exitCode === null) {
    childProcess.kill();
  }
}
