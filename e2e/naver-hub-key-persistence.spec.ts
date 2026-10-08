/**
 * [2026-10-09] Owner report (repeated): "네이버 허브키 저장해도 자동업데이트하고 나면 필드 초기화".
 * The owner's userData (v2.11.335) had no naverHub* field at all, in any settings file or backup, so the key
 * never reached disk. This drives the real UI: open settings → API keys tab → type the HUB key → [API 키 저장],
 * then restarts the app and simulates an update (.last-version bump) and checks the field is still filled.
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  closeElectronApp,
  closeElectronTestSession,
  createElectronTestProfile,
  type ElectronTestProfile,
  waitForMainWindow,
} from './electronTestUtils';

const HUB_ID = 'hube2eclientid0001';
const HUB_SECRET = 'hube2esecret0001';

let testProfile: ElectronTestProfile;
let app: ElectronApplication | undefined;

async function launch(): Promise<Page> {
  const mainPath = path.join(__dirname, '..', 'dist', 'main.js');
  app = await electron.launch({
    args: [mainPath],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: { ...process.env, ...testProfile.env },
  });
  return waitForMainWindow(app);
}

async function openApiKeys(page: Page): Promise<void> {
  await page.locator('#settings-button-fixed').click();
  await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 15_000 });
  await page.locator('#nav-api-keys-btn').click();
  await expect(page.locator('#naver-hub-client-id')).toBeVisible({ timeout: 15_000 });
}

/** Field names that appear in any JSON file under userData (values are never read into the report). */
async function settingsFieldsOnDisk(): Promise<Record<string, string[]>> {
  const root = path.join(testProfile.root, 'userdata');
  const found: Record<string, string[]> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!/^settings.*\.json$/i.test(entry.name)) continue;
      // The app may be mid-write (atomic temp+rename elsewhere, plain writes here): a half-written file is "not yet",
      // so the poll reads it again instead of failing the run.
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(await fs.readFile(full, 'utf8')) as Record<string, unknown>; } catch { continue; }
      found[path.relative(root, full)] = Object.keys(parsed).filter((key) => /hub/i.test(key) && String(parsed[key] ?? '').length > 0);
    }
  };
  await walk(root);
  return found;
}

test.beforeAll(async () => {
  testProfile = await createElectronTestProfile('bln-hub-key-e2e-');
});

test.afterAll(async () => {
  await closeElectronTestSession(app, testProfile);
});

test('HUB key typed in settings survives save, restart and an update', async () => {
  test.setTimeout(240_000);
  let page = await launch();
  await openApiKeys(page);
  await page.locator('#naver-hub-client-id').fill(HUB_ID);
  await page.locator('#naver-hub-client-secret').fill(HUB_SECRET);
  await page.locator('#api-keys-save-btn').click();

  // The save is asynchronous; poll the files on disk.
  await expect.poll(async () => {
    const files = await settingsFieldsOnDisk();
    return Object.values(files).some((keys) => keys.includes('naverHubClientId') && keys.includes('naverHubClientSecret'));
  }, { timeout: 20_000, message: 'HUB fields must be written to a settings file' }).toBe(true);

  await closeElectronApp(app);
  page = await launch();
  await openApiKeys(page);
  await expect(page.locator('#naver-hub-client-id')).toHaveValue(HUB_ID, { timeout: 15_000 });

  // An auto-update is a start with a different .last-version (the wipe-and-restore path runs then).
  await closeElectronApp(app);
  await fs.writeFile(path.join(testProfile.root, 'userdata', '.last-version'), '2.11.300', 'utf8');
  page = await launch();
  await openApiKeys(page);
  await expect(page.locator('#naver-hub-client-id')).toHaveValue(HUB_ID, { timeout: 15_000 });
  const secretFilled = await page.locator('#naver-hub-client-secret').evaluate((el) => {
    const input = el as HTMLInputElement;
    return (input.value || input.dataset.realValue || '').length > 0;
  });
  expect(secretFilled).toBe(true);
});
