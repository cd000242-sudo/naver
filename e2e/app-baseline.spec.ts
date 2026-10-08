/**
 * [Phase 2/v2.10.139] Baseline E2E — Electron 앱이 정상 launch되고 main window 표시되는지 검증.
 *
 * 이 테스트가 통과하면:
 *   - dist/main.js 빌드 정상
 *   - Electron main process 시작 정상
 *   - BrowserWindow 생성 정상
 *   - public/index.html 로드 정상
 *
 * god file 분해 시 위 4가지가 깨지면 *즉시* 이 테스트가 실패 → 회귀 자동 감지.
 *
 * 주의: 라이선스/네트워크 검증이 있는 환경에서는 추가 mock 필요할 수 있음.
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import {
  closeElectronTestSession,
  createElectronTestProfile,
  type ElectronTestProfile,
  waitForMainWindow,
} from './electronTestUtils';

let app: ElectronApplication;
let mainWindow: Page;
let testProfile: ElectronTestProfile;

test.beforeAll(async () => {
  testProfile = await createElectronTestProfile('bln-baseline-e2e-');
  const mainPath = path.join(__dirname, '..', 'dist', 'main.js');
  app = await electron.launch({
    args: [mainPath],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: {
      ...process.env,
      ...testProfile.env,
    },
  });
  mainWindow = await waitForMainWindow(app);
});

test.afterAll(async () => {
  await closeElectronTestSession(app, testProfile);
});

test('main window 생성됨', async () => {
  expect(mainWindow).toBeTruthy();
  const title = await mainWindow.title();
  expect(title.length).toBeGreaterThan(0);
});

test('body 태그 존재', async () => {
  await expect(mainWindow.locator('body')).toBeVisible();
});

test('환경설정 버튼 존재 (UI 핵심 element)', async () => {
  const settingsBtn = mainWindow.locator('[data-open-settings], #settings-btn, button:has-text("환경설정")').first();
  await expect(settingsBtn).toBeAttached({ timeout: 15_000 });
});

test('생성된 글 영역 존재 (post list)', async () => {
  const postsArea = mainWindow.locator('#posts-list-content, .posts-list, [id*="posts"]').first();
  await expect(postsArea).toBeAttached({ timeout: 15_000 });
});

test('fresh app defaults to semi-auto and keeps an explicit mode through stop/reset UI', async () => {
  const top = mainWindow.locator('#publish-mode-top-select');
  const bottom = mainWindow.locator('#publish-mode-select');
  const publish = mainWindow.locator('#unified-publish-btn');
  await mainWindow.waitForFunction(() => typeof (window as any).syncPublishMode === 'function');
  // Startup deliberately synchronizes after 1s; verify the settled state too.
  await mainWindow.waitForTimeout(1200);
  await expect(top).toHaveValue('semi-auto');
  await expect(bottom).toHaveValue('semi-auto');
  await expect(mainWindow.locator('#generate-manual-btn')).toBeEnabled();
  await expect(publish).toBeDisabled();
  const publicationDisposition = await mainWindow.locator('#unified-publish-mode').inputValue();
  await mainWindow.evaluate(() => {
    for (const [id, value] of [['unified-generated-title', '준비된 원고 제목'], ['unified-generated-content', '직접 입력한 원고 본문입니다.']]) {
      const field = document.getElementById(id) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await expect(publish).toBeEnabled();
  await expect(publish).toContainText('반자동 발행');
  await mainWindow.evaluate(() => { (window as any).showStopButton(); (window as any).hideStopButton(); });
  await expect(top).toHaveValue('semi-auto');
  await expect(mainWindow.locator('#publish-mode-desc')).toContainText('반자동');
  // Changing settings does not click any generation or publication command.
  await top.selectOption('full-auto');
  await mainWindow.evaluate(() => { (window as any).showStopButton(); (window as any).hideStopButton(); (window as any).resetAllFields(); });
  await expect(bottom).toHaveValue('full-auto');
  await expect(publish).toContainText('풀오토');
  await top.selectOption('semi-auto');
  await expect(publish).toBeDisabled();
  await expect(mainWindow.locator('#unified-publish-mode')).toHaveValue(publicationDisposition);
  await mainWindow.screenshot({ path: test.info().outputPath('initial-semi-auto.png') });
});

test('console에 치명적 에러 없음 (앱 시작 직후)', async () => {
  const errors: string[] = [];
  mainWindow.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await mainWindow.waitForTimeout(3000);
  const fatalErrors = errors.filter(e =>
    !e.includes('ERR_FILE_NOT_FOUND') &&
    !e.includes('favicon') &&
    !e.includes('DevTools'),
  );
  expect(fatalErrors, `예상 외 에러: ${fatalErrors.join('\n')}`).toHaveLength(0);
});
