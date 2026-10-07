import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, _electron as electron } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow } from './electronTestUtils';

// E2E_TEST deliberately skips production login. This covers the real connection
// URI -> renderer settings -> config:set -> HTTP readiness path after fixture auth.
// It does not certify OS protocol registration or production account login.
test('fixed connection URI opens settings and checkbox IPC starts, stops and restarts the isolated bridge', async () => {
  test.setTimeout(90_000);
  const profile = await createElectronTestProfile('bln-ldb-connect-e2e-');
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const capture = path.join(profile.root, 'must-not-publish.ndjson');
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'ldb-connect-main.cjs');
  const fixtureLogin = 'ldb_connect_fixture';
  try {
    await fs.writeFile(bootstrap, `
      const root = ${JSON.stringify(root)};
      const electron = require('electron');
      electron.app.setAppPath(root);
      const nodeRequire = require('node:module').createRequire(root + '/package.json');
      const axios = nodeRequire('axios').default;
      axios.defaults.adapter = async config => {
        if (String(config.url).includes('/category-list')) {
          if (!String(config.url).includes('/${fixtureLogin}/')) throw new Error('Unexpected fixture account');
          return { data: { isSuccess: true, result: { mylogCategoryList: [{ categoryNo: '7', categoryName: '연결 검증', postCnt: 0 }] } }, status: 200, statusText: 'OK', headers: {}, config };
        }
        throw new Error('External HTTP is disabled in the isolated connection test');
      };
      globalThis.__ldbLifecycle = { ports: [], closed: [] };
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
    app = await electron.launch({
      args: [bootstrap, 'better-life-naver://ldb/connect'], cwd: root, timeout: 60_000,
      env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture },
    });
    const page = await waitForMainWindow(app);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { void dialog.dismiss(); });
    const checkbox = page.locator('#ldb-bridge-enabled');
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('#settings-section-api-keys')).toBeVisible();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('#ldb-bridge-status')).toContainText('확장 연결 사용을 켜면');
    expect(await app.evaluate(() => (globalThis as any).__ldbLifecycle.ports)).toEqual([]);
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile.env.E2E_USER_DATA_DIR);

    const accountId = await page.evaluate(async login => {
      // Activate only the isolated fixture identity. Leave bridge enabling to
      // the actual checkbox, rather than bypassing the UI with saveConfig(true).
      const license = await (window as any).api.getLicense();
      const fixtureUser = license?.license?.userId || await (window as any).api.getDeviceId();
    if (!fixtureUser) throw new Error('Isolated license identity missing');
      await (window as any).api.saveConfig({ __userId: fixtureUser });
      const result = await (window as any).api.addBlogAccount('LDB 연결 테스트', '테스트 블로그', login, 'fixture-only-not-a-password', {});
      if (!result.success || !result.account?.id) throw new Error('Fixture account creation failed');
      return result.account.id;
    }, fixtureLogin);
    await checkbox.check();
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__ldbLifecycle.ports.length)).toBe(1);
    const firstPort: number = await app.evaluate(() => (globalThis as any).__ldbLifecycle.ports[0]);
    expect(firstPort).toBeGreaterThan(0); expect(firstPort).not.toBe(47630);
    // Token IPC is called only AFTER listen; it cannot mask a missing checkbox
    // -> config:set callback by being the operation that starts the server.
    const credentials = await page.evaluate(() => (window as any).api.getLdbBridgeToken());
    expect(credentials.ok).toBe(true);
    const version = await app.evaluate(({ app }) => app.getVersion());
    const read = async (port: number, route: string) => {
      expect(port).not.toBe(47630);
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        headers: { origin: 'chrome-extension://' + 'a'.repeat(32), authorization: `Bearer ${credentials.token}` },
        signal: AbortSignal.timeout(5_000),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    const status = await read(firstPort, '/v1/status');
    expect(status).toMatchObject({ ok: true, ready: true, auth: 'ready', version });
    expect(status).not.toHaveProperty('token');
    const accounts = await read(firstPort, '/v1/accounts');
    expect(accounts.accounts.map((value: any) => value.id)).toEqual([accountId]);
    expect(JSON.stringify(accounts)).not.toContain(fixtureLogin);

    await checkbox.uncheck();
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__ldbLifecycle.closed)).toContain(firstPort);
    await expect(fetch(`http://127.0.0.1:${firstPort}/v1/status`, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
    await checkbox.check();
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__ldbLifecycle.ports.length)).toBe(2);
    const secondPort: number = await app.evaluate(() => (globalThis as any).__ldbLifecycle.ports[1]);
    expect(secondPort).toBeGreaterThan(0); expect(secondPort).not.toBe(47630);
    expect(await read(secondPort, '/v1/status')).toMatchObject({ ready: true, version });
    expect((await read(secondPort, '/v1/accounts')).accounts.map((value: any) => value.id)).toEqual([accountId]);
    expect(await fs.stat(capture).then(() => true, () => false)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await closeElectronTestSession(app, profile);
  }
});
