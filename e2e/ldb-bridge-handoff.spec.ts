import fs from 'node:fs/promises';
import path from 'node:path';
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
const fixtureLogin = 'ldb_e2e_fixture';
const categories = [{ id: '7', name: '연결 검증' }, { id: '8', name: '이미지 검증' }];
const origin = 'chrome-extension://' + 'a'.repeat(32);
const runtimeErrors: string[] = [];
const bridgeStartupErrors: string[] = [];

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
  // 실제 네트워크만 고정하며, 부트스트랩 이후 원본 앱 전체를 실행한다.
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'ldb-test-main.cjs');
  await fs.writeFile(bootstrap, `
    const root = ${JSON.stringify(root)};
    const electron = require('electron');
    electron.app.setAppPath(root);
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
  const recordMainOutput = (chunk: Buffer | string) => {
    const text = String(chunk);
    if (/IPC Guard.*ldb:|이중.*ldb:/.test(text)) runtimeErrors.push('LDB IPC listener registration was rejected');
    if (/\[LDB 브리지\].*(실패|시작하지 않았습니다)/.test(text)) {
      bridgeStartupErrors.push(text.trim());
      if (bridgeStartupErrors.length > 10) bridgeStartupErrors.shift();
    }
  };
  app.process().stdout?.on('data', recordMainOutput);
  app.process().stderr?.on('data', recordMainOutput);
  page = await waitForMainWindow(app);
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('dialog', dialog => { void dialog.dismiss(); });
  await page.waitForFunction(() => (window as any).__ldbPostsBound === true && typeof (window as any).applyLdbMainAccount === 'function');
  // LDB listeners bind at DOMContentLoaded, before initializeApplication finishes
  // loading settings. Wait for initUnifiedTab, which follows those awaited reads,
  // before switching the fixture's account config and enabling the bridge.
  await expect(page.locator('#refresh-posts-list-btn'))
    .toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
  const accountSetup = await page.evaluate(async ({ login }) => {
    const result = await (window as any).api.addBlogAccount('LDB E2E 계정', '카테고리 표시 이름', login, 'not-a-real-password', {});
    if (!result.success || !result.account?.id) throw new Error('Fixture account creation failed');
    // Match the real flow: login activates/loads an account first, and the
    // settings toggle then saves its preference into that established account.
    await (window as any).api.saveConfig({ __userId: 'ldb-e2e-user' });
    await (window as any).api.getConfig();
    await (window as any).api.saveConfig({ ldbBridgeEnabled: true });
    const reloaded = await (window as any).api.getConfig();
    return { id: result.account.id, reloadedEnabled: reloaded.ldbBridgeEnabled };
  }, { login: fixtureLogin });
  expect(accountSetup.reloadedEnabled, 'LDB fixture setting changed before bridge startup').toBe(true);
  accountId = accountSetup.id;
  const credentials = await page.evaluate(() => (window as any).api.getLdbBridgeToken());
  expect(credentials.ok, `LDB startup failed (enabled=${credentials.enabled}); ${bridgeStartupErrors.join(' | ')}`).toBe(true);
  expect(credentials.token).toMatch(/^[A-Za-z0-9_-]{16,}$/);
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
    headings: [{ title: '준비할 내용', content: '첫 번째 소제목의 실제 본문입니다.' }, { title: '확인할 내용', content: '두 번째 소제목의 실제 본문입니다.' }],
    hashtags: ['연결테스트'], images: [] as any[],
  };
  const articleAck = await bridge('/v1/posts', { posts: [article], destination });
  expect(articleAck.imported).toBe(1);
  expect(articleAck.selection).toEqual(destination);
  await expect(page.locator('#unified-generated-title')).toHaveValue(article.title);
  await expect(page.locator('#unified-generated-content')).toHaveValue(content);
  await expect(page.locator('#prompts-container .prompt-item')).toHaveCount(3);

  const png = 'data:image/png;base64,' + imageBytes.toString('base64');
  article.images = [{ heading: '🖼️ 썸네일', isThumbnail: true, previewDataUrl: png }, ...article.headings.map((heading, headingIndex) => ({ heading: heading.title, headingIndex, previewDataUrl: png }))];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ack = await bridge('/v1/posts', { posts: [article], destination });
    expect(ack.imported).toBe(1);
    expect(ack.selection).toEqual(destination);
  }
  await expect(page.locator('#prompts-container .prompt-item .generated-image img')).toHaveCount(3);
  const headingImages = page.locator('#prompts-container .prompt-item .generated-image img');
  await expect.poll(() => headingImages.evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const state = await page.evaluate(() => {
    const posts = JSON.parse(localStorage.getItem('naver_blog_generated_posts') || '[]');
    return {
      posts: posts.map((post: any) => ({ id: post.id, isPublished: post.isPublished, images: post.images })),
      manager: (window as any).ImageManager?.getAllImages().map((image: any) => ({ heading: image.heading, isThumbnail: image.isThumbnail === true, filePath: image.filePath })),
      selection: (document.getElementById('real-blog-category-select') as HTMLSelectElement).selectedOptions[0]?.dataset.realBlogCategoryId,
    };
  });
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].isPublished).toBe(false);
  expect(state.posts[0].images.map((image: any) => image.heading)).toEqual(['🖼️ 썸네일', '준비할 내용', '확인할 내용']);
  expect(state.manager?.map((image: any) => image.heading)).toEqual(expect.arrayContaining(['🖼️ 썸네일', '준비할 내용', '확인할 내용']));
  expect(state.selection).toBe('7');
  for (const image of state.posts[0].images) {
    expect(path.relative(profile.env.E2E_USER_DATA_DIR!, image.filePath)).toMatch(/^ldb-images[\\/]/);
    expect(await fs.readFile(image.filePath)).toEqual(imageBytes);
  }
  await bridge('/v1/selection', { accountId, categoryId: '8' });
  await expect(page.locator('#real-blog-category-select')).toHaveValue('이미지 검증');
  await expect(page.locator('#unified-generated-content')).toHaveValue(content);
  await expect(page.locator('#prompts-container .prompt-item .generated-image img')).toHaveCount(3);
  expect(await fs.stat(path.join(profile.root, 'must-not-publish.ndjson')).then(() => true, () => false)).toBe(false);
  expect(runtimeErrors).toEqual([]);
});
