// @vitest-environment happy-dom
/**
 * The in-place panel for an account stop raised by a publish started from the main screen
 * (single / semi-auto / full-auto / continuous). Before it, the user only got a toast naming buttons that
 * do not exist on that screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountPauseModalCodeOf, noteAccountPauseDispatch, showAccountPauseModal } from '../renderer/modules/accountPauseModal';

const ready = { paused: false, busy: false, version: 4, label: '중단 없음' };
const stopped = (code: string, extra: Record<string, unknown> = {}) => ({ paused: true, busy: false, version: 7, code, label: code, ...extra });
const api = vi.fn();
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const modal = () => document.getElementById('account-pause-modal');
const button = (action: string) => document.querySelector<HTMLButtonElement>(`#account-pause-modal button[data-action="${action}"]`);
const statusText = () => document.querySelector('#account-pause-modal [role=status]')?.textContent || '';
const errorOf = (code: string) => new Error(`[${code}] 계정 작업이 중단되었습니다.`);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  api.mockReset().mockResolvedValue({ success: true, state: ready });
  (window as any).api = { accountSafety: api };
  window.confirm = vi.fn().mockReturnValue(true);
});
afterEach(() => { modal()?.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('accountPauseModalCodeOf', () => {
  it.each([
    [errorOf('PUBLISH_OUTCOME_UNKNOWN'), 'PUBLISH_OUTCOME_UNKNOWN'],
    ['[LOGIN_REQUIRED] 로그인 필요\n\n🔧 진단 리포트가 저장됐어요', 'LOGIN_REQUIRED'],
    [{ code: 'NETWORK_WAIT', message: 'x' }, 'NETWORK_WAIT'],
    [errorOf('ACCOUNT_MISMATCH'), 'ACCOUNT_MISMATCH'],
    [errorOf('LOGIN_CHALLENGE'), 'LOGIN_CHALLENGE'],
    [errorOf('ACCOUNT_PROTECTED'), 'ACCOUNT_PROTECTED'],
  ])('reads the explicit stop code from %j', (input, code) => {
    expect(accountPauseModalCodeOf(input)).toBe(code);
  });

  it.each([new Error('로그인 필요'), '네이버 보호조치 안내', new Error('[ACCOUNT_BUSY] 작업이 실행 중'), null, undefined, 42, {}])(
    'ignores everything that is not an explicit stop: %j', (input) => {
      expect(accountPauseModalCodeOf(input)).toBeUndefined();
    });
});

describe('showAccountPauseModal', () => {
  it('does nothing for an ordinary error', async () => {
    expect(await showAccountPauseModal(new Error('이미지 생성 실패'), { naverId: 'main-id' })).toBe(false);
    expect(modal()).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it('reads the local status of the main-screen Naver ID, then names the account and the reason', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    expect(await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: ' Main-ID ' })).toBe(true);
    await flush();
    expect(api).toHaveBeenCalledWith('main-id', 'status', undefined, undefined, undefined, 'naver-id');
    const dialog = modal()!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('main-id');
    expect(dialog.textContent).toContain('로그인');
    expect(button('open')).not.toBeNull();
    expect(button('resume')).not.toBeNull();
    expect(button('confirm-published')).toBeNull();
    expect(button('open-posts')).toBeNull();
  });

  it.each(['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'ACCOUNT_MISMATCH'])('%s offers the Naver window and the resume check', async (code) => {
    api.mockResolvedValue({ success: true, state: stopped(code) });
    await showAccountPauseModal(errorOf(code), { naverId: 'main-id' }); await flush();
    expect(button('open')?.textContent).toBe('네이버 창 열기');
    expect(button('resume')?.textContent).toBe('확인 후 재개');
    expect(button('confirm-published')).toBeNull();
  });

  it('opens the Naver window and resumes with the displayed state version', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    api.mockResolvedValueOnce({ success: true, state: stopped('LOGIN_REQUIRED'), message: '열린 네이버 창에서 직접 로그인해주세요.' });
    button('open')!.click(); await flush();
    expect(api).toHaveBeenLastCalledWith('main-id', 'open', 7, undefined, undefined, 'naver-id');
    expect(statusText()).toContain('직접 로그인');
    api.mockResolvedValueOnce({ success: true, state: ready, message: '확인 완료. 원고를 확인하고 원하는 작업을 다시 실행해주세요.' });
    button('resume')!.click(); await flush();
    expect(api).toHaveBeenLastCalledWith('main-id', 'resume', 7, undefined, undefined, 'naver-id');
    expect(statusText()).toContain('확인 완료');
    expect(statusText()).toContain('발행 버튼을 다시');
    expect(button('resume')).toBeNull();
    expect(button('close')).not.toBeNull();
  });

  it('keeps the actions and shows the reason when the check fails', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    api.mockResolvedValueOnce({ success: false, state: stopped('LOGIN_REQUIRED'), message: '네이버 로그인이 아직 되어 있지 않습니다.' });
    button('resume')!.click(); await flush();
    expect(statusText()).toContain('로그인이 아직');
    expect(button('resume')!.disabled).toBe(false);
    expect(button('open')).not.toBeNull();
  });

  it('never publishes by itself after a successful action', async () => {
    api.mockResolvedValue({ success: true, state: stopped('NETWORK_WAIT') });
    await showAccountPauseModal(errorOf('NETWORK_WAIT'), { naverId: 'main-id' }); await flush();
    api.mockResolvedValueOnce({ success: true, state: ready, message: '확인 완료.' });
    button('resume')!.click(); await flush();
    expect(api.mock.calls.map(call => call[1])).toEqual(['status', 'resume']);
  });

  it('says so when the stop is already gone', async () => {
    api.mockResolvedValue({ success: true, state: ready });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    expect(statusText()).toContain('멈춤');
    expect(button('resume')).toBeNull();
    expect(button('close')).not.toBeNull();
  });

  it('shows one panel for repeated reports of the same stop and replaces it for a different one', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    expect(document.querySelectorAll('#account-pause-modal')).toHaveLength(1);
    api.mockResolvedValue({ success: true, state: stopped('NETWORK_WAIT') });
    await showAccountPauseModal(errorOf('NETWORK_WAIT'), { naverId: 'main-id' }); await flush();
    expect(document.querySelectorAll('#account-pause-modal')).toHaveLength(1);
    expect(modal()!.dataset.code).toBe('NETWORK_WAIT');
  });

  it('closes with the button, Escape, and a click outside the panel', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    button('close')!.click(); expect(modal()).toBeNull();
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(modal()).toBeNull();
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    modal()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); expect(modal()).toBeNull();
  });

  it('falls back to the typed ID, then the saved ID, when the caller gives none', async () => {
    document.body.innerHTML = '<input id="naver-id" value=" Typed-Id ">';
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED')); await flush();
    expect(api.mock.calls[0][0]).toBe('typed-id');
    modal()!.remove(); document.body.innerHTML = '';
    (window as any).api = { accountSafety: api, getConfig: vi.fn(async () => ({ savedNaverId: 'Saved-Id' })) };
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED')); await flush();
    expect(api.mock.calls.at(-1)![0]).toBe('saved-id');
  });

  it('still explains the stop when the app bridge is missing or the status call fails', async () => {
    delete (window as any).api;
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    expect(modal()).not.toBeNull();
    expect(statusText()).toContain('앱 업데이트');
    modal()!.remove();
    (window as any).api = { accountSafety: vi.fn().mockRejectedValue(new Error('<img src=x onerror=alert(1)>')) };
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    expect(modal()!.querySelector('img')).toBeNull();
    expect(statusText()).toContain('<img');
  });

  it('ends a stuck request with a message instead of hanging', async () => {
    api.mockResolvedValue({ success: true, state: stopped('LOGIN_REQUIRED') });
    await showAccountPauseModal(errorOf('LOGIN_REQUIRED'), { naverId: 'main-id' }); await flush();
    api.mockImplementationOnce(() => new Promise(() => {}));
    button('resume')!.click(); await flush();
    expect(button('resume')!.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(120001);
    expect(statusText()).toContain('응답이 지연');
    expect(button('resume')!.disabled).toBe(false);
  });
});

describe('PUBLISH_OUTCOME_UNKNOWN', () => {
  const pending = stopped('PUBLISH_OUTCOME_UNKNOWN', { pendingToken: 'pending-token' });

  it('asks whether the previous post is on Naver and offers the three answers', async () => {
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    expect(modal()!.textContent).toContain('네이버에 올라갔나요');
    expect(button('open-posts')?.textContent).toBe('네이버 글 목록 열기');
    expect(button('confirm-published')?.textContent).toBe('올라갔어요 — 발행됨 확인');
    expect(button('confirm-not-published')?.textContent).toBe('안 올라갔어요 — 다시 발행 가능하게');
    expect(button('resume')).toBeNull();
  });

  it('opens the post list in the account session without confirming anything', async () => {
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    api.mockResolvedValueOnce({ success: true, state: pending, message: '네이버 글 목록을 열었습니다.' });
    button('open-posts')!.click(); await flush();
    expect(api).toHaveBeenLastCalledWith('main-id', 'open-posts', 7, undefined, undefined, 'naver-id');
    expect(statusText()).toContain('글 목록을 열었습니다');
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['confirm-published', 'published', '같은 글을 다시 발행하지'],
    ['confirm-not-published', 'not-published', '발행 버튼을 다시'],
  ])('%s sends the exact pending token after the user agrees', async (action, outcome, followUp) => {
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    (window.confirm as any).mockReturnValueOnce(false);
    button(action)!.click(); await flush();
    expect(api).toHaveBeenCalledTimes(1);
    api.mockResolvedValueOnce({ success: true, state: ready, message: '발행 결과를 기록했습니다.' });
    button(action)!.click(); await flush();
    expect(api).toHaveBeenLastCalledWith('main-id', 'confirm', 7, outcome, 'pending-token', 'naver-id');
    expect(statusText()).toContain('기록했습니다');
    expect(statusText()).toContain(followUp);
    expect(button('confirm-published')).toBeNull();
    expect(button('confirm-not-published')).toBeNull();
  });

  it('keeps the answers available when the confirmation fails', async () => {
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    api.mockResolvedValueOnce({ success: false, state: pending, message: '네이버 로그인이 아직 되어 있지 않습니다.' });
    button('confirm-published')!.click(); await flush();
    expect(statusText()).toContain('로그인이 아직');
    expect(button('confirm-published')!.disabled).toBe(false);
  });

  it('with nothing left to confirm, offers the plain resume check', async () => {
    api.mockResolvedValue({ success: true, state: stopped('PUBLISH_OUTCOME_UNKNOWN') });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    expect(button('resume')).not.toBeNull();
    expect(button('confirm-published')).toBeNull();
  });

  it('names the title of the post this publish attempt left pending', async () => {
    api.mockResolvedValueOnce({ success: true, state: ready });
    noteAccountPauseDispatch('main-id', '봄철 미세먼지 대처법'); await flush();
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    expect(modal()!.textContent).toContain('직전 글(봄철 미세먼지 대처법)이 네이버에 올라갔나요');
  });

  it('does not attach the current title to a record that was already pending before this attempt', async () => {
    api.mockResolvedValueOnce({ success: true, state: pending });
    noteAccountPauseDispatch('main-id', '이번에 발행하려던 글'); await flush();
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    expect(modal()!.textContent).not.toContain('이번에 발행하려던 글');
    expect(modal()!.textContent).toContain('직전 글이 네이버에 올라갔나요');
  });

  it('remembers the title for the same pending record in a later session', async () => {
    api.mockResolvedValueOnce({ success: true, state: ready });
    noteAccountPauseDispatch('main-id', '기억할 제목'); await flush();
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    modal()!.remove();
    // A later run reports the same record without a new dispatch note.
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'main-id' }); await flush();
    expect(modal()!.textContent).toContain('직전 글(기억할 제목)');
  });

  it('does not guess a title when the state before the attempt could not be read', async () => {
    api.mockRejectedValueOnce(new Error('ipc down'));
    noteAccountPauseDispatch('another-id', '추측 금지 제목'); await flush();
    api.mockResolvedValue({ success: true, state: pending });
    await showAccountPauseModal(errorOf('PUBLISH_OUTCOME_UNKNOWN'), { naverId: 'another-id' }); await flush();
    expect(modal()!.textContent).not.toContain('추측 금지 제목');
  });
});
