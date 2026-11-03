import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDailyNativeReservationAdapter } from '../automation/dailyNativeReservationAdapter.js';
import { attestNativeReservationList } from '../automation/dailyNativeReservation.js';

const request = { blogId: 'fixtureblog', categoryId: '3', title: '예약 검증 글', scheduledFor: '2099-10-20T00:00:00.000Z' };
const url = 'https://blog.naver.com/PostWriteForm.naver?blogId=fixtureblog&Redirect=Write';
async function boundedFixture<T>(work: Promise<T>, label: string, milliseconds = 5000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`FIXTURE_${label}_TIMEOUT`)), milliseconds);
  })]); } finally { if (timer) clearTimeout(timer); }
}
type FixtureOptions = { duplicate?: boolean; hidden?: boolean; category?: string; editorTitle?: string; editorTime?: string; changedList?: boolean; spoof?: boolean; duplicateCategory?: boolean; missingTime?: boolean; missingList?: boolean; duplicateControl?: boolean; malformedRow?: boolean };
function fixture(options: FixtureOptions = {}): string {
  const row = `<li><button onclick="openRow()">${request.title} <span>2099.10.20 09:00</span></button></li>`;
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <button onclick="document.querySelector('#reservations').hidden=false">예약 발행 1 건</button>${options.duplicateControl ? '<button>예약 발행 1 건</button>' : ''}
    <div class="se-title-text" contenteditable="true"></div>
    <button data-click-area="tpb.publish" onclick="document.querySelector('#settings').hidden=false">발행</button>
    <section id="reservations" hidden><h2>${options.missingList ? '알 수 없는 목록' : '예약 발행 글'}</h2><ul ${options.hidden ? 'hidden' : ''}>${row}${options.duplicate ? row : ''}${options.malformedRow ? '<li><button>날짜 없는 글</button></li>' : ''}</ul><button onclick="this.parentElement.hidden=true">팝업닫기</button></section>
    <section id="settings" hidden>
      <button data-click-area="tpb*i.category" onclick="document.querySelector('#categories').hidden=false">뉴스</button>
      <input id="radio_time2" type="radio" name="radio_time" value="pre" checked><label for="radio_time2">예약</label>
      ${options.missingTime ? '' : `<input class="input_date" value="2099.10.20"><select class="hour_option"><option>${options.editorTime || '09'}</option></select><select class="minute_option"><option>00</option></select>`}
      <div id="categories" hidden><span data-testid="categoryItemText_${options.category || '3'}">뉴스</span>${options.duplicateCategory ? '<span data-testid="categoryItemText_4">뉴스</span>' : ''}</div>
      <button data-testid="seOnePublishBtn" onclick="window.forbiddenPublish=true;console.log('FORBIDDEN_PUBLISH')">확인</button>
    </section>
    ${options.spoof ? '<div class="se-main-container"><button>예약 발행 1 건</button><h2>예약 발행 글</h2><ul><li><button>위조 글 2099.10.20 09:00</button></li></ul><button>팝업닫기</button></div>' : ''}
    <script>window.forbiddenPublish=false;function openRow(){document.querySelector('#reservations').hidden=true;document.querySelector('.se-title-text').textContent=${JSON.stringify(options.editorTitle || request.title)};}</script>
    </body></html>`;
}

describe('daily native reservation DOM adapter (isolated intercepted browser)', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await puppeteer.launch({ headless: true, timeout: 10_000, protocolTimeout: 5000 }); });
  afterAll(async () => {
    if (!browser) return;
    try { await boundedFixture(browser.close(), 'BROWSER_CLOSE'); }
    catch { browser.process()?.kill(); }
  });
  async function withPage(options: FixtureOptions, run: (page: Page) => Promise<void>): Promise<void> {
    const page = await boundedFixture(browser.newPage(), 'NEW_PAGE');
    let visits = 0;
    let published = false;
    page.on('console', message => { if (message.text() === 'FORBIDDEN_PUBLISH') published = true; });
    await page.setRequestInterception(true);
    page.on('request', incoming => {
      if (incoming.isNavigationRequest() && incoming.frame() === page.mainFrame()) {
        visits += 1;
        void incoming.respond({ status: 200, contentType: 'text/html', body: options.changedList && visits > 2 ? fixture().replaceAll(request.title, '다른 예약 글') : fixture(options) });
      } else void incoming.abort();
    });
    try {
      await page.goto(url, { timeout: 5000, waitUntil: 'domcontentloaded' });
      await run(page); expect(published).toBe(false);
    } finally { await boundedFixture(page.close({ runBeforeUnload: false }), 'PAGE_CLOSE'); }
  }
  it('opens actual list controls, reads category from the reopened row and rechecks the list', async () => {
    await withPage({}, async page => {
      const adapter = createDailyNativeReservationAdapter({ timeoutMs: 1500 });
      await adapter.open(page, request);
      const snapshot = await adapter.read(page, request);
      expect(snapshot.rows).toEqual([{ title: request.title, scheduledAt: '2099.10.20 09:00', state: 'scheduled', categoryId: '3' }]);
      expect(attestNativeReservationList(snapshot, request).status).toBe('reserved');
      expect(await page.evaluate(() => (window as any).forbiddenPublish)).toBe(false);
    });
  });
  it.each([
    [{ duplicate: true }, 'AMBIGUOUS'], [{ hidden: true }, 'UNOBSERVED'],
    [{ editorTitle: '다른 글' }, 'UNOBSERVED'], [{ editorTime: '10' }, 'UNOBSERVED'],
    [{ duplicateCategory: true }, 'AMBIGUOUS'], [{ missingTime: true }, 'UNOBSERVED'],
    [{ changedList: true }, 'CHANGED'],
  ] as const)('fails closed for %j', async (options, error) => {
    await withPage(options, async page => {
      const adapter = createDailyNativeReservationAdapter({ timeoutMs: 300 });
      await adapter.open(page, request);
      await expect(adapter.read(page, request)).rejects.toThrow(error);
      expect(await page.evaluate(() => (window as any).forbiddenPublish)).toBe(false);
    });
  });
  it('observes a wrong category instead of copying the requested one', async () => {
    await withPage({ category: '9' }, async page => {
      const adapter = createDailyNativeReservationAdapter({ timeoutMs: 1000 });
      await adapter.open(page, request);
      const snapshot = await adapter.read(page, request);
      expect(snapshot.rows[0].categoryId).toBe('9');
      expect(() => attestNativeReservationList(snapshot, request)).toThrow();
    });
  });
  it('ignores controls injected into editable article content', async () => {
    await withPage({ spoof: true }, async page => {
      const adapter = createDailyNativeReservationAdapter({ timeoutMs: 1000 });
      await adapter.open(page, request);
      expect((await adapter.read(page, request)).rows).toHaveLength(1);
    });
  });
  it('refuses a different account before navigation', async () => {
    await withPage({}, async page => {
      await expect(createDailyNativeReservationAdapter().open(page, { ...request, blogId: 'other' })).rejects.toThrow('ACCOUNT');
      expect(page.url()).toBe(url);
    });
  });
  it('does not act after cancellation', async () => {
    await withPage({}, async page => {
      const controller = new AbortController(); controller.abort();
      await expect(createDailyNativeReservationAdapter().open(page, request, controller.signal)).rejects.toThrow('ABORTED');
      expect(await page.$eval('#reservations', element => (element as HTMLElement).hidden)).toBe(true);
    });
  });
  it.each([{ duplicateControl: true }, { missingList: true }, { malformedRow: true }])('rejects unrecognized or ambiguous list UI %j', async options => {
    await withPage(options, async page => {
      await expect(createDailyNativeReservationAdapter({ timeoutMs: 300 }).open(page, request)).rejects.toThrow('DAILY_NATIVE_RESERVATION_');
    });
  });
  it('requires a matching open and disallows replay', async () => {
    await withPage({}, async page => {
      const adapter = createDailyNativeReservationAdapter({ timeoutMs: 1500 });
      await expect(adapter.read(page, request)).rejects.toThrow('OPEN_REQUIRED');
      await adapter.open(page, request);
      await expect(adapter.read(page, { ...request, categoryId: '99' })).rejects.toThrow('OPEN_REQUIRED');
      await adapter.read(page, request);
      await expect(adapter.read(page, request)).rejects.toThrow('OPEN_REQUIRED');
    });
  });
  it('stops waiting promptly when cancelled mid-inspection', async () => {
    await withPage({ editorTime: '10' }, async page => {
      const adapter = createDailyNativeReservationAdapter({ timeoutMs: 3000 });
      const controller = new AbortController();
      await adapter.open(page, request, controller.signal);
      const pending = adapter.read(page, request, controller.signal);
      const timer = setTimeout(() => controller.abort(), 100);
      try { await expect(pending).rejects.toThrow('ABORTED'); } finally { clearTimeout(timer); }
    });
  });
});
