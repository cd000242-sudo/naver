// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindDropshotLogin,
  refreshDropshotLoginStatus,
} from '../renderer/modules/dropshotLoginUi.js';

const ids = {
  loginBtnId: 'dropshot-login',
  checkBtnId: 'dropshot-check',
  statusId: 'dropshot-status',
};

describe('Dropshot login UI state', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="${ids.loginBtnId}">로그인</button>
      <button id="${ids.checkBtnId}">확인</button>
      <div id="${ids.statusId}"></div>
    `;
  });

  it('keeps the authenticated button while a background status probe is pending', async () => {
    let finishProbe!: (value: unknown) => void;
    let finishLogin!: (value: unknown) => void;
    const checkDropshotLogin = vi.fn()
      .mockResolvedValueOnce({
        loggedIn: false,
        message: '이미지 생성이 진행 중입니다.',
        phase: 'checking',
        ready: false,
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishProbe = resolve;
      }));
    const dropshotLogin = vi.fn()
      .mockResolvedValueOnce({
        loggedIn: false,
        message: '이미지 생성이 진행 중입니다.',
        phase: 'checking',
        ready: false,
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishLogin = resolve;
      }));
    (window as any).api = { checkDropshotLogin, dropshotLogin };
    (window as any).toastManager = { success: vi.fn() };

    bindDropshotLogin(ids);
    await refreshDropshotLoginStatus(ids);
    expect(document.getElementById(ids.loginBtnId)?.textContent).toBe('🔗 로그인');
    expect((document.getElementById(ids.loginBtnId) as HTMLButtonElement).disabled).toBe(false);

    (document.getElementById(ids.loginBtnId) as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect((document.getElementById(ids.loginBtnId) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(document.getElementById(ids.loginBtnId)?.textContent).toBe('🔗 로그인');

    (document.getElementById(ids.loginBtnId) as HTMLButtonElement).click();
    const probe = refreshDropshotLoginStatus(ids);
    finishLogin({
      loggedIn: true,
      message: '로그인 계정을 인식했습니다.',
      phase: 'authenticated',
      ready: false,
    });
    await vi.waitFor(() => {
      expect(document.getElementById(ids.loginBtnId)?.textContent).toBe('✅ 로그인됨');
    });

    expect(document.getElementById(ids.loginBtnId)?.textContent).toBe('✅ 로그인됨');
    expect((document.getElementById(ids.loginBtnId) as HTMLButtonElement).disabled).toBe(true);

    finishProbe({
      loggedIn: false,
      message: '로그인이 필요합니다.',
      phase: 'unauthenticated',
      ready: false,
    });
    await probe;
    expect(document.getElementById(ids.loginBtnId)?.textContent).toBe('✅ 로그인됨');
    expect(document.getElementById(ids.statusId)?.textContent).toContain('로그인 계정을 인식했습니다.');
  });
});
