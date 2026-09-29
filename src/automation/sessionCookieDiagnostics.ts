/**
 * Read-only cookie diagnostics for login/session logs.
 *
 * Diagnostic reports could not tell whether a "login success" verdict or a
 * write-editor login redirect happened with or without Naver's session
 * cookies. This summarises cookie NAMES only (never values) so the next report
 * can separate "no session cookie at all" from "cookie present but rejected".
 */

export interface CookieNameLike {
  name: string;
  domain?: string;
}

export const NAVER_SESSION_COOKIE_NAMES = ['NID_AUT', 'NID_SES', 'NID_JKL', 'nid_inf'] as const;

export const NAVER_COOKIE_PROBE_URLS = [
  'https://nid.naver.com',
  'https://www.naver.com',
  'https://blog.naver.com',
] as const;

export function summarizeNaverSessionCookies(cookies: ReadonlyArray<CookieNameLike> | null | undefined): string {
  const list = Array.isArray(cookies) ? cookies : [];
  const names = new Set(list.map((cookie) => String(cookie?.name || '')));
  const flags = NAVER_SESSION_COOKIE_NAMES
    .map((name) => `${name}=${names.has(name) ? 'yes' : 'no'}`)
    .join(' ');
  return `total=${list.length} ${flags}`;
}

interface CookieReadablePage {
  cookies(...urls: string[]): Promise<ReadonlyArray<CookieNameLike>>;
}

export async function describeNaverSessionCookies(page: CookieReadablePage | null | undefined): Promise<string> {
  if (!page || typeof page.cookies !== 'function') {
    return 'cookies=unavailable';
  }
  try {
    const cookies = await page.cookies(...NAVER_COOKIE_PROBE_URLS);
    return summarizeNaverSessionCookies(cookies);
  } catch (error) {
    return `cookies=error:${(error as Error)?.message || 'unknown'}`;
  }
}
