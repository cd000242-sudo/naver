import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-ftc-checkbox-');
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist/main.js')],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...profile.env },
  });
  page = await waitForMainWindow(app);
  await expect(page.locator('#unified-stop-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
  await page.locator('.tab-button[data-tab="unified"]').focus();
  await page.keyboard.press('Enter');
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('manual FTC selection updates the panel and survives preset changes', async () => {
  const checkbox = page.locator('#unified-ftc-disclosure');
  const panel = page.locator('#ftc-options-panel');
  await page.locator('.content-mode-btn[data-mode="seo"]').click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.locator('..').click();
  await expect(checkbox).toBeChecked();
  await expect(panel).toBeVisible();
  await expect(page.locator('#ftc-status-badge')).toBeVisible();
  await page.locator('#unified-ftc-preset').selectOption('custom');
  await page.locator('#unified-ftc-text').fill('사용자가 직접 입력한 광고 고지 문구');
  await expect(checkbox).toBeChecked();
  await expect(page.locator('#continuous-ftc-disclosure')).toBeChecked();
  await expect(page.locator('#ma-ftc-disclosure')).toBeChecked();
  await checkbox.uncheck();
  await expect(panel).toBeHidden();
  await expect(page.locator('#ftc-status-badge')).toBeHidden();
  await page.locator('#open-category-modal-btn').click();
  await page.locator('input[name="category-radio"][value="shopping_review"]').check();
  await page.locator('#confirm-category-modal').click();
  await page.locator('.content-mode-btn[data-mode="affiliate"]').click();
  await expect(checkbox).toBeChecked();
  await expect(page.locator('#unified-ftc-text')).toHaveValue('사용자가 직접 입력한 광고 고지 문구');
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('ftcDisclosureEnabled'))).toBe('false');
});
