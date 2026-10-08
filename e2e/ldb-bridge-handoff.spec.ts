import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, type ElectronTestProfile, waitForMainWindow } from './electronTestUtils';

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
let baseUrl: string;
let token: string;
let accountId: string;
let imageBytes: Buffer;
let customImageSavePath: string;
let downloadSavePath: string;
const fixtureLogin = 'ldb_e2e_fixture';
const categories = [{ id: '7', name: '연결 검증' }, { id: '8', name: '이미지 검증' }];
const origin = 'chrome-extension://' + 'a'.repeat(32);
const runtimeErrors: string[] = [];

async function bridge(route: string, body?: unknown) {
  const response = await fetch(baseUrl + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const result = await response.json();
  expect(response.status, `LDB ${route}: ${JSON.stringify(result)}`).toBe(200);
  expect(result.ok).toBe(true);
  return result;
}

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-ldb-handoff-e2e-');
  customImageSavePath = path.join(profile.root, 'configured-image-folder');
  downloadSavePath = path.join(profile.root, 'isolated-downloads');
  await fs.mkdir(downloadSavePath, { recursive: true });
  // 실제 네트워크만 고정하며, 부트스트랩 이후 원본 앱 전체를 실행한다.
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'ldb-test-main.cjs');
  await fs.writeFile(bootstrap, `
    const root = ${JSON.stringify(root)};
    const electron = require('electron');
    electron.app.setAppPath(root);
    electron.app.setPath('downloads', ${JSON.stringify(downloadSavePath)});
    const nodeRequire = require('node:module').createRequire(root + '/package.json');
    const axios = nodeRequire('axios').default;
    const originalAdapter = axios.getAdapter(axios.defaults.adapter);
    const fixture = ${JSON.stringify({ login: fixtureLogin, categories })};
    axios.defaults.adapter = async config => {
      if (String(config.url).includes('/category-list')) {
        if (!String(config.url).includes('/' + fixture.login + '/')) throw new Error('Fixture account identity mismatch');
        return { data: { isSuccess: true, result: { mylogCategoryList: fixture.categories.map(item => ({ categoryNo: item.id, categoryName: item.name, postCnt: 0 })) } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return originalAdapter(config);
    };
    const http = nodeRequire('node:http');
    const originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      if (args[0] === 47630 && args[1] === '127.0.0.1') {
        args[0] = 0;
        http.Server.prototype.listen = originalListen;
        this.once('listening', () => { process.env.LDB_E2E_PORT = String(this.address().port); });
      }
      return originalListen.apply(this, args);
    };
    nodeRequire(root + '/dist/main.js');
  `, 'utf8');
  app = await electron.launch({
    args: [bootstrap],
    cwd: path.join(__dirname, '..'), timeout: 60_000,
    env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: path.join(profile.root, 'must-not-publish.ndjson') },
  });
  let startupOutput = '';
  const recordStartup = (chunk: Buffer) => { startupOutput = (startupOutput + String(chunk)).slice(-64 * 1024); };
  app.process().stderr?.on('data', recordStartup);
  app.process().stdout?.on('data', chunk => {
    recordStartup(chunk);
    const text = String(chunk);
    if (/IPC Guard.*ldb:|이중.*ldb:/.test(text)) runtimeErrors.push('LDB IPC listener registration was rejected');
  });
  try { page = await waitForMainWindow(app); }
  catch (error) {
    await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
    await fs.writeFile(path.join(root, 'tmp', 'ldb-317-image-handoff-startup.log'), startupOutput, 'utf8');
    throw error;
  }
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('dialog', dialog => { void dialog.dismiss(); });
  await page.waitForFunction(() => (window as any).__ldbPostsBound === true && typeof (window as any).applyLdbMainAccount === 'function');
  accountId = await page.evaluate(async ({ login, imageSavePath }) => {
    const result = await (window as any).api.addBlogAccount('LDB E2E 계정', '카테고리 표시 이름', login, 'not-a-real-password', {});
    if (!result.success || !result.account?.id) throw new Error('Fixture account creation failed');
    // Match the isolated license identity used by asynchronous renderer startup.
    const license = await (window as any).api.getLicense();
    const fixtureUser = license?.license?.userId || await (window as any).api.getDeviceId();
    if (!fixtureUser) throw new Error('Isolated license identity missing');
    await (window as any).api.saveConfig({ __userId: fixtureUser, ldbBridgeEnabled: true, customImageSavePath: imageSavePath });
    return result.account.id;
  }, { login: fixtureLogin, imageSavePath: customImageSavePath });
  const credentials = await page.evaluate(() => (window as any).api.getLdbBridgeToken());
  expect(credentials.ok).toBe(true);
  token = credentials.token;
  await expect.poll(() => app.evaluate(() => Number(process.env.LDB_E2E_PORT || 0))).toBeGreaterThan(0);
  const port = await app.evaluate(() => Number(process.env.LDB_E2E_PORT || 0));
  expect(port).not.toBe(47630);
  baseUrl = `http://127.0.0.1:${port}`;
  imageBytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 20, g: 140, b: 210, alpha: 1 } } }).png().toBuffer();
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('real HTTP selection, article, heading images and repeat delivery cross preload and renderer ACK', async () => {
  test.setTimeout(90_000);
  expect((await bridge('/v1/status')).capabilities).toContain('account-categories');
  const accounts = await bridge('/v1/accounts');
  expect(accounts.accounts).toHaveLength(1);
  expect(accounts.accounts[0].id).toBe(accountId);
  expect(JSON.stringify(accounts)).not.toContain(fixtureLogin);
  expect((await bridge('/v1/categories?accountId=' + accountId)).categories).toEqual(categories);
  const destination = { accountId, categoryId: '7' };
  await bridge('/v1/selection', destination);
  await expect(page.locator('#main-account-selector')).toHaveValue(accountId);
  await expect(page.locator('#real-blog-category-select')).toHaveValue('연결 검증');

  const content = '연결 테스트를 위한 원고입니다.\n\n## 준비할 내용\n\n첫 번째 소제목의 실제 본문입니다.\n\n## 확인할 내용\n\n두 번째 소제목의 실제 본문입니다.';
  const article = {
    id: 'ldb_e2e_handoff', title: 'LDB 수신 연결 검증', content, publishMode: 'draft',
    structuredContent: { thumbnailPrompt: '정돈된 책상 위 준비물을 한눈에 보여주는 썸네일' },
    headings: [{ title: '준비할 내용', content: '첫 번째 소제목의 실제 본문입니다.', prompt: 'A neatly arranged desk with preparation materials' },
      { title: '확인할 내용', content: '두 번째 소제목의 실제 본문입니다.', prompt: 'A close-up checklist with distinct completed tasks' }],
    hashtags: ['연결테스트'], images: [] as any[],
  };
  await page.locator('.tab-button[data-tab="unified"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.pub-mode-tab[data-pubmode="continuous"]').click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.webContents.getURL().includes('index.html'))!.minimize());
  const articleAck = await bridge('/v1/posts', { posts: [article], destination });
  expect(articleAck.imported).toBe(1);
  expect(articleAck.selection).toEqual(destination);
  await expect(page.locator('#unified-generated-title')).toHaveValue(article.title);
  await expect(page.locator('#unified-generated-content')).toHaveValue(content);
  await expect(page.locator('.tab-button[data-tab="unified"]')).toHaveClass(/active/);
  await expect(page.locator('.pub-mode-tab[data-pubmode="single"]')).toHaveClass(/active/);
  await expect(page.locator('#unified-semi-auto-section')).toBeInViewport();
  await expect(page.locator('#unified-semi-auto-section')).toBeFocused();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(value => value.webContents.getURL().includes('index.html'))!;
    return { visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused() };
  })).toEqual({ visible: true, minimized: false, focused: true });
  await expect(page.locator('#prompts-container .prompt-item')).toHaveCount(3);
  const expectedPrompts = [article.structuredContent.thumbnailPrompt, ...article.headings.map(heading => heading.prompt)];
  await expect(page.locator('#prompts-container .prompt-item .prompt-text')).toHaveText(expectedPrompts);

  const png = 'data:image/png;base64,' + imageBytes.toString('base64');
  article.images = [{ heading: '🖼️ 썸네일', isThumbnail: true, prompt: article.structuredContent.thumbnailPrompt, previewDataUrl: png },
    ...article.headings.map((heading, headingIndex) => ({ heading: heading.title, headingIndex, prompt: heading.prompt, previewDataUrl: png }))];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.locator('.tab-button[data-tab="images"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#images-subtab-generate').click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html'))!.hide());
    const ack = await bridge('/v1/posts', { posts: [article], destination });
    expect(ack.imported).toBe(1);
    expect(ack.selection).toEqual(destination);
    await expect(page.locator('#prompts-container .prompt-item .prompt-text')).toHaveText(expectedPrompts);
    await expect(page.locator('.tab-button[data-tab="images"]')).toHaveClass(/active/);
    await expect(page.locator('#images-subpanel-manage')).toBeVisible();
    await expect(page.locator('#images-subpanel-generate')).toBeHidden();
    await expect(page.locator('#prompts-container')).toBeInViewport();
    await expect(page.locator('#prompts-container')).toBeFocused();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html'))!.isVisible())).toBe(true);
  }
  await expect(page.locator('#prompts-container .prompt-item .generated-image img')).toHaveCount(3);
  const headingImages = page.locator('#prompts-container .prompt-item .generated-image img');
  await expect.poll(() => headingImages.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const state = await page.evaluate(() => {
    const posts = JSON.parse(localStorage.getItem('naver_blog_generated_posts') || '[]');
    return {
      posts: posts.map((post: any) => ({ id: post.id, isPublished: post.isPublished, images: post.images, structuredContent: post.structuredContent })),
      manager: (window as any).ImageManager?.getAllImages().map((image: any) => ({ heading: image.heading, isThumbnail: image.isThumbnail === true, filePath: image.filePath, prompt: image.prompt })),
      selection: (document.getElementById('real-blog-category-select') as HTMLSelectElement).selectedOptions[0]?.dataset.realBlogCategoryId,
    };
  });
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].isPublished).toBe(false);
  expect(state.posts[0].images.map((image: any) => image.heading)).toEqual(['🖼️ 썸네일', '준비할 내용', '확인할 내용']);
  expect(state.manager?.map((image: any) => image.heading)).toEqual(expect.arrayContaining(['🖼️ 썸네일', '준비할 내용', '확인할 내용']));
  expect(state.selection).toBe('7');
  expect(state.posts[0].images.map((image: any) => image.prompt)).toEqual(expectedPrompts);
  expect(state.posts[0].structuredContent.thumbnailPrompt).toBe(expectedPrompts[0]);
  expect(state.posts[0].structuredContent.headings.map((heading: any) => heading.prompt)).toEqual(expectedPrompts.slice(1));
  expect(state.manager?.map((image: any) => image.prompt)).toEqual(expect.arrayContaining(expectedPrompts));
  for (const image of state.posts[0].images) {
    const relative = path.relative(customImageSavePath, image.filePath);
    expect(path.isAbsolute(relative)).toBe(false);
    expect(relative).not.toMatch(/^\.\.(?:[\\/]|$)/);
    expect(relative.split(path.sep)).toHaveLength(2);
    expect(await fs.readFile(image.filePath)).toEqual(imageBytes);
  }
  const savedFolders = await fs.readdir(customImageSavePath);
  expect(savedFolders).toHaveLength(1);
  expect(await fs.readdir(path.join(customImageSavePath, savedFolders[0]))).toHaveLength(1);
  await bridge('/v1/selection', { accountId, categoryId: '8' });
  await expect(page.locator('#real-blog-category-select')).toHaveValue('이미지 검증');
  await expect(page.locator('#unified-generated-content')).toHaveValue(content);
  await expect(page.locator('#prompts-container .prompt-item .generated-image img')).toHaveCount(3);
  expect(await fs.stat(path.join(profile.root, 'must-not-publish.ndjson')).then(() => true, () => false)).toBe(false);
  await expect(page.locator('#prompts-container .prompt-item .prompt-text')).toHaveText(expectedPrompts);
  expect(runtimeErrors).toEqual([]);
});

test('saved download files retain exact thumbnail and heading assignments through HTTP, disk and renderer ACK', async () => {
  test.setTimeout(90_000);
  expect((await bridge('/v1/status')).capabilities).toContain('download-image-files');
  const headings = [{ title: '준비 장면', content: '준비할 내용', prompt: 'A blue preparation desk' },
    { title: '확인 장면', content: '확인할 내용', prompt: 'A green completed checklist' }];
  const article = { id: 'ldb_e2e_saved_downloads', title: '다운로드 폴더 이미지 배치 검증',
    content: '다운로드한 파일을 실제로 읽어 배치합니다.\n\n## 준비 장면\n준비할 내용\n\n## 확인 장면\n확인할 내용',
    headings, structuredContent: { thumbnailPrompt: 'A warm orange overview' }, publishMode: 'draft', images: [] as any[] };
  const destination = { accountId, categoryId: '7' };
  await bridge('/v1/posts', { posts: [article], destination });
  const colors = ['#e88c29', '#287ad2', '#23a066'];
  const bytes = await Promise.all(colors.map(background => sharp({ create: { width: 8, height: 8, channels: 4, background } }).png().toBuffer()));
  const imageHeadings = ['🖼️ 썸네일', ...headings.map(value => value.title)];
  for (let index = 0; index < bytes.length; index++) {
    const relativePath = `LDB Image Ultra/다운로드 배치 검증-e2e/${index === 0 ? '00-thumbnail' : `0${index}-heading`}.png`;
    const filename = path.join(downloadSavePath, relativePath);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, bytes[index]);
    article.images.push({ heading: imageHeadings[index], isThumbnail: index === 0, ...(index ? { headingIndex: index - 1 } : {}),
      prompt: index ? headings[index - 1].prompt : article.structuredContent.thumbnailPrompt,
      // A deliberately different inline fallback proves that the saved file is authoritative.
      previewDataUrl: 'data:image/png;base64,' + imageBytes.toString('base64'),
      downloadRef: { relativePath, mime: 'image/png', byteLength: bytes[index].length,
        sha256: createHash('sha256').update(bytes[index]).digest('hex') } });
  }
  await page.locator('.tab-button[data-tab="unified"]').focus();
  await page.keyboard.press('Enter');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html'))!.minimize());
  const ack = await bridge('/v1/posts', { posts: [article], destination });
  expect(ack).toMatchObject({ imported: 1, selection: destination });
  await expect(page.locator('.tab-button[data-tab="images"]')).toHaveClass(/active/);
  await expect(page.locator('#images-subpanel-manage')).toBeVisible();
  await expect(page.locator('#prompts-container')).toBeFocused();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(value => value.webContents.getURL().includes('index.html'))!;
    return { visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused() };
  })).toEqual({ visible: true, minimized: false, focused: true });
  const imageRows = page.locator('#prompts-container .prompt-item');
  await expect(imageRows).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    const row = imageRows.filter({ has: page.locator(`.generated-image img[src="data:image/png;base64,${bytes[index].toString('base64')}"]`) });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-heading-title', imageHeadings[index]);
    await expect.poll(() => row.locator('.generated-image img').evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth)).toBe(8);
  }
  const stored = await page.evaluate(id => JSON.parse(localStorage.getItem('naver_blog_generated_posts') || '[]').find((value: any) => value.id === id), article.id);
  expect(stored.isPublished).toBe(false);
  expect(stored.images.map((image: any) => image.heading)).toEqual(imageHeadings);
  const saveFolders = new Set<string>();
  for (let index = 0; index < 3; index++) {
    const filePath = stored.images[index].filePath;
    expect(path.relative(customImageSavePath, filePath)).not.toMatch(/^\.\.(?:[\\/]|$)/u);
    expect(await fs.readFile(filePath)).toEqual(bytes[index]);
    saveFolders.add(path.dirname(filePath));
  }
  expect(saveFolders.size).toBe(1);
  expect(await fs.readdir([...saveFolders][0])).toHaveLength(3);
  expect(await fs.stat(path.join(profile.root, 'must-not-publish.ndjson')).then(() => true, () => false)).toBe(false);
  expect(runtimeErrors).toEqual([]);
});
