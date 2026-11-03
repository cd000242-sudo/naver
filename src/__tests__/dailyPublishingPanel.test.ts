// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountDailyPublishingPanel } from '../renderer/modules/dailyPublishingPanel.js';

const dispose: Array<() => void> = [];
afterEach(() => { dispose.splice(0).forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const state = (patch: Record<string, unknown> = {}) => ({ ok: true, revision: 4, plans: [], runs: [],
  availability: { ready: true, paid: true, label: '준비됨' }, scheduling: { nativeReservationReady: true },
  imageProviders: [{ id: 'imagefx', label: 'ImageFX' }], ...patch });
function setup(initial = state(), pollIntervalMs = 0) {
  let value = initial;
  const api = { getAllBlogAccounts: vi.fn(async () => ({ success: true, accounts: [{ id: 'a', blogId: 'myblog', name: '블로그 A' }] })),
    fetchBlogCategories: vi.fn(async () => ({ success: true, categories: [{ id: '0', name: '전체' }, { id: '3', name: '자동차' }] })),
    dailyPublishingRequest: vi.fn(async (method: string, path: string, body?: any) => {
      if (method === 'POST') value = state({ ...value, revision: value.revision + 1,
        plans: path.endsWith('/stop') ? (value.plans as any[]).map(p => ({ ...p, enabled: false })) : [body.plan] });
      return { status: 200, body: value };
    }) };
  const root = document.createElement('dialog'); document.body.append(root);
  const panel = mountDailyPublishingPanel(root, api, { pollIntervalMs }); dispose.push(panel.destroy);
  const el = (name: string) => root.querySelector(`[data-daily="${name}"]`) as HTMLInputElement;
  return { root, panel, api, el };
}
const change = (node: HTMLInputElement, value: string) => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
describe('app daily publishing panel', () => {
  it('does not enable a plan merely by opening and excludes fallback category zero', async () => {
    const f = setup(); await f.panel.open();
    expect(f.api.dailyPublishingRequest.mock.calls.every(c => c[0] === 'GET')).toBe(true);
    expect(f.root.textContent).toContain('중지 상태');
    expect(f.root.querySelector('option[value="0"]')).toBeNull();
    expect(f.el('start').disabled).toBe(true);
    // The default fills empty slots with real photos after AI, not the capture mode that can never start unattended.
    expect(f.el('image-mode').value).toBe('ai-first');
    expect(f.root.textContent).not.toContain('공식 출처 승인');
  });
  it('starts a collect plan only after the copyright self-responsibility consent and sends it with the plan', async () => {
    const f = setup(); await f.panel.open();
    change(f.el('category'), '3'); change(f.el('topic'), '자동차'); change(f.el('image-mode'), 'collect-first'); change(f.el('image-source'), 'imagefx');
    change(f.el('time'), '20:00'); f.el('consent').checked = true; f.el('consent').dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.el('collect-consent-row').hidden).toBe(false);
    expect(f.el('start').disabled).toBe(true);
    expect(f.root.textContent).toContain('모든 법적 책임은 사용자 본인에게');
    f.el('collect-consent').checked = true; f.el('collect-consent').dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.el('start').disabled).toBe(false);
    f.el('start').click(); await settle();
    const call = f.api.dailyPublishingRequest.mock.calls.find(c => c[1].endsWith('/plan'))!;
    expect(call[2].plan).toMatchObject({ imageMode: 'collect-first', imageCollectConsent: true, imageSource: 'imagefx' });
    change(f.el('image-mode'), 'ai-generated');
    expect(f.el('collect-consent-row').hidden).toBe(true);
  });
  it('uses the chosen Claude writer and records consent only through explicit start', async () => {
    const f = setup(); await f.panel.open();
    change(f.el('category'), '3'); change(f.el('topic'), '자동차'); change(f.el('writer'), 'agent-claude');
    change(f.el('image-mode'), 'ai-generated'); change(f.el('image-source'), 'imagefx');
    change(f.el('time'), '20:00'); f.el('consent').checked = true; f.el('consent').dispatchEvent(new Event('change', { bubbles: true }));
    expect(f.el('start').disabled).toBe(false);
    f.el('start').click(); await settle();
    const call = f.api.dailyPublishingRequest.mock.calls.find(c => c[1].endsWith('/plan'))!;
    expect(call[2]).toMatchObject({ revision: 4, plan: { enabled: true, mode: 'schedule', leadMinutes: 60,
      generator: 'agent-claude', accountId: 'a', categoryId: '3', slots: [{ time: '20:00', count: 1 }] } });
  });
  it('allows stopping an existing plan even when entitlement is no longer available', async () => {
    const f = setup(state({ availability: { ready: true, paid: false, label: '이용권 확인 필요' },
      plans: [{ accountId: 'a', categoryId: '3', enabled: true, mode: 'schedule', leadMinutes: 60,
        generator: 'agent-codex', topic: '자동차', imageMode: 'ai-generated', imageSource: 'imagefx', slots: [{ time: '20:00', count: 1 }] }] }));
    await f.panel.open(); expect(f.el('start').disabled).toBe(true); expect(f.el('stop').disabled).toBe(false);
    f.el('stop').click(); await settle();
    expect(f.api.dailyPublishingRequest.mock.calls.some(c => c[1] === '/v1/automations/stop')).toBe(true);
  });
  it('keeps the native verification block visible and rejects starting through the DOM', async () => {
    const f = setup(state({ scheduling: { nativeReservationReady: false } })); await f.panel.open();
    expect(f.root.textContent).toContain('예약 목록 확인');
    f.el('start').disabled = false; f.el('start').click(); await settle();
    expect(f.api.dailyPublishingRequest.mock.calls.some(c => c[0] === 'POST')).toBe(false);
  });
  it('preserves unsaved form choices when polling live state', async () => {
    const f = setup(); await f.panel.open();
    change(f.el('topic'), '작성 중인 주제'); change(f.el('writer'), 'agent-claude');
    await f.panel.refresh();
    expect(f.el('topic').value).toBe('작성 중인 주제');
    expect(f.el('writer').value).toBe('agent-claude');
    expect(f.api.dailyPublishingRequest.mock.calls.every(c => c[0] === 'GET')).toBe(true);
  });
  it('does not show successful activation after the backend rejects a write', async () => {
    const f = setup(); await f.panel.open();
    change(f.el('category'), '3'); change(f.el('topic'), '자동차');
    change(f.el('image-mode'), 'ai-generated'); change(f.el('image-source'), 'imagefx'); change(f.el('time'), '20:00');
    f.el('consent').checked = true; f.el('consent').dispatchEvent(new Event('change', { bubbles: true }));
    f.api.dailyPublishingRequest.mockImplementationOnce(async () => ({ status: 409, body: { ...state(), ok: false, error: '상태 충돌' } }));
    f.el('start').click(); await settle();
    expect(f.el('status').textContent).toContain('상태 충돌');
    expect(f.el('plan-status').textContent).toContain('중지 상태');
  });
  it.each(['close', 'destroy'] as const)('does not restart polling after %s during an outstanding open request', async action => {
    const f = setup(state(), 1000);
    let resolve!: (value: any) => void;
    f.api.dailyPublishingRequest.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const interval = vi.spyOn(globalThis, 'setInterval');
    const pending = f.panel.open(); f.panel[action]();
    resolve({ status: 200, body: state() }); await pending;
    expect(interval).not.toHaveBeenCalled();
    expect(f.root.open).toBe(false);
  });
  it('clears the previous account form when the next account category request fails', async () => {
    const f = setup();
    f.api.getAllBlogAccounts.mockResolvedValue({ success: true, accounts: [
      { id: 'a', blogId: 'first', name: '첫 계정' }, { id: 'b', blogId: 'second', name: '둘째 계정' },
    ] });
    await f.panel.open(); change(f.el('topic'), '이전 계정의 주제');
    f.api.fetchBlogCategories.mockRejectedValueOnce(Error('카테고리 조회 실패'));
    change(f.el('account'), 'b'); await settle();
    expect(f.el('topic').value).toBe('');
    expect(f.el('category').value).toBe('');
    expect(f.el('status').textContent).toContain('조회 실패');
  });
  it('preserves category reload errors after a successful configuration write', async () => {
    const f = setup(); await f.panel.open();
    change(f.el('category'), '3'); change(f.el('topic'), '자동차');
    change(f.el('image-mode'), 'ai-generated'); change(f.el('image-source'), 'imagefx'); change(f.el('time'), '20:00');
    f.api.fetchBlogCategories.mockRejectedValueOnce(Error('카테고리 다시 확인 필요'));
    f.el('save').click(); await settle();
    expect(f.el('status').textContent).toContain('카테고리 다시 확인 필요');
    expect(f.el('status').textContent).not.toContain('저장했습니다');
    expect(f.el('start').disabled).toBe(true);
  });
  it('reloads the latest saved form after stopping instead of rebasing stale edits', async () => {
    const plan = { accountId: 'a', categoryId: '3', enabled: true, mode: 'schedule', leadMinutes: 60,
      generator: 'agent-codex', topic: '원래 주제', imageMode: 'ai-generated', imageSource: 'imagefx', slots: [{ time: '20:00', count: 1 }] };
    const f = setup(state({ plans: [plan] })); await f.panel.open(); change(f.el('topic'), '저장하지 않은 옛 편집');
    f.api.dailyPublishingRequest.mockResolvedValueOnce({ status: 200, body: state({ revision: 5, plans: [{ ...plan, topic: '외부에서 수정한 주제' }] }) });
    await f.panel.refresh();
    f.api.dailyPublishingRequest.mockResolvedValueOnce({ status: 200, body: state({ revision: 6, plans: [{ ...plan, enabled: false, topic: '외부에서 수정한 주제' }] }) });
    f.el('stop').click(); await settle();
    expect(f.el('topic').value).toBe('외부에서 수정한 주제');
    expect(f.el('consent').checked).toBe(false);
  });
  it('labels a disabled plan with inflight work as awaiting shutdown', async () => {
    const f = setup(state({ plans: [{ accountId: 'a', enabled: false }],
      runs: [{ accountId: 'a', status: 'inflight', date: '2026-10-21', time: '20:00', ordinal: 1 }] }));
    await f.panel.open();
    expect(f.el('plan-status').textContent).toContain('종료 확인 중');
    expect(f.el('plan-status').textContent).not.toContain('자동 실행하지 않습니다');
  });
});
