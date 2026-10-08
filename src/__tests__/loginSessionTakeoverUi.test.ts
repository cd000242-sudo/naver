// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync('public/login.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const conflict = {
  valid: false,
  code: 'ALREADY_LOGGED_IN',
  takeoverAvailable: true,
  message: '다른 기기에서 이미 로그인 중입니다. 기존 접속을 종료한 후 로그인하세요.',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 15; i += 1) await Promise.resolve();
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing login UI element: ${id}`);
  return found as T;
}

function enter(id: string, value: string) {
  element<HTMLInputElement>(id).value = value;
  element(id).dispatchEvent(new Event('input', { bubbles: true }));
}

function submit() {
  element('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function takeoverVisible() {
  const section = document.getElementById('session-takeover');
  return !!section && !section.hidden && section.style.display !== 'none';
}

describe('login session takeover UI', () => {
  const verify = vi.fn();
  const invoke = vi.fn();
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const close = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    document.documentElement.innerHTML = html;
    invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === 'license:verifyWithCredentials') return verify(...args);
      if (channel === 'license:getDeviceId') return 'current-device-id';
      if (channel === 'app:getVersion') return 'test-version';
      if (channel === 'license:phoneStatus') return { needed: false };
      if (channel === 'config:get') return {};
      return { ok: true, success: true };
    });
    Object.defineProperty(window, 'electronAPI', { value: { invoke }, configurable: true });
    vi.spyOn(window, 'close').mockImplementation(close);
    if (!script) throw new Error('Login page script missing');
    new Function('window', 'document', 'console', script)(window, document, logger);
    await flush();
    enter('user-id', 'account-one');
    enter('password', 'test-password');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.innerHTML = '';
  });

  it('offers explicit consent only after a structured conflict and keeps it inline despite 종료', async () => {
    verify.mockResolvedValue(conflict);
    expect(takeoverVisible()).toBe(false);
    submit();
    await flush();

    expect(verify).toHaveBeenCalledExactlyOnceWith('account-one', 'test-password', 'current-device-id');
    expect(takeoverVisible()).toBe(true);
    expect(element('session-takeover-button').textContent).toBe('다른 기기 접속 해제하고 로그인');
    expect(element('session-takeover').textContent).toContain('다른 기기의 로그인 권한이 종료');
    expect(element('session-takeover').textContent).toContain('이 기기에서 로그인');
    expect(element('error-message').textContent).toBe(conflict.message);
    expect(element('error-message').classList.contains('show')).toBe(true);
    expect(element('access-denied-modal-backdrop').style.display).not.toBe('flex');
  });

  it.each([
    { valid: false, message: 'Invalid credentials' },
    { ...conflict, code: 'LICENSE_EXPIRED' },
    { ...conflict, takeoverAvailable: false },
    { valid: false, message: conflict.message },
  ])('does not offer takeover for an unqualified response: %j', async (response) => {
    verify.mockResolvedValue(response);
    submit();
    await flush();
    expect(takeoverVisible()).toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('allows one request at a time for ordinary submits and explicit takeover clicks', async () => {
    const first = deferred<typeof conflict>();
    const second = deferred<{ valid: boolean; message: string }>();
    verify.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    submit();
    submit();
    expect(verify).toHaveBeenCalledTimes(1);
    first.resolve(conflict);
    await flush();

    element('session-takeover-button').click();
    element('session-takeover-button').click();
    submit();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenLastCalledWith('account-one', 'test-password', 'current-device-id', { takeoverSession: true });
    expect(element<HTMLButtonElement>('login-button').disabled).toBe(true);
    expect(element<HTMLButtonElement>('session-takeover-button').disabled).toBe(true);
    second.resolve({ valid: false, message: '서버 연결에 실패했습니다.' });
    await flush();
    expect(element<HTMLButtonElement>('login-button').disabled).toBe(false);
    expect(element('error-message').textContent).toBe('서버 연결에 실패했습니다.');
    expect(takeoverVisible()).toBe(false);

    verify.mockResolvedValue(conflict);
    submit();
    await flush();
    expect(verify).toHaveBeenLastCalledWith('account-one', 'test-password', 'current-device-id');
    expect(takeoverVisible()).toBe(true);
  });

  it.each(['user-id', 'password'])('invalidates the option after %s changes', async (field) => {
    verify.mockResolvedValue(conflict);
    submit();
    await flush();
    const button = element('session-takeover-button');
    enter(field, 'changed-value');
    expect(takeoverVisible()).toBe(false);
    button.click();
    expect(verify).toHaveBeenCalledTimes(1);
    submit();
    await flush();
    expect(verify.mock.calls[1]).toHaveLength(3);
  });

  it('rejects a stale option even if values were changed without an input event', async () => {
    verify.mockResolvedValue(conflict);
    submit();
    await flush();
    element<HTMLInputElement>('password').value = 'replacement-password';
    element('session-takeover-button').click();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(takeoverVisible()).toBe(false);
  });

  it('invalidates the option when registration mode opens and closes', async () => {
    verify.mockResolvedValue(conflict);
    submit();
    await flush();
    element('open-license-register-btn').click();
    expect(takeoverVisible()).toBe(false);
    element('license-register-close').click();
    element('session-takeover-button').click();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(element('license-register-backdrop').style.display).toBe('none');
  });

  it.each(['input', 'mode'])('does not revive consent after a pending request becomes stale through %s', async (change) => {
    const pending = deferred<typeof conflict>();
    verify.mockReturnValue(pending.promise);
    submit();
    if (change === 'input') enter('password', 'new-password');
    else {
      element('open-license-register-btn').click();
      element('license-register-close').click();
    }
    pending.resolve(conflict);
    await flush();
    expect(takeoverVisible()).toBe(false);
  });

  it.each(['open-password-reset-btn', 'free-use-button', 'open-phone-verify-btn'])('clears the previous consent when entering %s', async (button) => {
    verify.mockResolvedValue(conflict);
    submit();
    await flush();
    element(button).click();
    await flush();
    expect(takeoverVisible()).toBe(false);
    element('session-takeover-button').click();
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('clears consent after a rejected request and lets the user retry ordinary login', async () => {
    const error = Object.assign(new Error('네트워크 연결 실패'), { password: 'test-password', sessionToken: 'secret-session-token' });
    verify.mockResolvedValueOnce(conflict).mockRejectedValueOnce(error);
    submit();
    await flush();
    element('session-takeover-button').click();
    await flush();
    expect(takeoverVisible()).toBe(false);
    expect(element('error-message').textContent).toContain('네트워크 연결 실패');
    expect(element<HTMLButtonElement>('login-button').disabled).toBe(false);
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/test-password|secret-session-token/);
    verify.mockResolvedValue({ valid: false, message: 'Invalid credentials' });
    submit();
    await flush();
    expect(verify.mock.calls[2]).toEqual(['account-one', 'test-password', 'current-device-id']);
  });

  it('reuses credential saving, phone verification, and finishLogin after successful takeover without logging secrets', async () => {
    const response = { valid: true, sessionToken: 'secret-session-token', debugInfo: { verify: { fullResponse: { password: 'test-password', token: 'secret-session-token' } } } };
    verify.mockResolvedValueOnce(conflict).mockResolvedValueOnce(response);
    element<HTMLInputElement>('remember-credentials').checked = true;
    submit();
    await flush();
    element('session-takeover-button').click();
    await flush();

    expect(takeoverVisible()).toBe(false);
    expect(element('error-message').classList.contains('show')).toBe(false);
    expect(invoke).toHaveBeenCalledWith('config:save', { rememberLicenseCredentials: true, savedLicenseUserId: 'account-one', savedLicensePassword: 'test-password' });
    expect(invoke).toHaveBeenCalledWith('license:phoneStatus');
    expect(invoke).not.toHaveBeenCalledWith('login:success');
    expect(JSON.stringify([logger.log.mock.calls, logger.warn.mock.calls, logger.error.mock.calls])).not.toMatch(/test-password|secret-session-token/);
    submit();
    expect(verify).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invoke).toHaveBeenCalledWith('login:success');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('waits for the existing optional phone-verification dialog before finishing takeover login', async () => {
    const defaultInvoke = invoke.getMockImplementation()!;
    let phoneStatusCalls = 0;
    invoke.mockImplementation((channel: string, ...args: unknown[]) => {
      if (channel === 'license:phoneStatus') return Promise.resolve({ needed: ++phoneStatusCalls === 1, userId: 'account-one' });
      return defaultInvoke(channel, ...args);
    });
    verify.mockResolvedValueOnce(conflict).mockResolvedValueOnce({ valid: true });
    submit();
    await flush();
    element('session-takeover-button').click();
    await flush();
    expect(element('phone-verify-backdrop').style.display).toBe('flex');
    expect(element<HTMLInputElement>('phone-verify-userid').value).toBe('account-one');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invoke).not.toHaveBeenCalledWith('login:success');
    element('phone-verify-later-btn').click();
    await flush();
    expect(element('phone-verify-backdrop').style.display).toBe('none');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invoke).toHaveBeenCalledWith('login:success');
  });

  it('preserves password reset and requires a fresh ordinary login using the new password', async () => {
    verify.mockResolvedValue(conflict);
    submit();
    await flush();
    element('open-password-reset-btn').click();
    enter('pw-reset-phone', '01012345678');
    element('pw-reset-send-btn').click();
    await flush();
    enter('pw-reset-code', '123456');
    enter('pw-reset-new', 'replacement-password');
    enter('pw-reset-new2', 'replacement-password');
    element('pw-reset-confirm-btn').click();
    await flush();
    expect(invoke).toHaveBeenCalledWith('license:passwordResetConfirm', {
      userId: 'account-one', phone: '01012345678', authCode: '123456', newPassword: 'replacement-password',
    });
    expect(element<HTMLInputElement>('password').value).toBe('replacement-password');
    expect(takeoverVisible()).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(element('pw-reset-backdrop').style.display).toBe('none');
    submit();
    await flush();
    expect(verify).toHaveBeenLastCalledWith('account-one', 'replacement-password', 'current-device-id');
  });

  it('keeps explicit license-expiry failures routed to the access-denied modal', async () => {
    verify.mockResolvedValue({ valid: false, message: '라이선스가 만료되었습니다.' });
    submit();
    await flush();
    expect(element('access-denied-modal-backdrop').style.display).toBe('flex');
    expect(takeoverVisible()).toBe(false);
  });
});
