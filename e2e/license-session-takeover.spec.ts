import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow } from './electronTestUtils';

const ROOT = path.resolve(__dirname, '..');
const PROOF_DIR = path.resolve(ROOT, '..', 'release-324-publish');
const FIXTURE_USER = 'session_takeover_fixture';
const FIXTURE_PASSWORD = 'fixture-only-not-a-real-password';
const FIXTURE_CODE = 'FIXTURE-SESSION-TAKEOVER-ONLY';
const OLD_DEVICE = 'fixture-prior-device';
const OLD_TOKEN = 'fixture-prior-session-token';
const NEW_TOKEN = 'fixture-new-session-token';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// The HTTP fixture is the only substituted boundary: UI, isolated preload,
// registered IPC handler, license manager, and persisted license are production code.
test('real login preload and IPC require explicit consent before moving the fixture session to this device', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const profile = await createElectronTestProfile('bln-session-takeover-e2e-');
  let app: ElectronApplication | undefined;
  const normalResponse = gate();
  const takeoverResponse = gate();
  const requests: Record<string, unknown>[] = [];
  const fixtureErrors: string[] = [];
  let currentDeviceId = '';
  const server = http.createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'POST' && request.url === '/license' && body.action === 'free-ping'
        && body.appId === 'com.betterlife.naver' && body.platform === 'NAVER'
        && Object.keys(body).sort().join(',') === 'action,appId,appVersion,deviceId,platform,timestamp') {
        // Real startup reports this isolated installation before login. Accept
        // only the device generated in this test profile; never create a session.
        const fixtureDeviceId = await fs.readFile(path.join(profile.env.E2E_USER_DATA_DIR!, 'license', 'device.id'), 'utf8');
        if (body.deviceId === fixtureDeviceId.trim()) {
          response.end(JSON.stringify({ ok: true }));
          return;
        }
      }
      // E2E main startup exposes an expiry-less synthetic badge, whose real
      // renderer asks license:revalidate to refresh the stored license. Keep
      // that independent read valid only for this fixture's old/current device;
      // it must never issue, replace, or revoke either fixture session token.
      const knownFixtureLicense = (body.code === FIXTURE_CODE && body.deviceId === OLD_DEVICE)
        || (body.code === undefined && currentDeviceId !== '' && body.deviceId === currentDeviceId);
      if (request.method === 'POST' && request.url === '/license'
        && body.action === 'verify' && knownFixtureLicense) {
        response.end(JSON.stringify({ ok: true, valid: true, expiresAt: '2099-12-31T23:59:59.000Z' }));
        return;
      }
      if (request.method !== 'POST' || request.url !== '/license'
        || body.action !== 'verify-credentials'
        || body.userId !== FIXTURE_USER || body.userPassword !== FIXTURE_PASSWORD) {
        const action = typeof body.action === 'string' && /^[a-z-]{1,50}$/.test(body.action) ? body.action : '(unrecognized action)';
        const keys = Object.keys(body).map(key => /^[a-zA-Z][a-zA-Z0-9_]{0,50}$/.test(key) ? key : '(unrecognized key)').sort();
        fixtureErrors.push(`Unexpected fixture request: action=${action}; keys=${keys.join(',')}`);
        // An unknown test route is a transport error, not an authoritative
        // invalid-license verdict that would make revalidateLicense clear disk.
        response.statusCode = 400;
        response.end(JSON.stringify({ ok: false, valid: false, code: 'FIXTURE_REQUEST_REJECTED' }));
        return;
      }
      requests.push(body);
      if (body.takeoverSession === true) {
        await takeoverResponse.promise;
        response.end(JSON.stringify({
          ok: true, valid: true, sessionToken: NEW_TOKEN, previousSessionTerminated: true,
          licenseType: 'premium', expiresAt: '2099-12-31T23:59:59.000Z', phoneVerified: true,
        }));
      } else {
        await normalResponse.promise;
        response.end(JSON.stringify({
          ok: false, valid: false, code: 'ALREADY_LOGGED_IN', takeoverAvailable: true,
          message: '다른 기기에서 이미 로그인 중입니다. 기존 접속을 종료한 후 로그인하세요.',
        }));
      }
    })().catch(() => {
      fixtureErrors.push('Invalid fixture request');
      if (!response.headersSent) response.writeHead(400);
      response.end(JSON.stringify({ ok: false, valid: false }));
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Loopback fixture did not bind');
    const fixtureOrigin = `http://127.0.0.1:${address.port}`;
    const serverUrl = `${fixtureOrigin}/license`;
    const userData = profile.env.E2E_USER_DATA_DIR!;
    const licenseFile = path.join(userData, 'license', 'license.json');
    const bootstrap = path.join(profile.root, 'session-takeover-main.cjs');
    await fs.writeFile(bootstrap, `
      const root = ${JSON.stringify(ROOT)};
      const fixtureOrigin = ${JSON.stringify(fixtureOrigin)};
      const electron = require('electron');
      const nodeRequire = require('node:module').createRequire(root + '/package.json');
      electron.app.setAppPath(root);

      // No production HTTP, including startup checks or renderer resources.
      const allowed = input => {
        try { return new URL(typeof input === 'string' ? input : input.url || input.href).origin === fixtureOrigin; }
        catch { return false; }
      };
      const nativeFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, init) => {
        if (!allowed(input)) return Promise.reject(new Error('External HTTP disabled by isolated login E2E'));
        return nativeFetch(input, init);
      };
      for (const scheme of ['http', 'https']) {
        const module = nodeRequire('node:' + scheme);
        for (const method of ['request', 'get']) {
          const original = module[method];
          module[method] = function(input, ...args) {
            let url = input;
            if (input && typeof input === 'object' && !input.href) {
              const parsed = new URL((input.protocol || scheme + ':') + '//' + (input.hostname || input.host || 'localhost'));
              if (input.port) parsed.port = String(input.port);
              url = parsed.href;
            }
            if (!allowed(url)) throw new Error('External HTTP disabled by isolated login E2E');
            return original.call(this, input, ...args);
          };
        }
      }
      electron.app.on('web-contents-created', (_event, contents) => {
        contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
          callback({ cancel: !allowed(details.url) });
        });
      });
      electron.shell.openExternal = async () => { throw new Error('External navigation disabled by isolated login E2E'); };

      // Observe only sanitized results; the registered production listener still runs.
      globalThis.__sessionTakeoverProbe = { results: [], completed: 0 };
      const originalHandle = electron.ipcMain.handle.bind(electron.ipcMain);
      electron.ipcMain.handle = (channel, listener) => {
        if (channel !== 'license:verifyWithCredentials' && channel !== 'login:success') return originalHandle(channel, listener);
        return originalHandle(channel, async (...args) => {
          const result = await listener(...args);
          if (channel === 'login:success') globalThis.__sessionTakeoverProbe.completed += 1;
          else globalThis.__sessionTakeoverProbe.results.push({
            valid: result.valid, code: result.code, takeoverAvailable: result.takeoverAvailable,
            previousSessionTerminated: result.previousSessionTerminated,
          });
          return result;
        });
      };
      nodeRequire(root + '/dist/main.js');
    `, 'utf8');

    app = await electron.launch({
      args: [bootstrap], cwd: ROOT, timeout: 60_000,
      env: { ...process.env, ...profile.env, LICENSE_SERVER_URL: serverUrl },
    });
    await waitForMainWindow(app);
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(userData);
    await fs.mkdir(path.dirname(licenseFile), { recursive: true });
    await fs.writeFile(licenseFile, JSON.stringify({
      isValid: true, licenseType: 'premium', authMethod: 'credentials', userId: FIXTURE_USER,
      licenseCode: FIXTURE_CODE, sessionToken: OLD_TOKEN, deviceId: OLD_DEVICE, phoneVerified: true,
      verifiedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2099-12-31T23:59:59.000Z',
    }), 'utf8');
    const newWindow = app.waitForEvent('window');
    await app.evaluate(async ({ BrowserWindow }, root) => {
      const login = new BrowserWindow({
        width: 500, height: 650, resizable: false, show: true, frame: true, center: true,
        title: '라이선스 인증',
        webPreferences: {
          nodeIntegration: false, contextIsolation: true, sandbox: true,
          preload: root + '/dist/preloadLogin.js', webSecurity: true, devTools: true,
        },
      });
      await login.loadFile(root + '/public/login.html');
    }, ROOT);
    const login = await newWindow;
    await login.waitForLoadState('domcontentloaded');
    const consoleMessages: string[] = [];
    login.on('console', message => consoleMessages.push(message.text()));
    await expect(login.locator('#app-version-display')).toHaveText(/^v\d/);
    expect(await login.evaluate(() => typeof (window as any).require)).toBe('undefined');
    const deviceId: string = await login.evaluate(() => (window as any).electronAPI.invoke('license:getDeviceId'));
    currentDeviceId = deviceId;
    expect(deviceId.length).toBeGreaterThanOrEqual(16);
    expect(await fs.readFile(path.join(userData, 'license', 'device.id'), 'utf8')).toBe(deviceId);
    await login.locator('#user-id').fill(FIXTURE_USER);
    await login.locator('#password').fill(FIXTURE_PASSWORD);
    await expect(login.locator('#session-takeover')).toBeHidden();

    await login.locator('#login-button').click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(login.locator('#login-button')).toBeDisabled();
    await login.locator('#login-form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    normalResponse.release();
    await expect(login.locator('#session-takeover')).toBeVisible();
    await expect(login.locator('#session-takeover-button')).toHaveText('다른 기기 접속 해제하고 로그인');
    await expect(login.locator('#session-takeover-button')).toBeInViewport({ ratio: 1 });
    await expect(login.locator('#session-takeover-description')).toContainText('다른 기기의 로그인 권한이 종료');
    await expect(login.locator('#access-denied-modal-backdrop')).toBeHidden();
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty('takeoverSession');
    expect(requests[0].deviceId).toBe(deviceId);
    expect(JSON.parse(await fs.readFile(licenseFile, 'utf8')).sessionToken).toBe(OLD_TOKEN);
    expect(await app.evaluate(() => (globalThis as any).__sessionTakeoverProbe.results)).toMatchObject([
      { valid: false, code: 'ALREADY_LOGGED_IN', takeoverAvailable: true },
    ]);
    await fs.mkdir(PROOF_DIR, { recursive: true });
    const conflictScreenshot = path.join(PROOF_DIR, 'login-session-conflict.png');
    await login.screenshot({ path: conflictScreenshot, fullPage: true });
    await testInfo.attach('manual-session-takeover-offer', { path: conflictScreenshot, contentType: 'image/png' });

    await login.locator('#session-takeover-button').click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(login.locator('#login-button')).toBeDisabled();
    await login.evaluate(() => {
      const button = document.getElementById('session-takeover-button') as HTMLButtonElement;
      button.click();
      button.click();
      (document.getElementById('login-form') as HTMLFormElement).requestSubmit();
    });
    takeoverResponse.release();
    await expect(login.getByText('축하합니다 인증되셨습니다!^^', { exact: false })).toBeVisible();
    await expect(login.locator('#error-message')).toBeHidden();
    await expect(login.locator('#session-takeover')).toBeHidden();
    expect(requests).toHaveLength(2);
    expect(requests.filter(request => request.takeoverSession === true)).toHaveLength(1);
    expect(requests[1]).toMatchObject({
      action: 'verify-credentials', userId: FIXTURE_USER, userPassword: FIXTURE_PASSWORD,
      deviceId, takeoverSession: true,
    });
    expect(JSON.parse(await fs.readFile(licenseFile, 'utf8'))).toMatchObject({
      isValid: true, userId: FIXTURE_USER, sessionToken: NEW_TOKEN, deviceId,
      phoneVerified: true, licenseType: 'premium', authMethod: 'credentials',
    });
    const successScreenshot = path.join(PROOF_DIR, 'login-session-success.png');
    await login.screenshot({ path: successScreenshot, fullPage: true });
    await testInfo.attach('session-takeover-success', { path: successScreenshot, contentType: 'image/png' });
    const closed = login.waitForEvent('close', { timeout: 15_000 });
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__sessionTakeoverProbe.completed), { timeout: 15_000 }).toBe(1);
    await closed;
    expect(requests).toHaveLength(2);
    expect(fixtureErrors).toEqual([]);
    expect(consoleMessages.join('\n')).not.toContain(FIXTURE_PASSWORD);
    expect(consoleMessages.join('\n')).not.toContain(NEW_TOKEN);
  } finally {
    normalResponse.release();
    takeoverResponse.release();
    try {
      await closeElectronTestSession(app, profile);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});
