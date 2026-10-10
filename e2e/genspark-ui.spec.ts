/**
 * [2026-10-10] 젠스파크 화면 e2e — 작성만(실행은 사장님). 젠스파크에는 접속하지 않고 화면 요소만 확인한다.
 * 엔진 select 에 젠스파크가 있고(기본 선택 아님), 선택하면 관리 탭 행·모델 15개가 보이며,
 * 크레딧 차감 모델을 고르면 확인창이 뜨고 거절하면 이전 값으로 돌아간다.
 */
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

let app: ElectronApplication; let page: Page; let profile: ElectronTestProfile;

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-genspark-ui-e2e-');
  app = await electron.launch({ args: [path.join(__dirname, '..', 'dist', 'main.js')], cwd: path.join(__dirname, '..'), timeout: 60_000, env: { ...process.env, ...profile.env } });
  page = await waitForMainWindow(app);
});
test.afterAll(async () => { await closeElectronTestSession(app, profile); });

test('엔진 select 에 젠스파크, 관리 탭 행·모델 15개, 크레딧 모델은 확인창', async () => {
  test.setTimeout(120_000);
  // 엔진 선택 칸은 "이미지 생성·관리" 탭 안에 있다 — 먼저 그 탭으로 간다(다른 e2e 처럼 키보드로 탭 전환).
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
  // [2026-10-10] 게시글 버튼 준비 표시는 탭 전환(initTabSwitching)보다 먼저 찍힌다 — 바쁜 PC(릴리즈 게이트)에선
  //   탭 기능이 붙기 전에 Enter 가 눌려 무반응이었다. 탭이 실제로 바뀔 때까지 다시 누른다.
  const imagesTab = page.locator('.tab-button[data-tab="images"]');
  await expect(async () => {
    await imagesTab.focus();
    await page.keyboard.press('Enter');
    await expect(imagesTab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  const select = page.locator('#image-source-select');
  await expect(select.locator('option[value="genspark"]')).toHaveCount(1);
  expect(await select.inputValue()).not.toBe('genspark');

  await select.selectOption('genspark');
  await expect(page.locator('#mgmt-genspark-row')).toBeVisible();
  const model = page.locator('#mgmt-genspark-model');
  await expect(model.locator('option')).toHaveCount(15);

  const creditValue = await model.evaluate((el) => {
    const opt = Array.from((el as HTMLSelectElement).options).find((o) => (o.textContent || '').endsWith('(크레딧 차감)'));
    return opt ? opt.value : '';
  });
  expect(creditValue).not.toBe('');

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  const before = await model.inputValue();
  await model.selectOption(creditValue);
  expect(dialogMessage).toContain('크레딧');
  expect(await model.inputValue()).toBe(before);
});
