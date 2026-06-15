import { isNaverBlogDomainUrl } from './editorUrlState.js';

export type LoginPageNavigationStatus =
  | 'login-page-loaded'
  | 'already-logged-in-redirect'
  | 'unexpected';

export type PostLoginProgressUrlStatus =
  | 'success'
  | 'recheck-after-delay'
  | 'pending';

export interface LoginPageNavigationDecision {
  status: LoginPageNavigationStatus;
  isLoginPageLoaded: boolean;
  isAlreadyLoggedInRedirect: boolean;
}

export interface PostLoginProgressUrlDecision {
  status: PostLoginProgressUrlStatus;
  shouldMarkLoginSuccess: boolean;
  shouldRecheckAfterDelay: boolean;
}

export interface LoginGotoErrorDecision {
  isNetworkError: boolean;
  isProxyError: boolean;
  shouldRetry: boolean;
}

const NETWORK_ERROR_MARKERS = [
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_TUNNEL_CONNECTION_FAILED',
  'ERR_PROXY_CONNECTION_FAILED',
  'ERR_PROXY_AUTH_REQUESTED',
  'ERR_NO_SUPPORTED_PROXIES',
  'ERR_SOCKS_CONNECTION_FAILED',
  'ERR_PROXY',
  'net::',
] as const;

const PROXY_ERROR_MARKERS = ['PROXY', 'TUNNEL', '407'] as const;

const DEVICE_CONFIRM_URL_MARKERS = [
  'deviceconfirm',
  'device_confirm',
  'new_device',
  'register_device',
  'devicereg',
] as const;

function isNidLoginSurface(value: string): boolean {
  const lowerUrl = String(value || '').toLowerCase();
  return lowerUrl.includes('nidlogin') || lowerUrl.includes('nid.naver.com/login');
}

function isNidAccountSurface(value: string): boolean {
  const lowerUrl = String(value || '').toLowerCase();
  return lowerUrl.includes('nidlogin') || lowerUrl.includes('nid.naver.com');
}

function isBlankSurface(value: string): boolean {
  return String(value || '').toLowerCase() === 'about:blank';
}

function hasGenericLoginMarker(value: string): boolean {
  return String(value || '').toLowerCase().includes('login');
}

export function resolveLoginPageNavigationUrl(value: string): LoginPageNavigationDecision {
  const url = String(value || '');
  const lowerUrl = url.toLowerCase();

  if (isNidLoginSurface(url)) {
    return {
      status: 'login-page-loaded',
      isLoginPageLoaded: true,
      isAlreadyLoggedInRedirect: false,
    };
  }

  if (
    (lowerUrl.includes('naver.com') || isNaverBlogDomainUrl(url)) &&
    !lowerUrl.includes('login')
  ) {
    return {
      status: 'already-logged-in-redirect',
      isLoginPageLoaded: false,
      isAlreadyLoggedInRedirect: true,
    };
  }

  return {
    status: 'unexpected',
    isLoginPageLoaded: false,
    isAlreadyLoggedInRedirect: false,
  };
}

export function classifyLoginGotoError(message: string): LoginGotoErrorDecision {
  const errorMessage = String(message || '');
  const upperMessage = errorMessage.toUpperCase();
  const isNetworkError = NETWORK_ERROR_MARKERS.some((marker) => errorMessage.includes(marker));
  const isProxyError = PROXY_ERROR_MARKERS.some((marker) => upperMessage.includes(marker));

  return {
    isNetworkError,
    isProxyError,
    shouldRetry: isNetworkError,
  };
}

export function shouldNavigateToLoginPageFromCurrentUrl(value: string): boolean {
  return !isNidLoginSurface(value);
}

export function shouldVerifyExistingSessionAfterMissingLoginInput(value: string): boolean {
  return !isNidLoginSurface(value);
}

export function isLoginChallengeUrl(value: string): boolean {
  const lowerUrl = String(value || '').toLowerCase();
  if (!isNidAccountSurface(lowerUrl)) {
    return false;
  }

  return (
    lowerUrl.includes('protect') ||
    lowerUrl.includes('security') ||
    lowerUrl.includes('verification')
  );
}

export function shouldInspectLoginPageDom(value: string): boolean {
  return isNidAccountSurface(value);
}

export function shouldReportFinalLoginUrlFailure(value: string): boolean {
  const lowerUrl = String(value || '').toLowerCase();
  if (!lowerUrl || isBlankSurface(lowerUrl)) {
    return false;
  }

  if (isNidAccountSurface(lowerUrl) || lowerUrl.includes('login.naver')) {
    return true;
  }

  return lowerUrl.includes('/login') && !isNaverBlogDomainUrl(lowerUrl);
}

export function resolvePostLoginProgressUrl(
  currentUrl: string,
  loginUrl: string
): PostLoginProgressUrlDecision {
  const url = String(currentUrl || '');
  const lowerUrl = url.toLowerCase();

  if (isNidLoginSurface(url) || isBlankSurface(url) || lowerUrl === String(loginUrl || '').toLowerCase()) {
    return {
      status: 'pending',
      shouldMarkLoginSuccess: false,
      shouldRecheckAfterDelay: false,
    };
  }

  if (lowerUrl.includes('naver.com') && !hasGenericLoginMarker(url)) {
    return {
      status: 'success',
      shouldMarkLoginSuccess: true,
      shouldRecheckAfterDelay: false,
    };
  }

  if (!hasGenericLoginMarker(url)) {
    return {
      status: 'recheck-after-delay',
      shouldMarkLoginSuccess: false,
      shouldRecheckAfterDelay: true,
    };
  }

  return {
    status: 'pending',
    shouldMarkLoginSuccess: false,
    shouldRecheckAfterDelay: false,
  };
}

export function isPostLoginFinalCheckSuccess(value: string): boolean {
  const url = String(value || '');
  return !isNidLoginSurface(url) && !isBlankSurface(url) && !hasGenericLoginMarker(url);
}

export function isLoginProxyFailureBody(value: string): boolean {
  const bodyText = String(value || '').toLowerCase();

  return (
    bodyText.includes('407') ||
    bodyText.includes('작동하지 않습니다') ||
    bodyText.includes('proxy') ||
    bodyText.includes('프록시')
  );
}

export function isDeviceConfirmUrl(value: string): boolean {
  const lowerUrl = String(value || '').toLowerCase();
  return DEVICE_CONFIRM_URL_MARKERS.some((marker) => lowerUrl.includes(marker));
}

export function isDeviceConfirmBodyText(value: string): boolean {
  const text = String(value || '');
  return (
    (text.includes('새로운 기기') && text.includes('등록')) ||
    (text.includes('기기를 등록하면') && text.includes('알림'))
  );
}
