import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, _electron as electron } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow } from './electronTestUtils';

test('desktop daily publishing uses real preload IPC without enabling the extension bridge or creating plans', async () => {
  test.setTimeout(90_000);
  const profile = await createElectronTestProfile('bln-daily-panel-e2e-');
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'daily-panel-main.cjs');
  const capture = path.join(profile.root, 'must-not-publish.ndjson');
  try {
    await fs.writeFile(bootstrap, `
      const root = ${JSON.stringify(root)};
      const electron = require('electron');
      electron.app.setAppPath(root);
      const nodeRequire = require('node:module').createRequire(root + '/package.json');
      const axios = nodeRequire('axios').default;
      axios.defaults.adapter = async () => { throw Error('External HTTP disabled for isolated daily panel test'); };
      globalThis.__dailyPanelBridgeStarts = 0;
      const http = nodeRequire('node:http');
      const listen = http.Server.prototype.listen;
      http.Server.prototype.listen = function (...args) {
        if (args[0] === 47630 && args[1] === '127.0.0.1') {
          globalThis.__dailyPanelBridgeStarts++;
          args[0] = 0;
        }
        return listen.apply(this, args);
      };
      nodeRequire(root + '/dist/main.js');
    `, 'utf8');
    app = await electron.launch({ args: [bootstrap], cwd: root, timeout: 60_000,
      env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture } });
    const page = await waitForMainWindow(app);
    page.on('dialog', dialog => { void dialog.dismiss(); });
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile.env.E2E_USER_DATA_DIR);
    await page.waitForFunction(() => typeof (window as any).api?.dailyPublishingRequest === 'function');
    await expect(page.locator('#open-daily-publishing')).toHaveAttribute('data-bound', 'true');
    await page.locator('#open-daily-publishing').click();
    const panel = page.locator('#daily-publishing-dialog');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-daily=checked]')).toContainText('상태 확인');
    await expect(panel.locator('[data-daily=plan-status]')).toContainText('중지 상태');
    await expect(panel.locator('[data-daily=start]')).toBeDisabled();
    await expect(panel.locator('[data-daily=stop]')).toBeDisabled();
    const before = await page.evaluate(() => (window as any).api.dailyPublishingRequest('GET', '/v1/automations/status'));
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ ok: true, plans: [], runs: [], imageCapabilities: { officialCaptureReady: false } });
    const invalid = await page.evaluate(() => (window as any).api.dailyPublishingRequest('POST', '/v1/automations/execute', { command: 'not-executable' }));
    expect(invalid).toMatchObject({ status: 400, body: { ok: false } });
    const invalidGet = await page.evaluate(() => (window as any).api.dailyPublishingRequest('GET', '/v1/automations/status', { enabled: true }));
    expect(invalidGet).toMatchObject({ status: 400, body: { ok: false } });
    const after = await page.evaluate(() => (window as any).api.dailyPublishingRequest('GET', '/v1/automations/status'));
    expect(after.body.plans).toEqual([]); expect(after.body.runs).toEqual([]);
    expect(after.body.revision).toBe(before.body.revision);
    expect(await app.evaluate(() => (globalThis as any).__dailyPanelBridgeStarts)).toBe(0);
    expect(await fs.readFile(capture, 'utf8').catch(() => '')).toBe('');
    await fs.mkdir(path.join(root, 'session-work', 'daily-publishing-panel'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'session-work', 'daily-publishing-panel', 'electron-real-ipc.png') });
    await panel.locator('[data-daily=close]').click();
    await expect(panel).toBeHidden();
  } finally { await closeElectronTestSession(app, profile); }
});
