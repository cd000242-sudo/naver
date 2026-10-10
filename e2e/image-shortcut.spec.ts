import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

// [2026-10-10] 이미지 바로가기 + 발행 바로가기 배치 시험.
// [2026-10-11] 위쪽 고정 줄: [이미지 바로가기][발행 바로가기][⚙][💰 비용표·추천]. 오른쪽 아래엔 메인 풀오토 이미지 설정.

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

test('the shortcuts sit in the top row left of ⚙ and the cost button, same height, and toasts start below the row', async () => {
  // [2026-10-11 사장님] "버튼 구조가 조화롭지 못하다 — 위쪽(비용표 옆)에 두고 크기도 줄여 달라."
  //   왼쪽부터 [이미지 바로가기][발행 바로가기][⚙][💰 비용표·추천] — 한 줄, 같은 높이, 서로 겹치지 않음.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html'))?.setSize(900, 680);
  });
  await page.locator('.tab-button[data-tab="images"]').focus();
  await page.keyboard.press('Enter');
  const image = page.locator('#image-shortcut-btn');
  const publish = page.locator('#publish-shortcut-btn');
  const gear = page.locator('#admin-gear-btn');
  const cost = page.locator('#reopen-price-info-btn');
  const main = page.locator('#heading-image-setting-btn');
  await expect(main).toBeVisible();
  const [imageBox, publishBox, gearBox, costBox, mainBox] = [await box(image), await box(publish), await box(gear), await box(cost), await box(main)];
  const middle = (b: { y: number; height: number }) => b.y + b.height / 2;

  // 한 줄: 세로 가운데가 비용표 버튼과 2px 안, 높이는 비용표 버튼과 2px 안.
  for (const b of [imageBox, publishBox, gearBox]) expect(Math.abs(middle(b) - middle(costBox))).toBeLessThanOrEqual(2);
  for (const b of [imageBox, publishBox]) expect(Math.abs(b.height - costBox.height)).toBeLessThanOrEqual(2);

  // 왼쪽부터 이미지 → 발행 → ⚙ → 비용표, 서로 겹치지 않고 간격이 고르다(모두 6~10px).
  const gaps = [[imageBox, publishBox], [publishBox, gearBox], [gearBox, costBox]].map(([a, b]) => b.x - (a.x + a.width));
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(6);
    expect(gap).toBeLessThanOrEqual(10);
  }
  for (const [a, b] of [[imageBox, mainBox], [publishBox, mainBox]] as const) expect(overlaps(a, b)).toBe(false);
  await expect(image).toBeInViewport({ ratio: 1 });
  await expect(publish).toBeInViewport({ ratio: 1 });

  // 알림창은 이 줄 아래에서 시작한다(알림창이 줄을 덮지 않는다).
  await page.evaluate(() => (window as any).showToast?.('바로가기 배치 확인용 알림', 'info', 3000));
  const toast = page.locator('#toast-container');
  await expect(toast).toBeVisible();
  expect((await box(toast)).y).toBeGreaterThanOrEqual(costBox.y + costBox.height);

  // 스크롤을 내려도, 탭을 바꿔도 같은 자리에 있다.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.locator('.tab-button[data-tab="analytics"]').focus();
  await page.keyboard.press('Enter');
  await expect(main).toBeHidden();
  // 탭마다 세로 스크롤바 유무가 달라 고정 요소가 몇 px 옆으로 움직일 수 있다 — 3px 안이면 같은 자리.
  for (const [locator, before] of [[image, imageBox], [publish, publishBox]] as const) {
    const after = await box(locator);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  }

  await page.screenshot({ path: path.join(__dirname, '../tmp/image-shortcut-small.png') });
});

// [2026-10-11 사장님] "이미지 바로가기를 누르면 소제목별 이미지 프롬프트 카드 화면으로 오게."
test('with prompt cards the image shortcut opens 이미지 관리 and lands on the card list below the top row', async () => {
  // 소제목 카드가 있는 상태를 화면 요소로만 흉내 낸다(생성·발행 없음).
  await page.evaluate(() => {
    const list = document.getElementById('prompts-container')!;
    list.style.display = 'block';
    if (!list.querySelector('.prompt-item[data-e2e]')) {
      const card = document.createElement('div');
      card.className = 'prompt-item';
      card.dataset.e2e = '1';
      card.style.height = '600px';
      card.textContent = '이미지 프롬프트: 시험 카드';
      list.prepend(card);
    }
  });
  // 이미지 생성 하위 탭에 있다가 다른 탭에서 눌러도 이미지 관리로 돌아온다.
  await page.locator('.tab-button[data-tab="images"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#images-subtab-generate').click();
  await expect(page.locator('#images-subpanel-manage')).toBeHidden();
  await page.locator('.tab-button[data-tab="main"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('#image-shortcut-btn').click();
  await expect(page.locator('#images-subpanel-manage')).toBeVisible();
  const list = page.locator('#prompts-container');
  await expect(list).toBeFocused();
  const listBox = await box(list);
  const costBox = await box(page.locator('#reopen-price-info-btn'));
  // 위쪽 버튼 줄 바로 아래에서 카드 목록이 시작한다.
  expect(listBox.y).toBeGreaterThanOrEqual(costBox.y + costBox.height);
  expect(listBox.y).toBeLessThan(120);
  expect(await page.evaluate(() => (window as any).__imageShortcutPublishClicks)).toBe(0);
});
