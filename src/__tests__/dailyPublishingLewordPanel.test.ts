// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDailyPublishingPanel } from '../renderer/modules/dailyPublishingPanel.js';

const dispose: Array<() => void> = [];
afterEach(() => { dispose.splice(0).forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const topics = ['자동차', '맛집', '게임', '영화'];
const state = (patch: Record<string, unknown> = {}) => ({ ok: true, revision: 4, plans: [], runs: [], lewordTopics: topics,
  availability: { ready: true, paid: true, label: '준비됨' }, scheduling: { nativeReservationReady: true },
  imageProviders: [{ id: 'imagefx', label: 'ImageFX' }], ...patch });
const preview = { status: 200, body: { ok: true, builtAt: '2026-11-03T01:00:00.000Z', stale: true,
  candidates: [{ keyword: '신차 할인', topic: '자동차', searchVolume: 500, documentCount: 120, ratio: 4.2 }] } };
function setup(initial = state()) {
  let value = initial;
  const api = { getAllBlogAccounts: vi.fn(async () => ({ success: true, accounts: [{ id: 'a', blogId: 'myblog', name: '블로그 A' }] })),
    fetchBlogCategories: vi.fn(async () => ({ success: true, categories: [{ id: '3', name: '자동차' }] })),
    dailyPublishingRequest: vi.fn(async (method: string, path: string, body?: any) => {
      if (path.endsWith('/leword-preview')) return preview;
      if (method === 'POST') value = state({ ...value, revision: value.revision + 1, plans: [body.plan] });
      return { status: 200, body: value };
    }) };
  const root = document.createElement('dialog'); document.body.append(root);
  const panel = mountDailyPublishingPanel(root, api, { pollIntervalMs: 0 }); dispose.push(panel.destroy);
  const el = (name: string) => root.querySelector(`[data-daily="${name}"]`) as HTMLInputElement;
  return { root, panel, api, el };
}
const change = (node: HTMLInputElement, value: string) => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); };
const check = (node: HTMLInputElement, on = true) => { node.checked = on; node.dispatchEvent(new Event('change', { bubbles: true })); };
const box = (root: HTMLElement, topic: string) => root.querySelector(`[data-daily="leword-topics"] input[value="${topic}"]`) as HTMLInputElement;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function ready() {
  const f = setup(); await f.panel.open();
  change(f.el('category'), '3'); change(f.el('image-mode'), 'ai-generated'); change(f.el('image-source'), 'imagefx'); change(f.el('time'), '20:00'); check(f.el('consent'));
  return f;
}

describe('daily panel LEWORD keyword supply', () => {
  it('keeps the free-text topic field within the 2000 characters the plan model accepts', async () => {
    const f = setup(); await f.panel.open();
    expect(f.el('topic').getAttribute('maxlength')).toBe('2000');
  });
  it('behaves like before while "직접 입력" is chosen', async () => {
    const f = await ready(); change(f.el('topic'), '자동차');
    expect(f.el('keyword-source').value).toBe('manual');
    expect(f.el('leword-box').hidden).toBe(true); expect(f.el('topic-row').hidden).toBe(false);
    f.el('start').click(); await settle();
    const plan = (f.api.dailyPublishingRequest.mock.calls.find(call => call[1] === '/v1/automations/plan')![2] as any).plan;
    expect(plan.topic).toBe('자동차'); expect(plan).not.toHaveProperty('keywordSource'); expect(plan).not.toHaveProperty('contentMode');
  });
  it('shows topic checkboxes (max 3) and needs at least one topic to start', async () => {
    const f = await ready();
    change(f.el('keyword-source'), 'leword-today-picks');
    expect(f.el('leword-box').hidden).toBe(false); expect(f.el('topic-row').hidden).toBe(true);
    expect(f.el('start').disabled).toBe(true); expect(f.el('block').textContent).toContain('주제를 1~3개');
    for (const topic of ['자동차', '맛집', '게임']) check(box(f.root, topic));
    expect(box(f.root, '영화').disabled).toBe(true);
    expect(f.el('start').disabled).toBe(false);
  });
  it('saves keywordSource, content mode and an empty topic', async () => {
    const f = await ready();
    change(f.el('keyword-source'), 'leword-today-picks'); check(box(f.root, '자동차')); check(box(f.root, '맛집')); change(f.el('content-mode'), 'homefeed');
    f.el('start').click(); await settle();
    const plan = (f.api.dailyPublishingRequest.mock.calls.find(call => call[1] === '/v1/automations/plan')![2] as any).plan;
    expect(plan).toMatchObject({ topic: '', contentMode: 'homefeed', keywordSource: { type: 'leword-today-picks', topics: ['자동차', '맛집'] } });
    expect(f.el('keyword-source').value).toBe('leword-today-picks');
    expect(box(f.root, '맛집').checked).toBe(true);
  });
  it('previews the next candidates without saving anything', async () => {
    const f = await ready();
    change(f.el('keyword-source'), 'leword-today-picks');
    expect(f.el('leword-preview').disabled).toBe(true);
    check(box(f.root, '자동차'));
    f.el('leword-preview').click(); await settle();
    const calls = f.api.dailyPublishingRequest.mock.calls;
    expect(calls.at(-1)).toEqual(['POST', '/v1/automations/leword-preview', { accountId: 'a', topics: ['자동차'] }]);
    expect(calls.some(call => call[1] === '/v1/automations/plan')).toBe(false);
    expect(f.el('leword-list').textContent).toContain('신차 할인');
    expect(f.el('leword-note').textContent).toContain('마지막 저장본');
    expect(f.el('leword-note').textContent).toContain('예약되지 않았습니다');
  });
});
