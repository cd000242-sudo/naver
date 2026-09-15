export const FLOW_WORKSPACE_ENTRY_LABEL_RE =
  /Create with Google Flow|Try in Google Flow|Google Flow로 만들기|Flow 시작하기|Flow 사용해 보기/i;

const GOOGLE_SESSION_COOKIE_RE =
  /^(SID|HSID|SSID|SAPISID|__Secure-1PSID|__Secure-3PSID|LSID)$/;

export function hasGoogleSessionCookies(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => GOOGLE_SESSION_COOKIE_RE.test(String(name || '')));
}

/**
 * 프로젝트 페이지인가.
 *
 * [2026-09-15 사장님 실측] "이미지 생성이 엄청 느리다."
 * 로그를 보니 느린 게 아니라 되는 일을 실패로 읽고 있었다 —
 *   FLOW_PROJECT_REDIRECT_TIMEOUT: 30초 초과. 현재 URL: https://flow.google.com/project/c2300246-…
 * 이미 프로젝트 URL 에 도착했는데 판정이 `/tools/flow/project/` 만 보고 있었다.
 * Flow 가 labs.google/fx/tools/flow → flow.google.com 으로 옮겨가며 경로가 짧아진 탓이다.
 * 30초 대기 × 3회 × 2시도 = 이미지 한 장에 3분이 그냥 날아갔고, 그 끝에 브라우저를 통째로
 * 다시 만들었다.
 *
 * 그래서 호스트를 가리지 않고 "프로젝트 경로인가"만 본다. 다음에 또 옮겨가도 버틴다.
 */
export function isFlowProjectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== 'flow.google.com' && url.hostname !== 'labs.google') return false;
    // flow.google.com/project/<id> · labs.google/fx/tools/flow/project/<id> 둘 다 받는다.
    return /(^|\/)project\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
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
