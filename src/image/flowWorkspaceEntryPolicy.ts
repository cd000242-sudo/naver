export const FLOW_WORKSPACE_ENTRY_LABEL_RE =
  /Create with Google Flow|Try in Google Flow|Google Flow로 만들기|Flow 시작하기|Flow 사용해 보기/i;

const GOOGLE_SESSION_COOKIE_RE =
  /^(SID|HSID|SSID|SAPISID|__Secure-1PSID|__Secure-3PSID|LSID)$/;

export function hasGoogleSessionCookies(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => GOOGLE_SESSION_COOKIE_RE.test(String(name || '')));
}

export function isFlowWorkspaceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (url.hostname === 'flow.google.com') return true;
    return url.hostname === 'labs.google'
      && (url.pathname === '/fx' || url.pathname.startsWith('/fx/'));
  } catch {
    return false;
  }
}
