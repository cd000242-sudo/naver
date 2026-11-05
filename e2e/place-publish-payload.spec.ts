/**
 * [2026-11-05] 사장님: "장소넣기해도 풀오토발행이든 반자동발행이든 장소가 안 들어가."
 *
 * Walks the real UI (flow card -> photo tab -> place checkbox -> search -> pick a result) and
 * presses the semi-auto publish button. The publish IPC is intercepted by E2E_PUBLISH_CAPTURE_FILE,
 * so nothing reaches NAVER. The place search IPC returns a fixture so no API key is needed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
let capture: string;

const PLACE = { name: '근포땅굴', address: '경상남도 거제시 남부면 저구리 산 32', category: '관광명소' };

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-place-payload-');
  capture = path.join(profile.root, 'publish.ndjson');
  const root = path.join(__dirname, '..');
  const bootstrap = path.join(profile.root, 'place-main.cjs');
  await fs.writeFile(bootstrap, `
    const electron = require('electron');
    const root = ${JSON.stringify(root)};
    electron.app.setAppPath(root);
    const fixture = ${JSON.stringify(PLACE)};
    const handle = electron.ipcMain.handle.bind(electron.ipcMain);
    electron.ipcMain.handle = (channel, listener) => handle(channel, channel === 'place:search'
      ? async () => ({ success: true, items: [{ ...fixture, roadAddress: fixture.address, telephone: '', link: '' }] })
      : listener);
    require(root + '/dist/main.js');
  `);
  app = await electron.launch({
    args: [bootstrap], cwd: root,
    env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture },
  });
  page = await waitForMainWindow(app);
  page.on('dialog', (dialog) => { void dialog.dismiss(); });
  await page.waitForFunction(() => typeof (window as any).updatePublishButtonVisibility === 'function');
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

async function pickPlaceThroughUi(): Promise<void> {
  await page.locator('button.publish-flow-card[data-flow="app"]').click();
  await page.locator('#tab-image-btn').click();
  const enabled = page.locator('#image-narrative-place-enabled');
  await enabled.scrollIntoViewIfNeeded();
  await enabled.check();
  await page.locator('#image-narrative-place-query').fill(PLACE.name);
  await page.locator('#image-narrative-place-search-btn').click();
  await page.locator('#image-narrative-place-results button[data-place-index="0"]').click();
  await expect(page.locator('#image-narrative-place-selected')).toContainText(PLACE.name);
}

test('a place picked in the photo tab reaches the semi-auto publish payload', async () => {
  await pickPlaceThroughUi();
  expect(await page.evaluate(() => (window as any).readPickedPlaces?.())).toEqual([
    { name: PLACE.name, address: PLACE.address, position: 'auto' },
  ]);

  await page.evaluate(() => {
    for (const [id, value] of [['unified-generated-title', '거제 근포땅굴 다녀온 날'],
      ['unified-generated-content', '근포땅굴은 바다 쪽으로 뚫린 굴입니다.']]) {
      const field = document.getElementById(id) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    (document.getElementById('naver-id') as HTMLInputElement).value = 'e2e-runtime';
    (document.getElementById('unified-publish-mode') as HTMLInputElement).value = 'draft';
    const skipImages = document.getElementById('unified-skip-images') as HTMLInputElement | null;
    if (skipImages) skipImages.checked = true;
  });
  const publish = page.locator('#unified-publish-btn');
  await expect(publish).toBeEnabled();
  await publish.evaluate((button: HTMLButtonElement) => button.click());

  await expect.poll(async () => (await fs.readFile(capture, 'utf8').catch(() => '')).trim(), { timeout: 45_000 }).not.toBe('');
  const records = (await fs.readFile(capture, 'utf8')).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const payload = records[records.length - 1].payload;
  expect(payload.places).toEqual([{ name: PLACE.name, address: PLACE.address, position: 'auto' }]);
  expect(payload.placeName).toBe(PLACE.name);
});
