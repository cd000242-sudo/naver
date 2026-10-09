/**
 * [2026-10-09] 저장 쿠키 파일은 서버가 로그인을 확인한 순간에만 쓰이고, 크롬은 그 뒤에도 프로필 쿠키를 계속 갱신한다.
 * 살아 있는 NID_AUT 가 이미 있는 프로필을 더 오래된 파일로 덮어쓰면 스스로 로그아웃시킬 수 있다.
 * 세션 쿠키 계정은 크롬을 끄면 NID_AUT 가 사라지므로 그때는 파일을 넣는다.
 */
export interface CookieLike { name: string; value?: string; expires?: number }

export function shouldKeepProfileCookies(profileCookies: readonly CookieLike[], nowSeconds: number = Date.now() / 1000): boolean {
  return profileCookies.some((cookie) => cookie.name === 'NID_AUT' && Boolean(cookie.value)
    && (cookie.expires === undefined || cookie.expires === -1 || cookie.expires > nowSeconds));
}

/**
 * [2026-10-09 사장님 "한 번 로그인하면 세션 쿠키가 유지되게"] "로그인 상태 유지" 없이 로그인하면 네이버 로그인 쿠키가
 * 세션 쿠키라 크롬을 닫으면 지워졌다. 실측(자동화 크롬): 크롬 "이전 세션 계속하기"로는 남지 않았고 만료일을 붙이면 남았다.
 * 값·도메인·보안 속성은 그대로 두고 만료일만 붙인다(만료일은 브라우저 안의 정보라 네이버로 전송되지 않는다).
 */
export const KEEP_LOGIN_DAYS = 30;
const LOGIN_COOKIE_NAMES = new Set(['NID_AUT', 'NID_SES', 'NID_JKL']);
export interface BrowserCookieLike extends CookieLike {
  domain?: string; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: string; session?: boolean;
}
export interface PersistentLoginCookie {
  name: string; value: string; expires: number;
  domain?: string; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None';
}

export function buildPersistentLoginCookies(cookies: readonly BrowserCookieLike[], nowSeconds: number = Date.now() / 1000): PersistentLoginCookie[] {
  const until = Math.floor(nowSeconds) + KEEP_LOGIN_DAYS * 24 * 3600;
  return cookies
    .filter((cookie) => LOGIN_COOKIE_NAMES.has(cookie.name) && Boolean(cookie.value)
      && (cookie.session === true || cookie.expires === undefined || cookie.expires === -1))
    .map((cookie) => ({
      name: cookie.name, value: cookie.value as string, domain: cookie.domain, path: cookie.path,
      httpOnly: cookie.httpOnly, secure: cookie.secure, expires: until,
      // puppeteer 는 'Default' 도 돌려주지만 다시 넣을 때는 Strict/Lax/None 만 받는다.
      sameSite: cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax' || cookie.sameSite === 'None' ? cookie.sameSite : undefined,
    }));
}
