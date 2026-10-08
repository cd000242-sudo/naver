/**
 * [2026-10-09] Owner request: "발행 계정관리 보면 계정 추가만 있는데 계정관리가 따로 있으면 좋겠어.
 * 비번이 바뀌는 경우를 대비해야지." Drives the real UI over the real preload/IPC with an isolated profile:
 * add an account, open ⚙️ 계정 관리 from the publish screen, edit 별명 + 블로그 주소, check the row and the
 * #main-account-selector dropdown, keep/clear the saved password, delete it, and open the window from the
 * multi-account tab too. No Naver window is opened and no password is ever typed into Naver.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication; let page: Page; let profile: ElectronTestProfile; let accountId: string;
const apiAccount = (id: string) => page.evaluate(async (wanted) => {
  const result = await (window as any).api.getAllBlogAccounts();
  return (result.accounts || []).find((a: any) => a.id === wanted) ?? null;
}, id);

test.beforeAll(async () => {
  await fs.mkdir(path.join(__dirname, '..', 'tmp'), { recursive: true });
  profile = await createElectronTestProfile('bln-account-manage-e2e-');
  app = await electron.launch({ args: [path.join(__dirname, '..', 'dist', 'main.js')], cwd: path.join(__dirname, '..'), timeout: 60_000, env: { ...process.env, ...profile.env } });
  page = await waitForMainWindow(app);
  await page.waitForFunction(() => typeof (window as any).api?.addBlogAccount === 'function' && typeof (window as any).loadMainAccountList === 'function');
  accountId = await page.evaluate(async () => {
    const result = await (window as any).api.addBlogAccount('E2E 별명', 'e2e_old_blog', 'e2e_naver_id', 'fixture-only', {});
    if (!result.success) throw new Error('fixture account failed');
    await (window as any).loadMainAccountList();
    return result.account.id as string;
  });
});
test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('edit 별명 + 블로그 주소, keep or clear the password, then delete — from the publish screen', async () => {
  test.setTimeout(120_000);
  const selectorOption = page.locator(`#main-account-selector option[value="${accountId}"]`);
  await expect(selectorOption).toHaveText('👤 E2E 별명');
  await page.locator('#main-manage-accounts-btn').click();
  const dialog = page.locator('#account-manage-window');
  await expect(dialog).toBeVisible();
  const row = dialog.locator(`[data-account-id="${accountId}"]`);
  await expect(row).toContainText('E2E 별명');
  await expect(row).toContainText('e2e_naver_id');
  await expect(row).toContainText('blog.naver.com/e2e_old_blog');
  await expect(row.locator('[data-role=status]')).toHaveText('정상');
  await expect(row.getByRole('button', { name: '풀기' })).toHaveCount(0);

  // Edit 별명 and 블로그 주소 (a pasted address); the password field stays blank, so the saved password is kept.
  await row.getByRole('button', { name: '수정', exact: true }).click();
  await expect(dialog.locator('#account-manage-password-note')).toContainText('앱은 비밀번호를 자동으로 입력하지 않습니다.');
  await dialog.locator('#account-manage-name').fill('새 별명');
  await dialog.locator('#account-manage-blog').fill('https://blog.naver.com/E2E_New_Blog');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.locator('#account-manage-notice')).toContainText('저장했습니다');
  await expect(row).toContainText('새 별명');
  await expect(row).toContainText('blog.naver.com/e2e_new_blog');
  await expect(selectorOption).toHaveText('👤 새 별명');
  const saved = await apiAccount(accountId);
  expect(saved).toMatchObject({ name: '새 별명', blogId: 'e2e_new_blog', naverId: 'e2e_naver_id' });
  expect(saved.naverPassword, 'a blank password keeps the saved one').toBeTruthy();
  await page.screenshot({ path: path.join(__dirname, '..', 'tmp', 'account-manage-e2e.png') });

  // The explicit checkbox clears the saved password; the Naver ID stays.
  await row.getByRole('button', { name: '수정', exact: true }).click();
  await dialog.locator('#account-manage-clear-pw').check();
  await expect(dialog.locator('#account-manage-password')).toBeDisabled();
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await expect(dialog.locator('#account-manage-notice')).toContainText('저장했습니다');
  const cleared = await apiAccount(accountId);
  expect(cleared.naverPassword).toBeFalsy();
  expect(cleared.naverId).toBe('e2e_naver_id');

  // Delete asks first; saying no keeps the account, saying yes removes it from the window and the dropdown.
  page.once('dialog', d => { expect(d.message()).toBe('이 계정을 삭제할까요? 발행 기록은 지워지지 않습니다.'); void d.dismiss(); });
  await row.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(row).toBeVisible();
  expect(await apiAccount(accountId)).not.toBeNull();
  page.once('dialog', d => void d.accept());
  await row.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(dialog).toContainText('저장된 계정이 없습니다. [➕ 계정 추가]로 먼저 추가해 주세요.');
  await expect(selectorOption).toHaveCount(0);
  expect(await apiAccount(accountId)).toBeNull();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the multi-account tab has the same button, and × closes the window', async () => {
  await page.locator('#multi-account-tab').click();
  await page.locator('#ma-manage-accounts-inline').click();
  const dialog = page.locator('#account-manage-window');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '⚙️ 계정 관리' })).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(dialog).toHaveCount(0);
});
