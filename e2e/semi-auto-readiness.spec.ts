import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
let capture: string;
const runtimeErrors: string[] = [];
const rendererLogs: string[] = [];
const article = {
  id: 'ldb_ready_regression', title: '확장에서 가져온 원고 제목',
  content: '직접 작성해서 확장에서 가져온 원고입니다.\n\n## 준비할 내용\n\n확장에서 가져온 원고의 상세 본문입니다.',
  headings: [{ title: '준비할 내용', content: '확장에서 가져온 원고의 상세 본문입니다.', prompt: 'A tidy desk' }],
  hashtags: [], images: [], publishMode: 'draft',
};

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-semi-ready-');
  capture = path.join(profile.root, 'publish.ndjson');
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'early-import-main.cjs');
  // Hold a real initialization boundary so the first delivery deterministically
  // arrives before tab/navigation bindings. No production test hook is needed.
  await fs.writeFile(bootstrap, `
    const electron = require('electron');
    const root = ${JSON.stringify(root)};
    electron.app.setAppPath(root);
    globalThis.__startupConfigCalls = 0;
    globalThis.__earlyImportAcks = [];
    const ready = new Promise(resolve => { globalThis.__releaseStartupConfig = resolve; });
    const handle = electron.ipcMain.handle.bind(electron.ipcMain);
    electron.ipcMain.handle = (channel, listener) => handle(channel, channel === 'config:get' ? async (...args) => {
      globalThis.__startupConfigCalls++;
      await ready;
      return listener(...args);
    } : listener);
    electron.ipcMain.on('ldb:import-posts-result', (_event, result) => {
      if (result.requestId === 'readiness-fixture') globalThis.__earlyImportAcks.push(result);
    });
    require(root + '/dist/main.js');
  `);
  app = await electron.launch({
    args: [bootstrap], cwd: root,
    env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture },
  });
  page = await waitForMainWindow(app);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { rendererLogs.push(message.text()); if (rendererLogs.length > 100) rendererLogs.shift(); });
  page.on('dialog', dialog => { void dialog.dismiss(); });
  await page.waitForFunction(() => (window as any).__ldbPostsBound === true && typeof (window as any).updatePublishButtonVisibility === 'function');
  await expect.poll(() => app.evaluate(() => (globalThis as any).__startupConfigCalls)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('extension preload import and saved article loading enable the main semi-auto button without AI generation', async () => {
  await expect(page.locator('#publish-mode-top-select')).toHaveValue('semi-auto');
  await expect(page.locator('#unified-publish-btn')).toBeDisabled();
  await app.evaluate(({ BrowserWindow }, post) => {
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'))!
      .webContents.send('ldb:import-posts', [post], 'readiness-fixture');
  }, article);
  await expect(page.locator('.tab-button[data-tab="main"]')).toHaveClass(/active/);
  await expect(page.locator('#unified-generated-title')).toHaveValue('');
  expect(await app.evaluate(() => (globalThis as any).__earlyImportAcks)).toEqual([]);
  await app.evaluate(() => (globalThis as any).__releaseStartupConfig());
  await expect.poll(() => app.evaluate(() => (globalThis as any).__earlyImportAcks), {
    message: rendererLogs.join('\n'), timeout: 20_000,
  }).toEqual([{ requestId: 'readiness-fixture', ok: true, imported: 1 }]);
  await expect(page.locator('#unified-generated-title')).toHaveValue(article.title);
  await expect(page.locator('#unified-generated-content')).toHaveValue(article.content);
  await expect(page.locator('#unified-publish-btn')).toBeEnabled();
  await expect(page.locator('#unified-publish-btn')).toContainText('반자동 발행');
  await page.locator('#publish-shortcut-btn').click();
  await page.screenshot({ path: test.info().outputPath('import-ready-main-button.png') });

  await page.evaluate(() => (window as any).resetAllFields());
  await expect(page.locator('#unified-publish-btn')).toBeDisabled();
  await page.locator(`.load-post-btn[data-post-id="${article.id}"]`).first().evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('#unified-generated-title')).toHaveValue(article.title);
  await expect(page.locator('#unified-generated-content')).toHaveValue(article.content);
  await expect(page.locator('#unified-publish-btn')).toBeEnabled();
  expect(await fs.readFile(capture, 'utf8').catch(() => '')).toBe('');
});

test('autosaved draft recovery enables publishing after asynchronous field restoration', async () => {
  await page.evaluate(() => {
    localStorage.setItem('naver_blog_autosave', JSON.stringify({
      timestamp: Date.now(), mode: 'semi-auto', generatedImages: [],
      structuredContent: { selectedTitle: '복구한 원고 제목', bodyPlain: '자동저장 파일에서 복구한 본문입니다.', headings: [], hashtags: [] },
    }));
  });
  await page.reload();
  await page.locator('[data-choice-id="restore-autosave"]').click();
  await expect(page.locator('#unified-generated-title')).toHaveValue('복구한 원고 제목');
  await expect(page.locator('#unified-generated-content')).toHaveValue('자동저장 파일에서 복구한 본문입니다.');
  await expect(page.locator('#unified-publish-btn')).toBeEnabled();
  await expect(page.locator('#publish-mode-top-select')).toHaveValue('semi-auto');
  expect(await fs.readFile(capture, 'utf8').catch(() => '')).toBe('');
});

test('manual edits and paste control readiness and the visible button dispatches the latest draft to intercepted IPC', async () => {
  const title = page.locator('#unified-generated-title');
  const body = page.locator('#unified-generated-content');
  const publish = page.locator('#unified-publish-btn');
  await title.fill('');
  await expect(publish).toBeDisabled();
  await title.fill('사용자가 최종 수정한 제목');
  await body.fill(' \n ');
  await expect(publish).toBeDisabled();
  await body.fill('');
  // Exercise native paste without changing the user's system clipboard.
  await body.evaluate((field: HTMLTextAreaElement) => {
    field.focus();
    field.dispatchEvent(new Event('paste', { bubbles: true }));
    document.execCommand('insertText', false, '마지막에 붙여넣은 본문입니다.');
  });
  await expect(publish).toBeEnabled();
  await expect(body).toHaveValue('마지막에 붙여넣은 본문입니다.');
  await page.locator('#publish-shortcut-btn').click();
  await page.screenshot({ path: test.info().outputPath('manual-ready-main-button.png') });
  await page.evaluate(() => {
    (document.getElementById('naver-id') as HTMLInputElement).value = 'e2e-runtime';
    (document.getElementById('naver-password') as HTMLInputElement).value = 'not-a-real-password';
    (document.getElementById('unified-publish-mode') as HTMLInputElement).value = 'draft';
    const skipImages = document.getElementById('unified-skip-images') as HTMLInputElement | null;
    if (skipImages) skipImages.checked = true;
    // Deliberately stale cache proves that visible edits win at the actual handler.
    (window as any).currentStructuredContent = { selectedTitle: '오래된 제목', bodyPlain: '오래된 본문', headings: [], hashtags: [] };
  });
  await publish.click();
  await expect.poll(async () => (await fs.readFile(capture, 'utf8').catch(() => '')).trim(), { timeout: 45_000 }).not.toBe('');
  const records = (await fs.readFile(capture, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  expect(records).toHaveLength(1);
  expect(records[0].payload).toMatchObject({
    _publishFlow: 'semi_auto', publishMode: 'draft',
    title: '사용자가 최종 수정한 제목', content: '마지막에 붙여넣은 본문입니다.',
    structuredContent: { selectedTitle: '사용자가 최종 수정한 제목', bodyPlain: '마지막에 붙여넣은 본문입니다.' },
  });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__pipelineRunOwner))).toBe(false);
  await expect(publish).toBeDisabled();
  expect(runtimeErrors).toEqual([]);
});
