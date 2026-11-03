import { Window } from 'happy-dom';
import type { Page } from 'puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDailyNativeReservationAdapter } from '../automation/dailyNativeReservationAdapter.js';

const request = { blogId: 'fixtureblog', categoryId: '3', title: '예약 검증 글', scheduledFor: '2099-10-20T00:00:00.000Z' };
const url = 'https://blog.naver.com/PostWriteForm.naver?blogId=fixtureblog';
function domPage(mutate: (document: any) => void = () => undefined): Page {
  const window = new Window({ url });
  const document = window.document;
  vi.stubGlobal('document', document);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON() {} });
  const reset = (): void => {
    document.body.innerHTML = `<button id="open">예약 발행 1 건</button>
      <div class="se-title-text" contenteditable="true"></div><button data-click-area="tpb.publish">발행</button>
      <section id="list" hidden><h2>예약 발행 글</h2><ul><li><button id="row">예약 검증 글 2099.10.20 09:00</button></li></ul><button>팝업닫기</button></section>
      <section id="settings" hidden><button data-click-area="tpb*i.category">뉴스</button>
      <input id="radio_time2" type="radio" name="radio_time" value="pre" checked><label for="radio_time2">예약</label>
      <input class="input_date" value="2099.10.20"><select class="hour_option"><option value="09">09</option></select><select class="minute_option"><option value="00">00</option></select>
      <div id="categories" hidden><span data-testid="categoryItemText_3">뉴스</span></div></section>`;
    document.querySelector('#open')!.addEventListener('click', () => { document.querySelector('#list')!.removeAttribute('hidden'); });
    document.querySelector('#row')!.addEventListener('click', () => {
      document.querySelector('#list')!.setAttribute('hidden', '');
      document.querySelector('.se-title-text')!.textContent = request.title;
    });
    document.querySelector('[data-click-area="tpb.publish"]')!.addEventListener('click', () => { document.querySelector('#settings')!.removeAttribute('hidden'); });
    document.querySelector('[data-click-area="tpb*i.category"]')!.addEventListener('click', () => { document.querySelector('#categories')!.removeAttribute('hidden'); });
    mutate(document);
  };
  reset();
  return { url: () => url, goto: async () => reset(), evaluate: async (fn: (...args: any[]) => unknown, input: unknown) => fn(input) } as unknown as Page;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('reservation DOM instrumentation (browser fixture suite supplies real layout coverage)', () => {
  it('reads only selected category UI and survives hidden content-spoof controls', async () => {
    const page = domPage(document => {
      document.body.insertAdjacentHTML('beforeend', '<article><button>예약 발행 9 건</button></article><div hidden><h2>예약 발행 글</h2></div>');
    });
    const adapter = createDailyNativeReservationAdapter({ timeoutMs: 500 });
    await adapter.open(page, request);
    const snapshot = await adapter.read(page, request);
    expect(snapshot.rows[0].categoryId).toBe('3');
  });
  it.each([
    ['missing date', (document: any) => document.querySelector('.input_date').remove()],
    ['invalid date', (document: any) => { document.querySelector('.input_date').value = 'today'; }],
    ['ambiguous category', (document: any) => document.querySelector('#categories').insertAdjacentHTML('beforeend', '<span data-testid="categoryItemText_4">뉴스</span>')],
    ['ambiguous editor', (document: any) => document.querySelector('#settings').insertAdjacentHTML('beforeend', '<input class="input_date" value="2099.10.20">')],
    ['unobserved category', (document: any) => { document.querySelector('[data-testid]').textContent = '다른 이름'; }],
  ] as const)('fails closed for %s', async (_, mutate) => {
    const page = domPage(mutate);
    const adapter = createDailyNativeReservationAdapter({ timeoutMs: 100 });
    await adapter.open(page, request);
    await expect(adapter.read(page, request)).rejects.toThrow('DAILY_NATIVE_RESERVATION_');
  });
  it.each([
    ['disabled control', (document: any) => document.querySelector('#open').setAttribute('disabled', '')],
    ['ambiguous list', (document: any) => document.querySelector('#list').insertAdjacentHTML('beforeend', '<h3>예약 발행 글</h3>')],
    ['ambiguous lists', (document: any) => document.querySelector('#list').insertAdjacentHTML('beforeend', '<ul><li>다른 목록</li></ul>')],
    ['invalid row', (document: any) => { document.querySelector('#row').textContent = 'missing date'; }],
  ] as const)('does not open %s', async (_, mutate) => {
    const page = domPage(mutate);
    await expect(createDailyNativeReservationAdapter({ timeoutMs: 100 }).open(page, request)).rejects.toThrow('DAILY_NATIVE_RESERVATION_');
  });
  it('rejects unsupported origins and duplicate blog scope parameters', async () => {
    for (const invalid of ['about:blank', 'https://attacker.invalid/fixtureblog', `${url}&blogId=other`, 'https://blog.naver.com/PostWriteForm.naver']) {
      const page = { url: () => invalid } as Page;
      await expect(createDailyNativeReservationAdapter().open(page, request)).rejects.toThrow('ACCOUNT_UNOBSERVED');
    }
  });
});
