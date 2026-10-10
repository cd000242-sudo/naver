// @vitest-environment happy-dom
/**
 * [2026-10-11 사장님] "네이버 창이 열려 있는데 [네이버 창 열기]/[확인 후 재개]가 뜬다 — 창이 열려 있으면 [확인 후 재개]로 유도",
 * "로그인은 확인 후 재개 없이 자동으로". 로그인 필요·다른 계정은 창에서 로그인하면 앱이 알아서 풀고, 나머지는 [확인 후 재개]를 앞세운다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showAccountPauseModal } from '../renderer/modules/accountPauseModal';

const stopped = (code: string, extra: Record<string, unknown> = {}) => ({ paused: true, busy: false, version: 7, code, label: code, ...extra });
const api = vi.fn();
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const modal = () => document.getElementById('account-pause-modal');
const actionNames = () => Array.from(document.querySelectorAll<HTMLButtonElement>('#account-pause-modal button')).map(b => b.dataset.action);
const button = (action: string) => document.querySelector<HTMLButtonElement>(`#account-pause-modal button[data-action="${action}"]`);
const text = () => modal()?.textContent || '';
const errorOf = (code: string) => new Error(`[${code}] 계정 작업이 중단되었습니다.`);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  api.mockReset();
  (window as any).api = { accountSafety: api };
});
afterEach(() => { modal()?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('창이 열려 있을 때의 안내', () => {
  it('로그인 필요 + 창 열림: 자동으로 이어진다고 안내하고, 풀리면 스스로 알아챈다', async () => {
    api.mockResolvedValueOnce({ success: true, state: stopped('LOGIN_REQUIRED', { windowOpen: true, autoResumeWatching: true }) });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' });
    await flush();
    expect(text()).toContain('자동으로');
    expect(actionNames().slice(0, 2)).toEqual(['resume', 'open']);
    expect(button('open')?.textContent).toBe('네이버 창 보기');
    // 창에서 로그인을 마치면 앱이 풀어 둔다 → 안내 창이 상태를 다시 읽어 스스로 알아챈다.
    api.mockResolvedValue({ success: true, state: { paused: false, busy: false, version: 8, label: '중단 없음' } });
    await vi.advanceTimersByTimeAsync(4_000);
    await flush();
    expect(text()).toContain('로그인을 확인해 자동으로 이어갈 수 있게 했습니다');
    expect(actionNames()).toEqual(['close']);
    expect(api).toHaveBeenCalledWith('main-id', 'status', undefined, undefined, undefined, 'naver-id');
  });

  it('본인확인 + 창 열림: [확인 후 재개]를 앞세우고 포커스, 자동으로 풀린다고 하지 않는다', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_CHALLENGE', { windowOpen: true, autoResumeWatching: false }) });
    await showAccountPauseModal(errorOf('LOGIN_CHALLENGE'), { naverId: 'main-id' });
    await flush();
    expect(actionNames().slice(0, 2)).toEqual(['resume', 'open']);
    expect(document.activeElement).toBe(button('resume'));
    expect(text()).toContain('열려 있는 네이버 창에서');
    expect(text()).not.toContain('자동으로 확인');
    const calls = api.mock.calls.length;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(api.mock.calls.length).toBe(calls); // 자동 대상이 아니면 상태를 계속 묻지 않는다
  });

  it('창이 닫혀 있으면 지금처럼 [네이버 창 열기] → [확인 후 재개] 순서', async () => {
    api.mockResolvedValue({ success: true, state: stopped('ACCOUNT_PROTECTED', { windowOpen: false }) });
    await showAccountPauseModal(errorOf('ACCOUNT_PROTECTED'), { naverId: 'main-id' });
    await flush();
    expect(actionNames().slice(0, 2)).toEqual(['open', 'resume']);
    expect(button('open')?.textContent).toBe('네이버 창 열기');
  });
});
