/**
 * Dropshot interactive-login watcher (2026-11-12).
 *
 * Measured on the sister app (2026-11-12): after the Google sign-in finished, the session cookies and the session API
 * ("user" present) were there 2 s later, but the tab stayed on https://stock.dropshot.io/ko/logIn for good. Here the
 * normal check (dropshotBrowser.isLoggedIn) only accepts a tab on aistudio.dropshot.io, so a login that ends on the
 * stock sign-in page was never noticed and the window waited until the time-out.
 *
 * This module notices the login from the session itself (session API through the browser context, which is not a
 * cross-origin request, plus the long session cookie as a hint) and moves that tab to the board. The final verdict is
 * still the normal in-page check on the board.
 *
 * Safety rules:
 *  - Only a tab on a Dropshot host other than the board host is moved. Google / Kakao sign-in tabs are never touched.
 *  - A stale cookie with "nobody signed in" from the session API is ignored.
 *  - Board navigation attempts are limited (20 s apart, at most 4) so a slow site is never hammered.
 */

export type DropshotSessionVerdict = 'authenticated' | 'unauthenticated' | 'unavailable';

type NavigateToBoard = (page: unknown, onLog?: (message: string) => void) => Promise<boolean>;

export interface DropshotLoginTabDeps {
  navigateToBoard: NavigateToBoard;
  onLog?: (message: string) => void;
  now?: () => number;
}

const SESSION_API = 'https://aistudio.dropshot.io/api/auth/session';
const BOARD_HOST = 'aistudio.dropshot.io';
const DROPSHOT_HOST = /(^|\.)dropshot\.io$/i;
const BOARD_RETRY_MS = 20_000;
const MAX_BOARD_TRIES = 4;
const PERIODIC_PROBE_EVERY = 10;
const SESSION_PROBE_TIMEOUT_MS = 8_000;

/** Same rule as the in-page session check: a user with an id is a login; 401/403 or no user is "not logged in". */
export function classifyDropshotSessionReply(status: number, bodyText: string): DropshotSessionVerdict {
  if (status === 401 || status === 403) return 'unauthenticated';
  if (!(status >= 200 && status < 300)) return 'unavailable';
  let body: unknown;
  try {
    body = JSON.parse(String(bodyText ?? ''));
  } catch {
    return 'unavailable';
  }
  const id = body && typeof body === 'object' ? (body as { user?: { id?: unknown } }).user?.id : undefined;
  return typeof id === 'string' && id.trim().length > 0 ? 'authenticated' : 'unauthenticated';
}

/** The session cookie the site sets at sign-in (httpOnly, long value). */
export function isDropshotSessionCookie(cookie: unknown): boolean {
  const record = (cookie ?? {}) as { domain?: unknown; name?: unknown; value?: unknown };
  return /dropshot/i.test(String(record.domain || ''))
    && /^ds\.session-token/i.test(String(record.name || ''))
    && String(record.value || '').length > 100;
}

function hostOfPage(page: unknown): string {
  try {
    const url = (page as { url?: () => unknown } | null)?.url?.();
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hasSessionCookie(context: any): Promise<boolean> {
  try {
    return ((await context.cookies()) || []).some(isDropshotSessionCookie);
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function probeSession(context: any): Promise<DropshotSessionVerdict> {
  try {
    const response = await context.request.get(SESSION_API, { timeout: SESSION_PROBE_TIMEOUT_MS });
    const text = await response.text().catch(() => '');
    return classifyDropshotSessionReply(Number(response.status()), text);
  } catch {
    return 'unavailable';
  }
}

/**
 * Returns a function to call on every login-loop tick with the tab that was selected. It resolves true when it moved that
 * tab to the board because the session shows a login; the caller then runs the normal check again.
 */
export function createDropshotLoginTabAdvancer(deps: DropshotLoginTabDeps) {
  const now = deps.now ?? Date.now;
  let tickNo = 0;
  let boardTries = 0;
  let lastTryAt = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async function advance(context: any, page: unknown): Promise<boolean> {
    const host = hostOfPage(page);
    if (!DROPSHOT_HOST.test(host) || host === BOARD_HOST) return false;

    tickNo += 1;
    const cookie = await hasSessionCookie(context);
    const periodic = tickNo % PERIODIC_PROBE_EVERY === 1;
    if (!cookie && !periodic) return false;

    const verdict = await probeSession(context);
    if (verdict === 'unauthenticated') return false;
    if (verdict === 'unavailable' && !cookie) return false;

    const at = now();
    if (boardTries >= MAX_BOARD_TRIES || (boardTries > 0 && at - lastTryAt < BOARD_RETRY_MS)) return false;
    boardTries += 1;
    lastTryAt = at;

    deps.onLog?.('[리더스 나노바나나] 로그인 신호를 확인했습니다. 보드로 이동해 확인합니다.');
    try {
      return await deps.navigateToBoard(page, deps.onLog);
    } catch {
      return false;
    }
  };
}

const advancers = new WeakMap<object, ReturnType<typeof createDropshotLoginTabAdvancer>>();

/**
 * Login check for the interactive login loops: the normal in-page check first; if it says "not logged in" while the tab
 * stays on the sign-in page, look at the session itself, open the board, and check again.
 */
export async function detectDropshotLogin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  page: unknown,
  deps: { isLoggedIn: (page: unknown) => Promise<boolean>; navigateToBoard: NavigateToBoard; onLog?: (message: string) => void },
): Promise<boolean> {
  if (await deps.isLoggedIn(page)) return true;
  if (!context || typeof context !== 'object') return false;
  let advance = advancers.get(context);
  if (!advance) {
    advance = createDropshotLoginTabAdvancer({ navigateToBoard: deps.navigateToBoard, onLog: deps.onLog });
    advancers.set(context, advance);
  }
  return (await advance(context, page)) ? await deps.isLoggedIn(page) : false;
}
