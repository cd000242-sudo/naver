import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

// E2E_TEST deliberately skips production login. This covers the real connection
// URI -> consent prompt -> config -> HTTP readiness path after fixture auth.
// It does not certify OS protocol registration or production account login.
const CONNECT_URL = 'better-life-naver://ldb/connect';
const ROOT = path.join(__dirname, '..');
const FIXTURE_LOGIN = 'ldb_connect_fixture';
type PromptAnswer = 0 | 1 | 'throw';
type Lifecycle = { ports: number[]; closed: number[]; prompts: Array<{ message: string; buttons: string[]; defaultId: number; cancelId: number }> };

/** The native message box cannot be clicked from a test, so the bootstrap answers it and records what was asked. */
async function launch(profile: ElectronTestProfile, answer: PromptAnswer, withUrl: boolean): Promise<{ app: ElectronApplication; page: Page; capture: string }> {
  const capture = path.join(profile.root, 'must-not-publish.ndjson');
  const bootstrap = path.join(profile.root, 'ldb-connect-main.cjs');
  await fs.writeFile(bootstrap, `
    const root = ${JSON.stringify(ROOT)};
    const electron = require('electron');
    electron.app.setAppPath(root);
    const nodeRequire = require('node:module').createRequire(root + '/package.json');
    const axios = nodeRequire('axios').default;
    axios.defaults.adapter = async config => {
      if (String(config.url).includes('/category-list')) {
        if (!String(config.url).includes('/${FIXTURE_LOGIN}/')) throw new Error('Unexpected fixture account');
        return { data: { isSuccess: true, result: { mylogCategoryList: [{ categoryNo: '7', categoryName: '연결 검증', postCnt: 0 }] } }, status: 200, statusText: 'OK', headers: {}, config };
      }
      throw new Error('External HTTP is disabled in the isolated connection test');
    };
    globalThis.__ldbLifecycle = { ports: [], closed: [], prompts: [] };
    electron.dialog.showMessageBox = async (...args) => {
      const options = args[args.length - 1];
      globalThis.__ldbLifecycle.prompts.push({ message: options.message, buttons: options.buttons, defaultId: options.defaultId, cancelId: options.cancelId });
      if (${JSON.stringify(answer)} === 'throw') throw new Error('message box unavailable in this test');
      return { response: ${JSON.stringify(answer)}, checkboxChecked: false };
    };
    const http = nodeRequire('node:http');
    const originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      if (args[0] === 47630 && args[1] === '127.0.0.1') {
        // Keep the substitution installed for EVERY restart. Never touch the
        // user's live bridge port, including the second checkbox enable.
        args[0] = 0;
        this.once('listening', () => {
          const port = this.address().port;
          globalThis.__ldbLifecycle.ports.push(port);
          this.once('close', () => globalThis.__ldbLifecycle.closed.push(port));
        });
      }
      return originalListen.apply(this, args);
    };
    nodeRequire(root + '/dist/main.js');
  `, 'utf8');
  const app = await electron.launch({
    args: withUrl ? [bootstrap, CONNECT_URL] : [bootstrap], cwd: ROOT, timeout: 60_000,
    env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture },
  });
  const page = await waitForMainWindow(app);
  page.on('dialog', dialog => { void dialog.dismiss(); });
  return { app, page, capture };
}

const lifecycle = (app: ElectronApplication): Promise<Lifecycle> => app.evaluate(() => (globalThis as any).__ldbLifecycle);
/** For expect.poll: right after launch the main-process evaluate can be torn down once; a miss is just "not yet". */
const peek = <T>(app: ElectronApplication, pick: (value: Lifecycle) => T): Promise<T | undefined> => lifecycle(app).then(pick, () => undefined);

/** Activates only the isolated fixture identity; enabling the bridge is left to the route under test. */
function addFixtureAccount(page: Page): Promise<string> {
  return page.evaluate(async login => {
    const license = await (window as any).api.getLicense();
    const fixtureUser = license?.license?.userId || await (window as any).api.getDeviceId();
    if (!fixtureUser) throw new Error('Isolated license identity missing');
    await (window as any).api.saveConfig({ __userId: fixtureUser });
    const result = await (window as any).api.addBlogAccount('LDB 연결 테스트', '테스트 블로그', login, 'fixture-only-not-a-password', {});
    if (!result.success || !result.account?.id) throw new Error('Fixture account creation failed');
    return result.account.id;
  }, FIXTURE_LOGIN);
}

async function openConnectionSettings(page: Page): Promise<void> {
  await page.locator('#settings-button-fixed').click();
  await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 15_000 });
  await page.locator('#nav-api-keys-btn').click();
  await expect(page.locator('#ldb-bridge-enabled')).toBeVisible({ timeout: 15_000 });
}

async function readBridge(app: ElectronApplication, page: Page, port: number, route: string): Promise<any> {
  expect(port).not.toBe(47630);
  const credentials = await page.evaluate(() => (window as any).api.getLdbBridgeToken());
  expect(credentials.ok).toBe(true);
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    headers: { origin: 'chrome-extension://' + 'a'.repeat(32), authorization: `Bearer ${credentials.token}` },
    signal: AbortSignal.timeout(5_000),
  });
  expect(response.status).toBe(200);
  return response.json();
}

test('connection URI asks once; [나중에] leaves the bridge off and the checkbox still starts, stops and restarts it', async () => {
  test.setTimeout(90_000);
  const profile = await createElectronTestProfile('bln-ldb-connect-e2e-');
  let app: ElectronApplication | undefined;
  try {
    const session = await launch(profile, 1, true);
    app = session.app;
    const { page, capture } = session;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await expect.poll(() => peek(app!, value => value.prompts.length)).toBe(1);
    expect((await lifecycle(app)).prompts[0]).toEqual({ message: '크롬의 LDB 확장이 이 앱과 연결하려고 해요. 연결을 켤까요?', buttons: ['켜기', '나중에'], defaultId: 1, cancelId: 1 });
    // "Later" means later: no settings screen is pushed at the person and nothing listens.
    await expect(page.locator('#settings-modal')).toBeHidden();
    expect((await lifecycle(app)).ports).toEqual([]);
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile.env.E2E_USER_DATA_DIR);

    const accountId = await addFixtureAccount(page);
    await openConnectionSettings(page);
    const checkbox = page.locator('#ldb-bridge-enabled');
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect.poll(() => peek(app!, value => value.ports.length)).toBe(1);
    const firstPort = (await lifecycle(app)).ports[0];
    expect(firstPort).toBeGreaterThan(0);
    const version = await app.evaluate(({ app }) => app.getVersion());
    const status = await readBridge(app, page, firstPort, '/v1/status');
    expect(status).toMatchObject({ ok: true, ready: true, auth: 'ready', version });
    expect(status).not.toHaveProperty('token');
    const accounts = await readBridge(app, page, firstPort, '/v1/accounts');
    expect(accounts.accounts.map((value: any) => value.id)).toEqual([accountId]);
    expect(JSON.stringify(accounts)).not.toContain(FIXTURE_LOGIN);

    await checkbox.uncheck();
    await expect.poll(() => peek(app!, value => value.closed)).toContain(firstPort);
    await expect(fetch(`http://127.0.0.1:${firstPort}/v1/status`, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
    await checkbox.check();
    await expect.poll(() => peek(app!, value => value.ports.length)).toBe(2);
    const secondPort = (await lifecycle(app)).ports[1];
    expect(await readBridge(app, page, secondPort, '/v1/status')).toMatchObject({ ready: true, version });
    expect((await readBridge(app, page, secondPort, '/v1/accounts')).accounts.map((value: any) => value.id)).toEqual([accountId]);
    expect((await lifecycle(app)).prompts.length).toBe(1);
    expect(await fs.stat(capture).then(() => true, () => false)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await closeElectronTestSession(app, profile);
  }
});

test('connection URI + [켜기] starts the isolated bridge without the settings screen, and a second URI does not ask again', async () => {
  test.setTimeout(90_000);
  const profile = await createElectronTestProfile('bln-ldb-consent-e2e-');
  let app: ElectronApplication | undefined;
  try {
    const session = await launch(profile, 0, false);
    app = session.app;
    const { page, capture } = session;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const accountId = await addFixtureAccount(page);
    expect((await lifecycle(app)).prompts).toEqual([]);
    const openUri = () => app!.evaluate(({ app }, url) => { app.emit('second-instance', {}, ['better-life-naver.exe', url], ''); }, CONNECT_URL);

    await openUri();
    await expect.poll(() => peek(app!, value => value.ports.length)).toBe(1);
    expect((await lifecycle(app)).prompts.length).toBe(1);
    await expect(page.locator('#settings-modal')).toBeHidden();
    const port = (await lifecycle(app)).ports[0];
    const version = await app.evaluate(({ app }) => app.getVersion());
    expect(await readBridge(app, page, port, '/v1/status')).toMatchObject({ ok: true, ready: true, auth: 'ready', version });
    expect((await readBridge(app, page, port, '/v1/accounts')).accounts.map((value: any) => value.id)).toEqual([accountId]);

    await openUri();
    await openConnectionSettings(page);
    await expect(page.locator('#ldb-bridge-enabled')).toBeChecked();
    expect((await lifecycle(app)).prompts.length).toBe(1);
    expect((await lifecycle(app)).ports).toEqual([port]);
    expect(await fs.stat(capture).then(() => true, () => false)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await closeElectronTestSession(app, profile);
  }
});

test('when the consent prompt cannot be shown, the connection URI falls back to the settings screen with the switch off', async () => {
  test.setTimeout(90_000);
  const profile = await createElectronTestProfile('bln-ldb-fallback-e2e-');
  let app: ElectronApplication | undefined;
  try {
    const session = await launch(profile, 'throw', true);
    app = session.app;
    const { page } = session;
    await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#settings-section-api-keys')).toBeVisible();
    await expect(page.locator('#ldb-bridge-enabled')).not.toBeChecked();
    await expect(page.locator('#ldb-bridge-status')).toContainText('확장 연결 사용을 켜면');
    expect((await lifecycle(app)).prompts.length).toBe(1);
    expect((await lifecycle(app)).ports).toEqual([]);
  } finally {
    await closeElectronTestSession(app, profile);
  }
});
