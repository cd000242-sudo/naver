import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import ts from 'typescript';
import assert from 'node:assert/strict';

const root = process.cwd();
const output = path.join(root, 'session-work', 'daily-publishing-panel');
await mkdir(output, { recursive: true });
const source = await readFile(path.join(root, 'src/renderer/modules/dailyPublishingPanel.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const styles = [];
for (const file of ['styles.css', 'floating-buttons.css', 'thumbnail-studio.css', 'daily-publishing.css']) {
  styles.push(await readFile(path.join(root, 'public', file), 'utf8'));
}
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const [label, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body style="margin:0;background:#eceff1;font-family:Arial,sans-serif"><dialog aria-label="매일 예약발행"></dialog></body></html>');
    for (const content of styles) await page.addStyleTag({ content });
    await page.addScriptTag({ content: 'var exports = {};' + js });
    await page.evaluate(async () => {
      const state = { ok: true, revision: 1, plans: [], runs: [], availability: { ready: true, paid: true, label: '준비됨' },
        scheduling: { nativeReservationReady: true }, imageProviders: [{ id: 'imagefx', label: 'ImageFX' }],
        imageCapabilities: { officialCaptureReady: false, officialCaptureReason: '공식 자료 자동 수집은 승인된 출처와 캡처 준비 연결이 필요합니다.' } };
      const api = {
        dailyPublishingRequest: async () => ({ status: 200, body: state }),
        getAllBlogAccounts: async () => ({ success: true, accounts: [{ id: 'mock', name: '검증용 블로그', blogId: 'test-only' }] }),
        fetchBlogCategories: async () => ({ success: true, categories: [{ id: '3', name: '자동차' }] }),
      };
      window.testPanel = exports.mountDailyPublishingPanel(document.querySelector('dialog'), api, { pollIntervalMs: 0 });
      await window.testPanel.open();
    });
    assert.equal(await page.locator('[data-daily=start]').isDisabled(), true);
    await page.locator('[data-daily=category]').selectOption('3');
    await page.locator('[data-daily=topic]').fill('자동차 관련 공식 발표를 검토하고 독자에게 필요한 내용');
    await page.locator('[data-daily=writer]').selectOption('agent-claude');
    await page.locator('[data-daily=image-mode]').selectOption('ai-generated');
    await page.locator('[data-daily=image-source]').selectOption('imagefx');
    await page.locator('[data-daily=time]').fill('20:00');
    await page.locator('[data-daily=consent]').check();
    assert.equal(await page.locator('[data-daily=start]').isEnabled(), true);
    const dimensions = await page.locator('dialog').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth, right: el.getBoundingClientRect().right, left: el.getBoundingClientRect().left }));
    assert.ok(dimensions.scroll <= dimensions.client + 1, JSON.stringify(dimensions));
    assert.ok(dimensions.left >= 0 && dimensions.right <= width, JSON.stringify(dimensions));
    await page.locator('dialog').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, `${label}-top.png`) });
    await page.locator('[data-daily=start]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${label}-actions.png`) });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${label}: form interaction, boundaries, screenshots passed`);
  }
} finally { await browser.close(); }
