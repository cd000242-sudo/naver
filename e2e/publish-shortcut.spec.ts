import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
let capture: string;

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-publish-shortcut-');
  capture = path.join(profile.root, 'publish.ndjson');
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist/main.js')],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture },
  });
  page = await waitForMainWindow(app);
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Capture any accidental publish-button activation before it reaches app handlers.
  await page.evaluate(() => {
    (window as any).__shortcutPublishClicks = 0;
    document.getElementById('unified-publish-btn')!.addEventListener('click', event => {
      (window as any).__shortcutPublishClicks++;
      event.stopImmediatePropagation();
    }, true);
  });
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

async function expectAtPublishControls() {
  await expect(page.locator('.tab-button[data-tab="unified"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pub-mode-single-panel')).toBeVisible();
  await expect(page.locator('#publish-btn-container')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#unified-only-publish-settings')).toBeFocused();
  expect(await page.evaluate(() => (window as any).__shortcutPublishClicks)).toBe(0);
  expect(await fs.readFile(capture, 'utf8').catch(() => '')).toBe('');
}

test('all six tabs retain a usable fixed shortcut after deep scrolling', async () => {
  for (const tab of ['main', 'unified', 'post-list', 'images', 'image-tools', 'analytics']) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    // Existing floating tools overlap the far-right tabs in narrow windows.
    // Enter activates the real tab handler without forcing a pointer through them.
    await page.locator(`.tab-button[data-tab="${tab}"]`).focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const shortcut = page.locator('#publish-shortcut-btn');
    await expect(shortcut).toBeInViewport({ ratio: 1 });
    await shortcut.click();
    await expectAtPublishControls();
  }
});

test('continuous and multi-account navigation preserves the draft and keyboard never publishes', async () => {
  await page.evaluate(() => {
    (document.getElementById('unified-generated-title') as HTMLInputElement).value = '보존할 원고 제목';
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = '## 소제목\n보존할 본문';
    (document.getElementById('unified-publish-mode') as HTMLInputElement).value = 'draft';
  });
  for (const mode of ['continuous', 'ma']) {
    await page.locator(`.pub-mode-tab[data-pubmode="${mode}"]`).click();
    await page.locator('#publish-shortcut-btn').focus();
    await page.keyboard.press('Enter');
    await expectAtPublishControls();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(page.locator('#unified-generated-title')).toHaveValue('보존할 원고 제목');
    await expect(page.locator('#unified-generated-content')).toHaveValue('## 소제목\n보존할 본문');
    await expect(page.locator('#unified-publish-mode')).toHaveValue('draft');
    expect(await page.evaluate(() => (window as any).__shortcutPublishClicks)).toBe(0);
  }
});

// [2026-10-11 사장님] 바로가기는 위쪽 고정 줄(비용표 왼쪽)에 같은 크기로 — 작은 창에서도 다 보이고 비용표와 겹치지 않는다.
test('small windows and scrolled toolbars keep the shortcut visible in the top row', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'))?.setSize(900, 680);
  });
  await page.evaluate(() => {
    const toolbar = document.getElementById('right-floating-buttons')!;
    toolbar.scrollTop = toolbar.scrollHeight;
    (document.getElementById('unified-publish-btn') as HTMLButtonElement).disabled = true;
  });
  const shortcut = page.locator('#publish-shortcut-btn');
  await expect(shortcut).toBeInViewport({ ratio: 1 });
  const box = await shortcut.boundingBox();
  const costBox = await page.locator('#reopen-price-info-btn').boundingBox();
  // 같은 줄(세로 가운데 2px 안)·같은 높이(2px 안)·비용표 왼쪽에서 끝난다.
  expect(Math.abs((box!.y + box!.height / 2) - (costBox!.y + costBox!.height / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(box!.height - costBox!.height)).toBeLessThanOrEqual(2);
  expect(box!.x + box!.width).toBeLessThan(costBox!.x);
  await shortcut.click();
  await expectAtPublishControls();
  await page.screenshot({ path: path.join(__dirname, '../tmp/publish-shortcut-small.png') });
});
