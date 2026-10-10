import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

// [2026-10-10] 이미지 바로가기 + 발행 바로가기 배치 시험.
// 아래에서 위로: 메인 풀오토 이미지 설정(#heading-image-setting-btn) → 발행 바로가기 → 이미지 바로가기.

let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;
let capture: string;

const TABS = ['main', 'unified', 'post-list', 'images', 'image-tools', 'analytics'];

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-image-shortcut-');
  capture = path.join(profile.root, 'publish.ndjson');
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist/main.js')],
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: capture },
  });
  page = await waitForMainWindow(app);
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 바로가기가 발행 버튼을 누르면 앱 핸들러에 닿기 전에 잡아서 센다.
  await page.evaluate(() => {
    (window as any).__imageShortcutPublishClicks = 0;
    document.getElementById('unified-publish-btn')!.addEventListener('click', event => {
      (window as any).__imageShortcutPublishClicks++;
      event.stopImmediatePropagation();
    }, true);
  });
});

test.afterAll(async () => { await closeElectronTestSession(app, profile); });

async function expectAtImagesTab() {
  await expect(page.locator('.tab-button[data-tab="images"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-images')).toBeVisible();
  await expect(page.locator('#tab-images')).toBeFocused();
  // 패널 맨 위가 화면 안에 들어와 있다.
  const top = await page.locator('#tab-images').boundingBox();
  expect(top!.y).toBeLessThan(200);
  expect(await page.evaluate(() => (window as any).__imageShortcutPublishClicks)).toBe(0);
  expect(await fs.readFile(capture, 'utf8').catch(() => '')).toBe('');
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('all six tabs show both shortcuts and the image shortcut opens the images tab', async () => {
  for (const tab of TABS) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator(`.tab-button[data-tab="${tab}"]`).focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const image = page.locator('#image-shortcut-btn');
    await expect(image).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#publish-shortcut-btn')).toBeInViewport({ ratio: 1 });
    await image.click();
    await expectAtImagesTab();
  }
});

test('keyboard Enter and Space on the image shortcut only navigate and never publish', async () => {
  await page.locator('.tab-button[data-tab="main"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#image-shortcut-btn').focus();
  await page.keyboard.press('Enter');
  await expectAtImagesTab();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as any).__imageShortcutPublishClicks)).toBe(0);
});

test('the two shortcuts and the main full-auto button never overlap in a small window', async () => {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'))?.setSize(900, 680);
  });
  // 메인 풀오토 이미지 설정 버튼은 unified·images·image-tools 탭에서만 보인다 — 세 버튼을 함께 비교한다.
  await page.locator('.tab-button[data-tab="images"]').focus();
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const toolbar = document.getElementById('right-floating-buttons')!;
    toolbar.scrollTop = toolbar.scrollHeight;
  });
  const image = page.locator('#image-shortcut-btn');
  const publish = page.locator('#publish-shortcut-btn');
  const main = page.locator('#heading-image-setting-btn');
  await expect(main).toBeVisible();
  const [imageBox, publishBox, mainBox] = [await box(image), await box(publish), await box(main)];

  // 위에서 아래로: 이미지 → 발행 → 메인 풀오토, 서로 겹치지 않고 간격 10~16px.
  // (메인 버튼은 그림자·테두리·화면 배율 때문에 상자가 1~2px 달라질 수 있어 위쪽 한도를 16px 로 둔다 — 10/10 실측 13.9px)
  expect(overlaps(imageBox, publishBox)).toBe(false);
  expect(overlaps(publishBox, mainBox)).toBe(false);
  expect(overlaps(imageBox, mainBox)).toBe(false);
  expect(publishBox.y - (imageBox.y + imageBox.height)).toBeGreaterThanOrEqual(10);
  expect(publishBox.y - (imageBox.y + imageBox.height)).toBeLessThanOrEqual(16);
  expect(mainBox.y - (publishBox.y + publishBox.height)).toBeGreaterThanOrEqual(10);
  expect(mainBox.y - (publishBox.y + publishBox.height)).toBeLessThanOrEqual(16);

  // 오른쪽 끝 정렬과 시니어 크기 기준.
  expect(Math.abs((imageBox.x + imageBox.width) - (mainBox.x + mainBox.width))).toBeLessThanOrEqual(1);
  expect(Math.abs((publishBox.x + publishBox.width) - (mainBox.x + mainBox.width))).toBeLessThanOrEqual(1);
  // 56px(CSS) — 화면 배율 반올림으로 55.99 처럼 재질 수 있어 0.5px 여유.
  expect(imageBox.height).toBeGreaterThanOrEqual(55.5);
  expect(publishBox.height).toBeGreaterThanOrEqual(55.5);
  expect(Math.abs(imageBox.width - publishBox.width)).toBeLessThanOrEqual(1);

  // 위쪽 도구 모음(비용 버튼)과도 겹치지 않는다.
  const cost = await box(page.locator('#reopen-price-info-btn'));
  expect(imageBox.y).toBeGreaterThan(cost.y + cost.height);
  await expect(image).toBeInViewport({ ratio: 1 });
  await expect(publish).toBeInViewport({ ratio: 1 });

  // 메인 풀오토 버튼이 숨는 탭에서도 바로가기 두 개는 같은 자리에 보인다.
  await page.locator('.tab-button[data-tab="analytics"]').focus();
  await page.keyboard.press('Enter');
  await expect(main).toBeHidden();
  const imageAfter = await box(image);
  const publishAfter = await box(publish);
  // 탭마다 세로 스크롤바 유무가 달라 고정 요소가 몇 px 옆으로 움직일 수 있다 — 3px 안이면 같은 자리.
  for (const [after, before] of [[imageAfter, imageBox], [publishAfter, publishBox]] as const) {
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  }

  await page.screenshot({ path: path.join(__dirname, '../tmp/image-shortcut-small.png') });
});
