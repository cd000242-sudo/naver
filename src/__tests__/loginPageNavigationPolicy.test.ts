import { describe, expect, it } from 'vitest';
import {
  classifyLoginGotoError,
  isLoginProxyFailureBody,
  isLoginChallengeUrl,
  resolvePostLoginProgressUrl,
  isPostLoginFinalCheckSuccess,
  resolveLoginPageNavigationUrl,
  shouldInspectLoginPageDom,
  shouldReportFinalLoginUrlFailure,
  shouldVerifyExistingSessionAfterMissingLoginInput,
  shouldNavigateToLoginPageFromCurrentUrl,
  isDeviceConfirmBodyText,
  isDeviceConfirmUrl,
} from '../automation/loginPageNavigationPolicy.js';

describe('loginPageNavigationPolicy', () => {
  it('classifies login-page navigation URLs without inline includes checks', () => {
    expect(resolveLoginPageNavigationUrl('https://nid.naver.com/nidlogin.login')).toMatchObject({
      status: 'login-page-loaded',
      isLoginPageLoaded: true,
      isAlreadyLoggedInRedirect: false,
    });

    expect(resolveLoginPageNavigationUrl('https://nid.naver.com/login/ext/deviceConfirm')).toMatchObject({
      status: 'login-page-loaded',
      isLoginPageLoaded: true,
    });

    expect(resolveLoginPageNavigationUrl('https://www.naver.com')).toMatchObject({
      status: 'already-logged-in-redirect',
      isLoginPageLoaded: false,
      isAlreadyLoggedInRedirect: true,
    });

    expect(resolveLoginPageNavigationUrl('https://blog.naver.com/leader_248')).toMatchObject({
      status: 'already-logged-in-redirect',
      isAlreadyLoggedInRedirect: true,
    });

    expect(resolveLoginPageNavigationUrl('https://www.naver.com/login/help')).toMatchObject({
      status: 'unexpected',
      isLoginPageLoaded: false,
      isAlreadyLoggedInRedirect: false,
    });

    expect(resolveLoginPageNavigationUrl('about:blank')).toMatchObject({
      status: 'unexpected',
    });
  });

  it('classifies navigation errors that should retry login page loading', () => {
    expect(classifyLoginGotoError('net::ERR_CONNECTION_TIMED_OUT at https://nid.naver.com')).toMatchObject({
      isNetworkError: true,
      isProxyError: false,
      shouldRetry: true,
    });

    expect(classifyLoginGotoError('net::ERR_PROXY_AUTH_REQUESTED')).toMatchObject({
      isNetworkError: true,
      isProxyError: true,
      shouldRetry: true,
    });

    expect(classifyLoginGotoError('Execution context was destroyed')).toMatchObject({
      isNetworkError: false,
      isProxyError: false,
      shouldRetry: false,
    });
  });

  it('decides whether the current page needs an explicit login-page navigation', () => {
    expect(shouldNavigateToLoginPageFromCurrentUrl('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(shouldNavigateToLoginPageFromCurrentUrl('https://nid.naver.com/login/ext/deviceConfirm')).toBe(false);

    expect(shouldNavigateToLoginPageFromCurrentUrl('about:blank')).toBe(true);
    expect(shouldNavigateToLoginPageFromCurrentUrl('https://www.naver.com')).toBe(true);
    expect(shouldNavigateToLoginPageFromCurrentUrl('https://blog.naver.com/leader_248')).toBe(true);
    expect(shouldNavigateToLoginPageFromCurrentUrl('https://example.com')).toBe(true);
  });

  it('decides when missing login inputs should fall back to an existing-session check', () => {
    expect(shouldVerifyExistingSessionAfterMissingLoginInput('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(shouldVerifyExistingSessionAfterMissingLoginInput('https://nid.naver.com/login/ext/deviceConfirm')).toBe(false);

    expect(shouldVerifyExistingSessionAfterMissingLoginInput('https://www.naver.com')).toBe(true);
    expect(shouldVerifyExistingSessionAfterMissingLoginInput('https://blog.naver.com/leader_248')).toBe(true);
    expect(shouldVerifyExistingSessionAfterMissingLoginInput('about:blank')).toBe(true);
    expect(shouldVerifyExistingSessionAfterMissingLoginInput('https://example.com')).toBe(true);
  });

  it('detects proxy failure pages from final login body diagnostics', () => {
    expect(isLoginProxyFailureBody('HTTP ERROR 407 proxy authentication required')).toBe(true);
    expect(isLoginProxyFailureBody('프록시 인증이 필요합니다')).toBe(true);
    expect(isLoginProxyFailureBody('페이지가 작동하지 않습니다')).toBe(true);
    expect(isLoginProxyFailureBody('네이버 로그인 페이지입니다')).toBe(false);
  });

  it('resolves post-login progress URL state without treating login-like pages as success', () => {
    const loginUrl = 'https://nid.naver.com/nidlogin.login';

    expect(resolvePostLoginProgressUrl('https://www.naver.com', loginUrl)).toMatchObject({
      status: 'success',
      shouldMarkLoginSuccess: true,
    });

    expect(resolvePostLoginProgressUrl('https://blog.naver.com/leader_248', loginUrl)).toMatchObject({
      status: 'success',
      shouldMarkLoginSuccess: true,
    });

    expect(resolvePostLoginProgressUrl('https://example.com/complete', loginUrl)).toMatchObject({
      status: 'recheck-after-delay',
      shouldRecheckAfterDelay: true,
    });

    expect(resolvePostLoginProgressUrl('https://www.naver.com/login/help', loginUrl)).toMatchObject({
      status: 'pending',
      shouldMarkLoginSuccess: false,
    });

    expect(resolvePostLoginProgressUrl(loginUrl, loginUrl)).toMatchObject({
      status: 'pending',
      shouldMarkLoginSuccess: false,
    });

    expect(resolvePostLoginProgressUrl('about:blank', loginUrl)).toMatchObject({
      status: 'pending',
    });
  });

  it('checks delayed post-login URLs conservatively', () => {
    expect(isPostLoginFinalCheckSuccess('https://www.naver.com')).toBe(true);
    expect(isPostLoginFinalCheckSuccess('https://blog.naver.com/leader_248')).toBe(true);
    expect(isPostLoginFinalCheckSuccess('https://example.com/complete')).toBe(true);

    expect(isPostLoginFinalCheckSuccess('https://nid.naver.com/nidlogin.login')).toBe(false);
    expect(isPostLoginFinalCheckSuccess('https://www.naver.com/login/help')).toBe(false);
    expect(isPostLoginFinalCheckSuccess('about:blank')).toBe(false);
  });

  it('detects Naver login challenge URLs without treating normal blog URLs as challenges', () => {
    expect(isLoginChallengeUrl('https://nid.naver.com/login/ext/verification')).toBe(true);
    expect(isLoginChallengeUrl('https://nid.naver.com/user2/protect')).toBe(true);
    expect(isLoginChallengeUrl('https://nid.naver.com/security/check')).toBe(true);

    expect(isLoginChallengeUrl('https://blog.naver.com/security-camera-review')).toBe(false);
    expect(isLoginChallengeUrl('https://www.naver.com')).toBe(false);
    expect(isLoginChallengeUrl('about:blank')).toBe(false);
  });

  it('limits login DOM inspection to NID login/account surfaces', () => {
    expect(shouldInspectLoginPageDom('https://nid.naver.com/nidlogin.login')).toBe(true);
    expect(shouldInspectLoginPageDom('https://nid.naver.com/login/ext/deviceConfirm')).toBe(true);
    expect(shouldInspectLoginPageDom('https://nid.naver.com/user2/help')).toBe(true);

    expect(shouldInspectLoginPageDom('https://www.naver.com')).toBe(false);
    expect(shouldInspectLoginPageDom('https://blog.naver.com/PostWriteForm.naver?blogId=loginblog')).toBe(false);
    expect(shouldInspectLoginPageDom('about:blank')).toBe(false);
  });

  it('reports final login URL failures without false positives from blog IDs or post URLs', () => {
    expect(shouldReportFinalLoginUrlFailure('https://nid.naver.com/nidlogin.login')).toBe(true);
    expect(shouldReportFinalLoginUrlFailure('https://nid.naver.com/login/ext/deviceConfirm')).toBe(true);
    expect(shouldReportFinalLoginUrlFailure('https://login.naver.com')).toBe(true);
    expect(shouldReportFinalLoginUrlFailure('https://example.com/login')).toBe(true);

    expect(shouldReportFinalLoginUrlFailure('https://blog.naver.com/PostWriteForm.naver?blogId=loginblog')).toBe(false);
    expect(shouldReportFinalLoginUrlFailure('https://blog.naver.com/security-camera-review')).toBe(false);
    expect(shouldReportFinalLoginUrlFailure('https://www.naver.com')).toBe(false);
    expect(shouldReportFinalLoginUrlFailure('about:blank')).toBe(false);
  });

  it('detects Naver device-confirm surfaces from URL and body text', () => {
    expect(isDeviceConfirmUrl('https://nid.naver.com/login/ext/deviceConfirm')).toBe(true);
    expect(isDeviceConfirmUrl('https://nid.naver.com/device_confirm')).toBe(true);
    expect(isDeviceConfirmUrl('https://nid.naver.com/login/new_device')).toBe(true);
    expect(isDeviceConfirmUrl('https://blog.naver.com/device-review')).toBe(false);

    expect(isDeviceConfirmBodyText('새로운 기기를 등록하고 계속 진행하세요')).toBe(true);
    expect(isDeviceConfirmBodyText('기기를 등록하면 로그인 알림을 받을 수 있습니다')).toBe(true);
    expect(isDeviceConfirmBodyText('네이버 블로그 글쓰기 화면입니다')).toBe(false);
  });
});
