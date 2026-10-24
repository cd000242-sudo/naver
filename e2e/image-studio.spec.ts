import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
const errors: string[] = [];
async function tab(name: string) {
  const button = page.locator(`.tab-button[data-tab="${name}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#tab-${name}`)).toBeVisible();
}

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-image-studio-');
  app = await electron.launch({ args: [path.join(__dirname, '../dist/main.js')], cwd: path.join(__dirname, '..'), timeout: 60_000, env: { ...process.env, ...profile.env } });
  page = await waitForMainWindow(app);
  page.on('pageerror', e => errors.push(e.message));
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
});
test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('image defaults, AI mark persistence and retired options use the real settings IPC', async () => {
  await tab('images');
  await expect(page.locator('#image-source-select')).toHaveValue('openai-image');
  for (const id of ['image-thumbnail-quality-high', 'image-heading-text-include', 'image-look-editorial']) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
  const checkbox = page.locator('#image-ai-mark-all');
  const status = page.locator('#image-ai-mark-status');
  await expect(status).toHaveAttribute('data-state', 'saved');
  await checkbox.check();
  // getConfig can expose the in-memory value before saveConfig has finished.
  // Wait for the UI's persisted-value acknowledgement before reloading.
  await expect(status).toHaveText('저장됨 · 발행 시 모든 이미지에 AI 활용 표시');
  await expect(status).toHaveAttribute('data-state', 'saved');
  await expect(checkbox).toBeEnabled();
  await expect.poll(() => page.evaluate(async () => (await (window as any).api.getConfig()).aiMarkAllImages)).toBe(true);
  await page.reload();
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
  await tab('images');
  await expect(status).toHaveAttribute('data-state', 'saved');
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(status).toHaveText('저장됨 · AI 생성 이미지만 자동 판정');
  await expect(status).toHaveAttribute('data-state', 'saved');
  await expect(checkbox).toBeEnabled();
  await expect.poll(() => page.evaluate(async () => (await (window as any).api.getConfig()).aiMarkAllImages)).toBe(false);
});

test('studio templates, history, fit, clean PNG export and thumbnail application work together', async () => {
  await tab('image-tools');
  const canvas = page.locator('#thumbnail-canvas');
  await expect(canvas).toBeVisible();
  await page.locator('#thumb-main-text').fill('조금 더 나은 하루를 만드는 습관');
  await page.locator('#thumb-main-text').press('Tab');
  await page.locator('.thumb-preset-btn[data-preset="minimal"]').click();
  await expect(page.locator('#thumb-main-text')).toHaveValue('조금 더 나은 하루를 만드는 습관');
  await page.locator('#thumb-main-text').fill('서울에서 시작하는 새로운 일상');
  await page.locator('#thumb-main-text').press('Tab');
  await expect(page.locator('#thumb-undo')).toBeEnabled();
  await page.locator('#thumb-undo').click();
  await expect(page.locator('#thumb-main-text')).toHaveValue('조금 더 나은 하루를 만드는 습관');
  await page.locator('#thumb-redo').click();
  await expect(page.locator('#thumb-main-text')).toHaveValue('서울에서 시작하는 새로운 일상');
  await page.locator('#thumb-main-text').fill('복잡한 일상 속에서도 놓치지 않아야 할 작은 변화와 나만의 생활 습관을 정리했습니다');
  await page.locator('#thumb-fit-text').click();
  await expect(page.locator('#thumb-studio-status')).not.toHaveText('');
  await page.locator('#thumb-main-text').fill('일상을 바꾸는\n작은 습관');
  await page.locator('#thumb-sub-text').fill('오늘부터 시작하는 나만의 루틴');
  await page.locator('#thumb-fit-text').click();
  await page.locator('#thumb-safe-area').uncheck();
  const cleanPng = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL('image/png'));
  await page.locator('#thumb-safe-area').check();
  const file = path.join(profile.root, 'studio-thumbnail.png');
  // Electron owns the download; choose an isolated destination without a native dialog.
  await app.evaluate(({ BrowserWindow }, destination) => {
    const state = globalThis as any;
    state.studioDownloadState = 'waiting';
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!;
    window.webContents.session.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_doneEvent, result) => { state.studioDownloadState = result; });
    });
  }, file);
  await page.locator('#thumb-download-btn').click();
  await expect.poll(() => app.evaluate(() => (globalThis as any).studioDownloadState)).toBe('completed');
  const bytes = await fs.readFile(file);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.toString('base64')).toBe(cleanPng.split(',')[1]);
  await page.locator('#thumb-apply-target').selectOption('full-auto');
  await page.locator('#thumb-apply-btn').click();
  await expect.poll(() => page.evaluate(() => {
    const image = (window as any).presetThumbnails?.['full-auto'];
    return image ? { thumbnail: image.isThumbnail, provider: image.provider } : null;
  })).toEqual({ thumbnail: true, provider: 'thumbnail-generator' });
});

test('desktop and compact layouts keep the preview and actions reachable', async () => {
  await tab('image-tools');
  for (const [width, height, name] of [[1400, 950, 'desktop'], [980, 760, 'compact']] as const) {
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'))!.setSize(size[0], size[1]);
    }, [width, height]);
    await page.mouse.move(2, 2);
    await expect(page.locator('#thumbnail-canvas')).toBeVisible();
    const overflow = await page.locator('#subtab-thumbnail').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 2);
    await page.locator('#thumb-apply-btn').scrollIntoViewIfNeeded();
    await expect(page.locator('#thumb-apply-btn')).toBeInViewport();
    const shell = await page.locator('.thumbnail-studio-shell').boundingBox();
    const toolbar = await page.locator('#right-floating-buttons').boundingBox();
    expect(shell!.x + shell!.width).toBeLessThanOrEqual(toolbar!.x);
    await page.locator('#right-toolbar-toggle').click();
    await expect(page.locator('#right-floating-buttons')).toBeHidden();
    const expandedCanvasArea = await page.locator('.thumbnail-studio-shell').boundingBox();
    expect(expandedCanvasArea!.width).toBeGreaterThan(shell!.width);
    await page.locator('#tab-image-tools').screenshot({ path: path.join(__dirname, `../tmp/thumbnail-studio-${name}.png`) });
    await page.locator('#right-toolbar-toggle').click();
  }
  for (const name of ['converter', 'shopping-banner', 'thumbnail']) {
    await page.locator(`.image-tools-subtab[data-subtab="${name}"]`).click();
    await expect(page.locator(`#subtab-${name}`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
