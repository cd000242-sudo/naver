/**
 * 🍌 Dropshot browser helpers — stateless launch / login-detection / DOM controls.
 *
 * All functions here are pure with respect to module state: they take a page/params
 * and never touch the shared session cache (see dropshotSession.ts). This keeps them
 * safely reusable by both the page-lifecycle (dropshotCore) and login (dropshotLogin)
 * concerns.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  hasTrackedDropshotContexts,
  trackDropshotContext,
  untrackDropshotContext,
} from './dropshotSession.js';
import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';

export const BOARD_URL =
  'https://aistudio.dropshot.io/ko/workspace/board?panel=image&imageModelName=google/nano-banana-pro';
export const DROPSHOT_HOME_URL = 'https://aistudio.dropshot.io/ko';
export const DROPSHOT_LOGIN_URL =
  'https://aistudio.dropshot.io/ko/logIn?redirectTo=%2Fko%2Fworkspace%2Fboard';
const PROFILE_NAME = 'dropshot-profile';
const PROFILE_ROOT = '.better-life-naver';
export const PROMPT_SELECTOR =
  'textarea, [contenteditable="true"], div[role="textbox"]';

export type DropshotAuthPhase =
  | 'unknown'
  | 'checking'
  | 'login_required'
  | 'authenticated'
  | 'unlimited_ready'
  | 'expired'
  | 'error';

export interface DropshotLoginStatus {
  loggedIn: boolean;
  message: string;
  phase: DropshotAuthPhase;
  ready: boolean;
  code?: string;
}

export interface DropshotResult {
  ok: boolean;
  dataUrl: string;
  error?: string;
}

export interface DropshotControlState {
  unlimitedModeOn: boolean | null;
  zeroCost: boolean;
  generateButtonText: string;
  hasUnlimitedCopy: boolean;
  switchCount: number;
}

export interface DropshotLaunchOptions {
  /**
   * Debug-only escape hatch. App flows intentionally leave this off so a
   * completed login cannot make later generation windows visible again.
   */
  allowForceVisible?: boolean;
}

const DROPSHOT_AUTH_SESSION_PROBE_TIMEOUT_MS = 4_000;
const DROPSHOT_AUTH_SESSION_NODE_TIMEOUT_MARGIN_MS = 250;

export type DropshotAuthSessionProbeResult =
  | 'authenticated'
  | 'unauthenticated'
  | 'unavailable';

function isDropshotHost(value: string): boolean {
  const host = String(value || '').trim().toLowerCase().replace(/^\.+/, '');
  return host === 'dropshot.io' || host.endsWith('.dropshot.io');
}

function isDropshotOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isDropshotHost(url.hostname);
  } catch {
    return false;
  }
}

function isDropshotStudioOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'aistudio.dropshot.io';
  } catch {
    return false;
  }
}

export function isDropshotExplicitLoginUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!isDropshotHost(url.hostname)) return false;
    const path = url.pathname.toLowerCase();
    return path.includes('/login') || path.includes('/sign-in') || path.includes('/signin');
  } catch {
    return false;
  }
}

export function sanitizeDropshotErrorMessage(error: unknown, maxLength = 180): string {
  const safeLength = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 180;
  return sanitizeUserVisibleError(error).slice(0, safeLength);
}

export function isDropshotProfileLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:ProcessSingleton|SingletonLock|user data directory[^\n]*(?:already\s+)?in use|profile(?: directory)?[^\n]*(?:in use|locked))/i.test(message);
}

function isDropshotTargetClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:Target page, context or browser has been closed|Target closed|Page closed|Session closed)/i.test(message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isClosedAuxiliaryDropshotPage(primary: any, candidate: any, context: any): Promise<boolean> {
  let primaryClosed = false;
  let candidateClosed = false;
  try {
    primaryClosed = typeof primary?.isClosed === 'function' && Boolean(await primary.isClosed());
  } catch {
    primaryClosed = true;
  }
  if (primaryClosed) return false;

  try {
    candidateClosed = typeof candidate?.isClosed === 'function' && Boolean(await candidate.isClosed());
  } catch {
    candidateClosed = true;
  }

  try {
    const currentPages = typeof context?.pages === 'function' ? context.pages() : null;
    if (Array.isArray(currentPages)) {
      if (!currentPages.includes(primary)) return false;
      if (!currentPages.includes(candidate)) return true;
    }
  } catch {
    // The page-level closed signal below is still authoritative.
  }
  return candidateClosed;
}

/**
 * Navigation callers must confirm a rendered Dropshot document before
 * querying its same-origin server session verdict.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function waitForDropshotPageRender(page: any, timeoutMs = 12_000): Promise<boolean> {
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.max(500, Math.floor(timeoutMs))
    : 12_000;

  const renderedPredicate = () => {
    const host = String(window.location.hostname || '').toLowerCase();
    if (host !== 'dropshot.io' && !host.endsWith('.dropshot.io')) return false;

    const body = document.body;
    if (!body) return false;
    const bodyStyle = window.getComputedStyle(body);
    const bodyRect = body.getBoundingClientRect();
    if (
      bodyStyle.display === 'none' ||
      bodyStyle.visibility === 'hidden' ||
      bodyRect.width < 200 ||
      bodyRect.height < 120
    ) {
      return false;
    }

    const text = String(body.innerText || body.textContent || '').replace(/\s+/g, ' ').trim();
    const visibleUi = Array.from(
      body.querySelectorAll('main, nav, form, button, a, input, textarea, [role="button"], [role="textbox"]'),
    ).some((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(element as HTMLElement);
      return rect.width > 20 && rect.height > 12 && style.display !== 'none' && style.visibility !== 'hidden';
    });

    return text.length >= 12 && visibleUi;
  };

  try {
    await page.waitForFunction(renderedPredicate, undefined, {
      timeout: safeTimeout,
      polling: 250,
    });
  } catch {
    // Read once more below. The final poll can race the timeout boundary.
  }

  try {
    const pageUrl = typeof page?.url === 'function' ? String(page.url()) : '';
    if (!isDropshotOrigin(pageUrl)) return false;
    return !!(await page.evaluate(renderedPredicate));
  } catch {
    return false;
  }
}

/**
 * Opens Dropshot without allowing a slow SPA route to leak a raw page.goto
 * error into the login UI. The home page is enough to read the shared
 * Cognito session and gives interactive login a usable fallback screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function navigateToDropshotBoard(
  page: any,
  onLog?: (m: string) => void,
  timeoutMs = 45_000,
): Promise<boolean> {
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45_000;

  try {
    await page.goto(BOARD_URL, {
      waitUntil: 'commit',
      timeout: safeTimeout,
    });
    if (await waitForDropshotPageRender(page, Math.min(12_000, safeTimeout))) return true;

    onLog?.('[Dropshot] 보드 응답은 도착했지만 화면이 비어 있어 한 번 새로고침합니다.');
    if (typeof page?.reload === 'function') {
      try {
        await page.reload({
          waitUntil: 'commit',
          timeout: Math.min(safeTimeout, 30_000),
        });
        if (await waitForDropshotPageRender(page, Math.min(12_000, safeTimeout))) return true;
      } catch (reloadError) {
        onLog?.(`[Dropshot] 빈 화면 새로고침 실패: ${sanitizeDropshotErrorMessage(reloadError)}`);
      }
    }
  } catch (boardError) {
    const boardMessage = sanitizeDropshotErrorMessage(boardError);
    onLog?.(`[Dropshot] 보드 연결 지연, 로그인 홈으로 재시도합니다: ${boardMessage}`);
  }

  try {
    await page.goto(DROPSHOT_HOME_URL, {
      waitUntil: 'commit',
      timeout: Math.min(safeTimeout, 20_000),
    });
    const rendered = await waitForDropshotPageRender(page, Math.min(10_000, safeTimeout));
    if (!rendered) {
      onLog?.('[Dropshot] 로그인 홈 응답은 도착했지만 실제 화면이 렌더링되지 않았습니다.');
    }
    return rendered;
  } catch (homeError) {
    const homeMessage = sanitizeDropshotErrorMessage(homeError);
    onLog?.(`[Dropshot] 사이트 연결 실패. 브라우저 창은 유지합니다: ${homeMessage}`);
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function navigateToDropshotLogin(
  page: any,
  onLog?: (m: string) => void,
): Promise<boolean> {
  try {
    await page.goto(DROPSHOT_LOGIN_URL, {
      waitUntil: 'commit',
      timeout: 30_000,
    });
    const rendered = await waitForDropshotPageRender(page, 12_000);
    if (rendered) {
      onLog?.('[리더스 나노바나나] 구독 계정 로그인 화면을 열었습니다.');
    }
    return rendered;
  } catch (error) {
    onLog?.(`[Dropshot] 구독 로그인 화면 열기 실패: ${sanitizeDropshotErrorMessage(error)}`);
    return false;
  }
}

export function getProfileDir(): string {
  const dir = path.join(os.homedir(), PROFILE_ROOT, PROFILE_NAME);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readPageUrl(page: unknown): string {
  try {
    return typeof (page as { url?: unknown })?.url === 'function'
      ? String((page as { url: () => unknown }).url())
      : '';
  } catch {
    return '';
  }
}

/**
 * Reuse the newest Dropshot tab and remove only redundant blank tabs created
 * by a persistent Chrome launch. OAuth and other non-blank tabs are preserved.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function selectDropshotPage(context: any): Promise<any> {
  const currentPages = typeof context?.pages === 'function' ? context.pages() : [];
  const pages = Array.isArray(currentPages) ? currentPages : [];
  const studioPage = [...pages]
    .reverse()
    .find((page) => isDropshotStudioOrigin(readPageUrl(page)));
  const dropshotPage = studioPage || [...pages]
    .reverse()
    .find((page) => isDropshotOrigin(readPageUrl(page)));
  const nonBlankPage = [...pages]
    .reverse()
    .find((page) => {
      const url = readPageUrl(page);
      return url.length > 0 && url !== 'about:blank';
    });
  const selectedPage = dropshotPage || nonBlankPage || pages[0] || await context.newPage();
  const redundantBlankPages = pages.filter((page) => (
    page !== selectedPage && readPageUrl(page) === 'about:blank'
  ));

  await Promise.all(redundantBlankPages.map(async (page) => {
    try {
      // OAuth providers create popup pages as about:blank before their first
      // navigation. Only a top-level launch tab (no opener) is redundant.
      if (typeof page?.opener !== 'function') return;
      if (await page.opener()) return;
      await page.close();
    } catch {
      // A browser or OAuth provider can close the blank page concurrently.
    }
  }));
  return selectedPage;
}

export async function launchBrowser(
  profileDir: string,
  headless: boolean,
  options: DropshotLaunchOptions = {},
): Promise<unknown> {
  if (hasTrackedDropshotContexts()) {
    throw new Error(
      'DROPSHOT_SESSION_ACTIVE: 이전 자동화 브라우저가 아직 종료되지 않아 새 창을 열지 않습니다.',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chromium = (await import('patchright' as any)).chromium;
  } catch {
    chromium = (await import('playwright')).chromium;
  }

  const forceVisible =
    options.allowForceVisible === true &&
    String(process.env['VISIBLE_BROWSER'] || '').toLowerCase() === 'true';
  const effectiveHeadless = forceVisible ? false : headless;
  let lastLaunchError: unknown = null;

  const baseOptions = {
    headless: effectiveHeadless,
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--lang=ko-KR,ko',
      '--window-size=1280,900',
    ],
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    timezoneId: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
      } catch {
        return 'Asia/Seoul';
      }
    })(),
    ignoreDefaultArgs: ['--enable-automation'],
  };

  const stealthInit = () => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en'],
      configurable: true,
    });
  };

  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: any = channel ? { ...baseOptions, channel } : baseOptions;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx: any = await chromium.launchPersistentContext(profileDir, opts);
      trackDropshotContext(ctx);
      try {
        ctx.on('close', () => untrackDropshotContext(ctx));
      } catch {
        // The explicit close helpers also untrack contexts.
      }
      try {
        await ctx.addInitScript(stealthInit);
      } catch {
        // stealth init is best-effort
      }
      return ctx;
    } catch (error) {
      lastLaunchError = error;
      // A locked persistent profile cannot succeed with another browser
      // channel. Retrying would only flash more transient blank windows.
      if (isDropshotProfileLockError(error)) break;
      // try next channel
    }
  }
  const detail = sanitizeDropshotErrorMessage(lastLaunchError);
  throw new Error(
    isDropshotProfileLockError(lastLaunchError)
      ? 'DROPSHOT_BROWSER_LAUNCH_FAILED: 이전 리더스 나노바나나 자동화 창이 아직 종료되지 않았습니다. 잠시 후 다시 시도해주세요.'
      : `DROPSHOT_BROWSER_LAUNCH_FAILED: Chrome/Edge/Chromium 실행 실패${detail ? ` (${detail})` : ''}`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function minimizeDropshotWindow(
  page: any,
  onLog?: (m: string) => void,
): Promise<boolean> {
  try {
    const context = typeof page?.context === 'function' ? page.context() : null;
    if (!context || typeof context.newCDPSession !== 'function') return false;
    let contextPages: any[] = [];
    try {
      const pages = typeof context.pages === 'function' ? context.pages() : [];
      if (Array.isArray(pages)) contextPages = pages;
    } catch {
      // The authenticated page is still attempted below.
    }

    const candidates = [...new Set([page, ...contextPages].filter(Boolean))];
    const minimizedWindowIds = new Set<number>();
    for (const candidate of candidates) {
      let cdpSession: any = null;
      try {
        cdpSession = await context.newCDPSession(candidate);
        const { windowId } = await cdpSession.send('Browser.getWindowForTarget');
        if (minimizedWindowIds.has(windowId)) continue;
        try {
          await cdpSession.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'minimized' },
          });
        } catch {
          // Chromium rejects some direct maximized/fullscreen → minimized state
          // transitions. Normalize once, then retry on the same window/context.
          await cdpSession.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'normal' },
          });
          await cdpSession.send('Browser.setWindowBounds', {
            windowId,
            bounds: { windowState: 'minimized' },
          });
        }
        minimizedWindowIds.add(windowId);
      } catch (error) {
        // OAuth popups normally close themselves as the provider redirects back
        // to Dropshot. If the authenticated main window is already minimized,
        // that normal popup teardown must not turn the whole hide operation into
        // a failure and force the dedicated profile to close/reopen.
        if (
          candidate !== page
          && isDropshotTargetClosedError(error)
          && await isClosedAuxiliaryDropshotPage(page, candidate, context)
        ) continue;
        throw error;
      } finally {
        try {
          await cdpSession?.detach?.();
        } catch {
          // A popup can close while its CDP session is detaching.
        }
      }
    }
    if (minimizedWindowIds.size === 0) return false;
    onLog?.('[리더스 나노바나나] 로그인 관련 창을 모두 최소화하고 동일한 무제한 세션을 유지합니다.');
    return true;
  } catch (error) {
    onLog?.(`[Dropshot] 로그인 창 최소화 실패: ${sanitizeDropshotErrorMessage(error)}`);
    return false;
  }
}

/**
 * Query Dropshot's current Auth.js session source of truth inside the page.
 * Only a three-state verdict crosses the browser boundary; session/user/token
 * contents never leave the Dropshot origin and are never written to logs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function probeDropshotAuthSession(
  page: any,
  timeoutMs = DROPSHOT_AUTH_SESSION_PROBE_TIMEOUT_MS,
): Promise<DropshotAuthSessionProbeResult> {
  if (!isDropshotStudioOrigin(readPageUrl(page))) return 'unauthenticated';

  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.max(500, Math.min(10_000, Math.floor(timeoutMs)))
    : DROPSHOT_AUTH_SESSION_PROBE_TIMEOUT_MS;

  let nodeTimeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const browserProbe = page.evaluate(async ({ timeoutMs: browserTimeoutMs }: { timeoutMs: number }) => {
      if (window.location.origin !== 'https://aistudio.dropshot.io') return 'unauthenticated';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), browserTimeoutMs);
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) {
          return response.status === 401 || response.status === 403
            ? 'unauthenticated'
            : 'unavailable';
        }

        const session = await response.json();
        return typeof session?.user?.id === 'string' && session.user.id.trim().length > 0
          ? 'authenticated'
          : 'unauthenticated';
      } catch {
        return 'unavailable';
      } finally {
        clearTimeout(timer);
      }
    }, { timeoutMs: safeTimeoutMs });
    const nodeTimeoutProbe = new Promise<DropshotAuthSessionProbeResult>((resolve) => {
      nodeTimeout = setTimeout(
        () => resolve('unavailable'),
        safeTimeoutMs + DROPSHOT_AUTH_SESSION_NODE_TIMEOUT_MARGIN_MS,
      );
    });
    const result = await Promise.race([browserProbe, nodeTimeoutProbe]);

    return result === 'authenticated' || result === 'unauthenticated'
      ? result
      : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    if (nodeTimeout) clearTimeout(nodeTimeout);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isLoggedIn(page: any): Promise<boolean> {
  try {
    const pageUrl = typeof page?.url === 'function' ? String(page.url()) : '';
    if (!isDropshotStudioOrigin(pageUrl)) return false;
    return (await probeDropshotAuthSession(page)) === 'authenticated';
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isImageWorkspaceReady(page: any): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const isVisible = (el: Element): boolean => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el as HTMLElement);
        return rect.width > 80 && rect.height > 20 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const inputs = Array.from(
        document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]'),
      );
      return inputs.some(isVisible);
    });
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clickImageEntry(page: any): Promise<boolean> {
  return await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll('a, button, [role="button"]'),
    ) as HTMLElement[];
    const target = candidates.find((el) => {
      const text = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
      return /이미지\s*생성|AI\s*이미지|image\s*generation|create\s*image/i.test(text);
    });
    if (!target) return false;
    target.click();
    return true;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function openDropshotImageWorkspace(
  page: any,
  onLog?: (m: string) => void,
): Promise<boolean> {
  try {
    if (!page.url().includes('workspace/board') || !page.url().includes('panel=image')) {
      if (!(await navigateToDropshotBoard(page, onLog))) return false;
      await new Promise((r) => setTimeout(r, 4000));
    }

    if (await isImageWorkspaceReady(page)) return true;

    const clicked = await clickImageEntry(page);
    if (clicked) {
      onLog?.('[dropshot] image workspace entry clicked');
      await new Promise((r) => setTimeout(r, 5000));
      if (await isImageWorkspaceReady(page)) return true;
    }

    if (!(await navigateToDropshotBoard(page, onLog))) return false;
    await new Promise((r) => setTimeout(r, 5000));
    return await isImageWorkspaceReady(page);
  } catch (e) {
    onLog?.(`[dropshot] workspace open failed: ${(e as Error).message?.slice(0, 120)}`);
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readDropshotControlState(page: any): Promise<DropshotControlState> {
  return await page.evaluate(() => {
    const unlimitedTerms = ['\uBB34\uC81C\uD55C', '\uD55C\uACC4\uC5C6', 'unlimited'];
    const generateTerms = [
      '\uC774\uBBF8\uC9C0 \uC0DD\uC131\uD558\uAE30',
      '\uC0DD\uC131\uD558\uAE30',
      'generate',
      'create image',
      'submit',
      'send',
    ];
    const compact = (value: string): string => String(value || '').replace(/\s+/g, ' ').trim();
    const isVisible = (el: Element): boolean => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const textAround = (el: Element): string => {
      const parts: string[] = [];
      let current: Element | null = el;
      for (let depth = 0; current && depth < 5; depth++) {
        parts.push((current as HTMLElement).innerText || current.textContent || '');
        current = current.parentElement;
      }
      const prev = (el as HTMLElement).previousElementSibling;
      const next = (el as HTMLElement).nextElementSibling;
      if (prev) parts.push((prev as HTMLElement).innerText || prev.textContent || '');
      if (next) parts.push((next as HTMLElement).innerText || next.textContent || '');
      return compact(parts.join(' '));
    };
    const bodyText = compact(document.body?.innerText || '');
    const switchCandidates = Array.from(
      document.querySelectorAll('input[role="switch"], [role="switch"], input[type="checkbox"]'),
    )
      .filter((el) => el instanceof HTMLElement)
      .map((el) => {
        const input =
          el instanceof HTMLInputElement
            ? el
            : el.querySelector('input[role="switch"], input[type="checkbox"]');
        const ariaChecked =
          el.getAttribute('aria-checked') ||
          input?.getAttribute('aria-checked') ||
          '';
        const dataState = el.getAttribute('data-state') || input?.getAttribute('data-state') || '';
        const on =
          (input instanceof HTMLInputElement && input.checked) ||
          ariaChecked === 'true' ||
          dataState === 'checked' ||
          dataState === 'on';
        const text = textAround(el);
        const lower = text.toLowerCase();
        const unlimitedScore = unlimitedTerms.reduce(
          (score, term) => score + (lower.includes(term.toLowerCase()) ? 1 : 0),
          0,
        );
        return { on: !!on, text, unlimitedScore };
      });
    const unlimitedSwitch =
      switchCandidates.find((candidate) => candidate.unlimitedScore > 0) ||
      (switchCandidates.length === 1 ? switchCandidates[0] : undefined);

    const promptEl = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]'),
    ).find(isVisible) as HTMLElement | undefined;
    const promptRect = promptEl?.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const generateButton = buttons
      .filter((button) => !button.disabled && isVisible(button))
      .map((button) => {
        const text = compact(
          `${button.innerText || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`,
        );
        const lower = text.toLowerCase();
        const isGenerate = generateTerms.some((term) => lower.includes(term.toLowerCase()));
        if (!isGenerate) return null;
        const rect = button.getBoundingClientRect();
        const distance = promptRect
          ? Math.abs(rect.left - promptRect.left) + Math.abs(rect.top - promptRect.bottom)
          : 0;
        let score = 0;
        if (text.includes('\uC0DD\uC131\uD558\uAE30')) score += 1000;
        if (text.includes('\uC774\uBBF8\uC9C0')) score += 200;
        if (promptRect && rect.top >= promptRect.bottom - 30) score += 300;
        if (promptRect && rect.right >= promptRect.left - 40 && rect.left <= promptRect.right + 40) score += 300;
        score -= distance / 10;
        return { text, score };
      })
      .filter((candidate): candidate is { text: string; score: number } => !!candidate)
      .sort((a, b) => b.score - a.score)[0];

    const generateButtonText = generateButton?.text || '';
    const costNumbers = generateButtonText.match(/\d+/g) || [];
    const zeroCost =
      costNumbers.some((value) => Number(value) === 0) ||
      /free/i.test(generateButtonText) ||
      generateButtonText.includes('\uBB34\uB8CC') ||
      generateButtonText.includes('\uBB34\uC81C\uD55C');

    return {
      unlimitedModeOn: unlimitedSwitch ? unlimitedSwitch.on : null,
      zeroCost,
      generateButtonText,
      hasUnlimitedCopy: unlimitedTerms.some((term) => bodyText.toLowerCase().includes(term.toLowerCase())),
      switchCount: switchCandidates.length,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForDropshotControlConfirmation(
  page: any,
  timeoutMs = 12_000,
): Promise<DropshotControlState> {
  const deadline = Date.now() + timeoutMs;
  let lastState: DropshotControlState = {
    unlimitedModeOn: null,
    zeroCost: false,
    generateButtonText: '',
    hasUnlimitedCopy: false,
    switchCount: 0,
  };

  while (Date.now() < deadline) {
    const pageUrl = typeof page?.url === 'function' ? String(page.url()) : '';
    if (isDropshotExplicitLoginUrl(pageUrl)) {
      throw new Error(
        'Dropshot subscription login is required before unlimited mode can be confirmed.',
      );
    }

    try {
      lastState = await readDropshotControlState(page);
      if (lastState.unlimitedModeOn === true && lastState.zeroCost) return lastState;
    } catch {
      // A toggle can replace the SPA document or redirect to the subscription login page.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return lastState;
}

/** Ensure unlimited mode toggle ON + counter set to 1 (idempotent). */
export async function ensureDropshotControls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  onLog?: (m: string) => void,
): Promise<void> {
  try {
    // Set the count before enabling unlimited mode because the toggle may
    // replace the SPA document or redirect to the subscription login page.
    await page.evaluate(() => {
      const numberInputs = Array.from(
        document.querySelectorAll('input[type="number"]'),
      );
      for (const inp of numberInputs) {
        const v = Number((inp as HTMLInputElement).value);
        if (v >= 2 && v <= 10) {
          const descriptor = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          );
          const setter = descriptor?.set;
          if (setter) setter.call(inp, '1');
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    // 1. Enable unlimited mode toggle. Dropshot changes its switch markup often,
    // so identify the target by nearby "unlimited" copy when possible and fall
    // back to the single visible switch only when there is no ambiguity.
    const toggleResult = await page.evaluate(() => {
      const unlimitedTerms = ['\uBB34\uC81C\uD55C', '\uD55C\uACC4\uC5C6', 'unlimited'];
      const compact = (value: string): string => String(value || '').replace(/\s+/g, ' ').trim();
      const textAround = (el: Element): string => {
        const parts: string[] = [];
        let current: Element | null = el;
        for (let depth = 0; current && depth < 5; depth++) {
          parts.push((current as HTMLElement).innerText || current.textContent || '');
          current = current.parentElement;
        }
        const prev = (el as HTMLElement).previousElementSibling;
        const next = (el as HTMLElement).nextElementSibling;
        if (prev) parts.push((prev as HTMLElement).innerText || prev.textContent || '');
        if (next) parts.push((next as HTMLElement).innerText || next.textContent || '');
        return compact(parts.join(' '));
      };
      const switchCandidates = Array.from(
        document.querySelectorAll('input[role="switch"], [role="switch"], input[type="checkbox"]'),
      )
        .filter((el) => el instanceof HTMLElement)
        .map((el) => {
          const input =
            el instanceof HTMLInputElement
              ? el
              : el.querySelector('input[role="switch"], input[type="checkbox"]');
          const ariaChecked =
            el.getAttribute('aria-checked') ||
            input?.getAttribute('aria-checked') ||
            '';
          const dataState = el.getAttribute('data-state') || input?.getAttribute('data-state') || '';
          const on =
            (input instanceof HTMLInputElement && input.checked) ||
            ariaChecked === 'true' ||
            dataState === 'checked' ||
            dataState === 'on';
          const text = textAround(el);
          const lower = text.toLowerCase();
          const unlimitedScore = unlimitedTerms.reduce(
            (score, term) => score + (lower.includes(term.toLowerCase()) ? 1 : 0),
            0,
          );
          const clickTarget =
            el.closest('label') ||
            el.closest('button') ||
            el.closest('[role="switch"]') ||
            el.parentElement ||
            el;
          return { el, on: !!on, text, unlimitedScore, clickTarget };
        });
      const target =
        switchCandidates.find((candidate) => candidate.unlimitedScore > 0) ||
        (switchCandidates.length === 1 ? switchCandidates[0] : undefined);
      if (!target) return { found: false, toggled: false, on: null, switchCount: switchCandidates.length };
      if (!target.on) {
        (target.clickTarget as HTMLElement).click();
        return { found: true, toggled: true, on: false, switchCount: switchCandidates.length };
      }
      return { found: true, toggled: false, on: true, switchCount: switchCandidates.length };
    });
    if (toggleResult.toggled) {
      onLog?.('[dropshot] unlimited mode switch enabled');
    }

    const state = await waitForDropshotControlConfirmation(page);
    const switchConfirmed = state.unlimitedModeOn === true;
    if (!switchConfirmed || !state.zeroCost) {
      throw new Error(
        `Dropshot unlimited/zero-cost mode was not confirmed; refusing to generate to avoid coin spend. ` +
          `switch=${state.unlimitedModeOn}, zeroCost=${state.zeroCost}, button="${state.generateButtonText || '(none)'}"`,
      );
    }
    onLog?.(
      `[dropshot] unlimited/zero-cost confirmed: ${state.generateButtonText || 'generate button found'}`,
    );
  } catch (e) {
    const message = (e as Error).message || String(e);
    if (message.includes('refusing to generate to avoid coin spend')) {
      throw e;
    }
    const safeMessage = sanitizeDropshotErrorMessage(e, 220);
    onLog?.(`[리더스 나노바나나] 무제한 모드 확인 실패: ${safeMessage}`);
    throw new Error(
      `Dropshot unlimited/zero-cost mode was not confirmed; refusing to generate to avoid coin spend. ${safeMessage}`,
    );
  }
}

/** Download a URL as a buffer suitable for setInputFiles. */
export async function downloadAsFileBuffer(
  url: string,
): Promise<{ name: string; mimeType: string; buffer: Buffer } | null> {
  try {
    const raw = String(url || '').trim();
    const localPath = /^file:\/\//i.test(raw) ? fileURLToPath(raw) : raw;
    if (/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(localPath) && fs.existsSync(localPath)) {
      const buffer = fs.readFileSync(localPath);
      const ext = path.extname(localPath).toLowerCase();
      const mimeType = ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
      return { name: path.basename(localPath), mimeType, buffer };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct =
      (res.headers.get('content-type') || 'image/jpeg').split(';')[0]?.trim() ??
      'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    return { name: `ref-${Date.now()}.${ext}`, mimeType: ct, buffer: buf };
  } catch (e) {
    console.warn(
      '[dropshotCore] reference download failed:',
      (e as Error)?.message,
    );
    return null;
  }
}

/** Build an enhanced + variation-seeded prompt (§12.3). */
export function buildDropshotPrompt(raw: string): string {
  const normalized = String(raw || '').trim();
  const hasKorean = /[가-힣]/.test(normalized);
  const isShort = normalized.length < 50;
  const enhanced =
    hasKorean && isShort
      ? `${normalized}. Create a realistic 4K product photograph that directly visualizes this topic, with natural lighting, a context-appropriate setting, and no text.`
      : normalized;

  const nonce = Math.random().toString(36).slice(2, 8);
  const variationSeed = Date.now().toString(36);
  return (
    enhanced +
    ` (variation-${variationSeed}-${nonce}: use a distinct camera angle, viewpoint, composition, lighting, and background; do not duplicate previous outputs.)`
  );
}
