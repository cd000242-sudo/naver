import path from 'node:path';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow, type ElectronTestProfile } from './electronTestUtils';

// [2026-10-11 사장님] "환경 설정 버튼이 찌그러졌다 — 안쪽 스크롤 없이 스크롤 따라다니게, 조화롭게 정리."
let app: ElectronApplication;
let page: Page;
let profile: ElectronTestProfile;

test.beforeAll(async () => {
  profile = await createElectronTestProfile('bln-right-toolbar-');
  app = await electron.launch({ args: [path.join(__dirname, '..', 'dist/main.js')], cwd: path.join(__dirname, '..'), env: { ...process.env, ...profile.env } });
  page = await waitForMainWindow(app);
  await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
});
test.afterAll(async () => { await closeElectronTestSession(app, profile); });

async function toolbarBoxes() {
  return page.evaluate(() => {
    const bar = document.getElementById('right-floating-buttons')!;
    const items = Array.from(bar.children).filter((el) => (el as HTMLElement).offsetParent !== null && el.classList.contains('floating-btn'))
      .map((el) => { const r = el.getBoundingClientRect(); return { id: el.id, x: r.x, y: r.y, width: r.width, height: r.height }; });
    const r = bar.getBoundingClientRect();
    return { items, bar: { x: r.x, y: r.y, width: r.width, height: r.height, scrollHeight: bar.scrollHeight, clientHeight: bar.clientHeight } };
  });
}

test('every toolbar button has the same size, nothing is squeezed, and there is no inner scroll box', async () => {
  for (const size of [[1280, 860], [900, 680]] as const) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => {
      BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('index.html'))?.setSize(w, h);
    }, size);
    await page.locator('.tab-button[data-tab="images"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const { items, bar } = await toolbarBoxes();
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const item of items) {
      expect(Math.abs(item.height - 36), item.id).toBeLessThanOrEqual(1);
      expect(Math.abs(item.width - items[0].width), item.id).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < items.length; i += 1) expect(items[i].y - (items[i - 1].y + items[i - 1].height)).toBeGreaterThanOrEqual(4);
    expect(bar.scrollHeight).toBeLessThanOrEqual(bar.clientHeight + 1);
    // 위쪽 바로가기 줄 아래에서 시작하고, 오른쪽 끝은 그 줄과 맞는다.
    const cost = (await page.locator('#reopen-price-info-btn').boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(cost.y + cost.height);
    expect(Math.abs((bar.x + bar.width) - (cost.x + cost.width))).toBeLessThanOrEqual(2);
    // 아래 메인 풀오토 이미지 설정 버튼과 겹치지 않는다.
    const main = (await page.locator('#heading-image-setting-btn').boundingBox())!;
    expect(items[items.length - 1].y + items[items.length - 1].height).toBeLessThan(main.y);
    // 스크롤해도 같은 자리.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const after = await toolbarBoxes();
    expect(Math.abs(after.bar.y - bar.y)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: path.join(__dirname, '../tmp/right-toolbar.png') });
});
