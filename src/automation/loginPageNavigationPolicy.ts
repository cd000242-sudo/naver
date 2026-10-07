

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

/** Only these known HTTPS origins can supply session evidence. Query text is never an origin. */
export function parseNaverSessionUrl(value: string | undefined): URL | null {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return null;
    return ['naver.com', 'www.naver.com', 'blog.naver.com', 'm.blog.naver.com', 'nid.naver.com', 'login.naver.com'].includes(parsed.hostname) ? parsed : null;
  } catch { return null; }
}

export function isNaverSessionLoginUrl(value: string | undefined): boolean {
  const parsed = parseNaverSessionUrl(value);
  return Boolean(parsed && (parsed.hostname === 'login.naver.com'
    || (parsed.hostname === 'nid.naver.com' && /^\/(?:nidlogin(?:\.login)?(?:\/|$)|login(?:\/|$))/i.test(parsed.pathname))));
}

function isNidLoginSurface(value: string): boolean { return isNaverSessionLoginUrl(value); }
function isNidAccountSurface(value: string): boolean { return parseNaverSessionUrl(value)?.hostname === 'nid.naver.com'; }
function isBlankSurface(value: string): boolean { return String(value || '').toLowerCase() === 'about:blank'; }
function hasGenericLoginMarker(value: string): boolean {
  try { return /(?:^|\/)login(?:\/|$)/i.test(new URL(value).pathname); } catch { return false; }
}
function isTrustedPostLoginDestination(value: string): boolean {
  return Boolean(parseNaverSessionUrl(value)) && !isNidLoginSurface(value)
    && !hasGenericLoginMarker(value) && !isLoginChallengeUrl(value);
}

export function resolveLoginPageNavigationUrl(value: string): LoginPageNavigationDecision {
  if (isNidLoginSurface(value)) return { status: 'login-page-loaded', isLoginPageLoaded: true, isAlreadyLoggedInRedirect: false };
  if (isTrustedPostLoginDestination(value)) return { status: 'already-logged-in-redirect', isLoginPageLoaded: false, isAlreadyLoggedInRedirect: true };
  return { status: 'unexpected', isLoginPageLoaded: false, isAlreadyLoggedInRedirect: false };
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
  return !isNidLoginSurface(value) && !isLoginChallengeUrl(value);
}

export function shouldVerifyExistingSessionAfterMissingLoginInput(value: string): boolean {
  return !isNidLoginSurface(value) && !isLoginChallengeUrl(value);
}

export function isLoginProtectionUrl(value: string | undefined): boolean {
  const parsed = parseNaverSessionUrl(value);
  return Boolean(parsed?.hostname === 'nid.naver.com' && /(?:protect|idsafety)/i.test(parsed.pathname));
}

/** Protection remains a challenge for existing boolean callers. */
export function isLoginChallengeUrl(value: string): boolean {
  const parsed = parseNaverSessionUrl(value);
  return Boolean(parsed?.hostname === 'nid.naver.com' && (
    isLoginProtectionUrl(value) || /(?:security|verification|captcha)/i.test(parsed.pathname)
    || DEVICE_CONFIRM_URL_MARKERS.some(marker => parsed.pathname.toLowerCase().includes(marker))
  ));
}

export function shouldInspectLoginPageDom(value: string): boolean {
  return isNidAccountSurface(value);
}

export function shouldReportFinalLoginUrlFailure(value: string): boolean {
  if (!value || isBlankSurface(value)) return false;
  const parsed = parseNaverSessionUrl(value);
  if (isNidAccountSurface(value) || parsed?.hostname === 'login.naver.com') return true;
  return hasGenericLoginMarker(value) && !['blog.naver.com', 'm.blog.naver.com'].includes(parsed?.hostname || '');
}

export function resolvePostLoginProgressUrl(
  currentUrl: string,
  loginUrl: string
): PostLoginProgressUrlDecision {
  const url = String(currentUrl || '');
  const lowerUrl = url.toLowerCase();

  // A challenge page (보호조치/본인인증) is on naver.com and usually carries no 'login'
  // marker, so it used to fall through to 'success' — the caller then saved cookies,
  // opened the editor, bounced back to nidlogin and typed the password again. Keep it
  // pending so the caller's challenge branch gets to run and wait for the user.
  if (
    isNidLoginSurface(url) ||
    isBlankSurface(url) ||
    lowerUrl === String(loginUrl || '').toLowerCase() ||
    isLoginChallengeUrl(url)
  ) {
    return {
      status: 'pending',
      shouldMarkLoginSuccess: false,
      shouldRecheckAfterDelay: false,
    };
  }

  if (isTrustedPostLoginDestination(url)) {
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
  return isTrustedPostLoginDestination(value);
}

export type LoginClickResult = 'success' | 'error' | 'challenge' | 'pending';

/**
 * [2026-09-30] After the login click, `waitForClickResponse` already reports 'success' once the page has
 * left nid.naver.com. Waiting for `waitForNavigation` on top of that just burns its 20s timeout (measured
 * 22s per login), because the navigation it is waiting for has already happened.
 */
export function shouldAwaitPostLoginNavigation(clickResult: LoginClickResult): boolean {
  return clickResult !== 'success';
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
  const parsed = parseNaverSessionUrl(value);
  return Boolean(parsed?.hostname === 'nid.naver.com' && DEVICE_CONFIRM_URL_MARKERS.some(marker => parsed.pathname.toLowerCase().includes(marker)));
}

export function isDeviceConfirmBodyText(value: string): boolean {
  const text = String(value || '');
  return (
    (text.includes('새로운 기기') && text.includes('등록')) ||
    (text.includes('기기를 등록하면') && text.includes('알림'))
  );
}
