// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installAccountSafetyControls } from '../renderer/modules/accountSafetyControls';
const ready = { paused: false, busy: false, version: 0, label: '중단 없음' };
const paused = { paused: true, busy: false, version: 2, code: 'ACCOUNT_PROTECTED', label: '보호조치' };
let disconnect: (() => void) | undefined;
const api = vi.fn();
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const button = (action: string) => document.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)!;
beforeEach(() => {
  vi.useFakeTimers(); api.mockReset().mockResolvedValue({ success: true, state: ready });
  (window as any).api = { accountSafety: api };
  document.body.innerHTML = '<div class="account-item" data-account-id="account-1"></div>';
});
afterEach(() => { disconnect?.(); document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });
it('mounts once and only reads local status before a user click', async () => {
  disconnect = installAccountSafetyControls(); await flush();
  document.querySelector('.account-item')!.append(document.createElement('span')); await flush();
  expect(document.querySelectorAll('[data-account-safety]')).toHaveLength(1);
  expect(api).toHaveBeenCalledTimes(1); expect(api.mock.calls[0].slice(0,2)).toEqual(['account-1','status']);
  expect(button('confirm').hidden).toBe(true);
  expect(button('open').disabled).toBe(false);
});
it('passes displayed account version for explicit resume and renders returned guidance', async () => {
  api.mockResolvedValueOnce({ success: true, state: paused });
  disconnect = installAccountSafetyControls(); await flush();
  api.mockResolvedValueOnce({ success: true, state: { ...ready, version: 3 }, message: '직접 다시 실행해주세요.' });
  button('resume').click(); await flush();
  expect(api).toHaveBeenLastCalledWith('account-1','resume',2,undefined,undefined);
  expect(document.querySelector('[role=status]')?.textContent).toBe('직접 다시 실행해주세요.');
  expect(api).toHaveBeenCalledTimes(2);
});
it('busy account permits status refresh and disables mutation actions', async () => {
  api.mockResolvedValue({ success: true, state: { ...ready, busy: true } });
  disconnect = installAccountSafetyControls(); await flush();
  expect(button('open').disabled).toBe(true); expect(button('resume').disabled).toBe(true);
  expect(button('status').disabled).toBe(false);
});
it('pending publication requires user confirmation and forwards the exact pending token', async () => {
  const state = { ...paused, code: 'PUBLISH_OUTCOME_UNKNOWN', pendingToken: 'pending-hash' };
  api.mockResolvedValue({ success: true, state });
  disconnect = installAccountSafetyControls(); await flush();
  const confirm = vi.fn().mockReturnValue(false); window.confirm = confirm;
  expect(button('confirm').hidden).toBe(false); button('confirm').click(); await flush();
  expect(api).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true); button('confirm').click(); await flush();
  expect(api).toHaveBeenLastCalledWith('account-1','confirm',2,'published','pending-hash');
});
it('times out a stuck request, enables refresh, and ignores its late resolution', async () => {
  let resolve!: (value: any) => void; api.mockImplementationOnce(() => new Promise(r => { resolve=r; }));
  disconnect = installAccountSafetyControls(); await flush();
  await vi.advanceTimersByTimeAsync(45001);
  expect(document.querySelector('[role=status]')?.textContent).toContain('응답이 지연');
  expect(button('status').disabled).toBe(false);
  button('status').click(); await flush();
  resolve({ success: true, state: paused }); await flush();
  expect(document.querySelector('[role=status]')?.textContent).toBe(ready.label);
});
it('keeps newer state version when a stale response arrives', async () => {
  api.mockResolvedValueOnce({ success: true, state: paused });
  disconnect = installAccountSafetyControls(); await flush();
  api.mockResolvedValueOnce({ success: true, state: ready });
  button('status').click(); await flush();
  expect(document.querySelector('[role=status]')?.textContent).toBe(paused.label);
});
it('shows unsupported app and request errors as text without executing markup', async () => {
  delete (window as any).api;
  disconnect = installAccountSafetyControls(); await flush();
  expect(document.querySelector('[role=status]')?.textContent).toContain('앱 업데이트');
  (window as any).api = { accountSafety: api.mockRejectedValue(new Error('<img src=x onerror=alert(1)>')) };
  button('status').click(); await flush();
  expect(document.querySelector('[role=status] img')).toBeNull();
  expect(document.querySelector('[role=status]')?.textContent).toContain('<img');
});

it('hides outcome buttons even when app-wide button styles override the hidden attribute', async () => {
 const style=document.createElement('style'); style.textContent='button { display: inline-flex !important; }';document.body.append(style);
 disconnect=installAccountSafetyControls();await flush();
 expect(button('confirm').style.getPropertyValue('display')).toBe('none');
 expect(button('confirm').style.getPropertyPriority('display')).toBe('important');
});
