/**
 * 🍌 Dropshot image engine — page lifecycle + public facade.
 *
 * Uses Playwright UI automation to access the nano-banana-pro model on dropshot.io.
 * Direct API access is blocked by Cognito token refresh flow inside the page JS —
 * UI automation is the only viable approach (verified: 11 API attempts all failed 401).
 *
 * Cost (accurate):
 * - Pro subscribers (monthly ₩74,000–₩99,000): zero marginal cost per image (isUnlimited: true)
 * - Free users: creditCost 75/image within daily/monthly quota
 *
 * Internal identifier: dropshot
 * User-facing label: 🍌 리더스 나노바나나 무제한
 *
 * This module owns the shared page-acquisition (ensurePage) and re-exports the
 * browser/login/session helpers so existing importers keep a single entry point.
 */

import {
  BOARD_URL,
  launchBrowser,
  isLoggedIn,
  openDropshotImageWorkspace,
  getProfileDir,
} from './dropshotBrowser.js';
import { getCachedPage, getCachedContext, setCached, clearCached } from './dropshotSession.js';

// Public facade re-exports (importers depend on dropshotCore as the single entry point).
export {
  ensureDropshotControls,
  downloadAsFileBuffer,
  buildDropshotPrompt,
  openDropshotImageWorkspace,
  PROMPT_SELECTOR,
  type DropshotResult,
  type DropshotLoginStatus,
} from './dropshotBrowser.js';
export {
  getGenerationChain,
  setGenerationChain,
  invalidateBrowserCache,
  closeBrowserCache,
} from './dropshotSession.js';
export { checkDropshotLogin, dropshotLogin } from './dropshotLogin.js';

let _ensurePagePromise: Promise<unknown> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePage(onLog?: (m: string) => void): Promise<any> {
  if (_ensurePagePromise) {
    await _ensurePagePromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedPage = getCachedPage();
    if (cachedPage && getCachedContext()) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (cachedPage as any).evaluate(() => document.readyState);
        if (await isLoggedIn(cachedPage)) {
          return cachedPage;
        }
        clearCached();
      } catch {
        // fall through to re-init
      }
    }
  }

  let lockResolve!: (value: unknown) => void;
  _ensurePagePromise = new Promise<unknown>((r) => {
    lockResolve = r;
  });
  try {
    return await _ensurePageInternal(onLog);
  } finally {
    _ensurePagePromise = null;
    lockResolve(undefined);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _ensurePageInternal(onLog?: (m: string) => void): Promise<any> {
  const cachedPage = getCachedPage();
  if (cachedPage && getCachedContext()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cachedPage as any).evaluate(() => document.readyState);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await openDropshotImageWorkspace(cachedPage, onLog);
      if (await isLoggedIn(cachedPage)) {
        return cachedPage;
      }
      clearCached();
    } catch {
      clearCached();
    }
  }

  const profileDir = getProfileDir();
  onLog?.('[리더스 나노바나나] 브라우저 준비 중...');

  // Attempt 1: headless session check
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any = await launchBrowser(profileDir, true);
  let page = context.pages()[0] || (await context.newPage());
  await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 5000));
  await openDropshotImageWorkspace(page, onLog);

  if (await isLoggedIn(page)) {
    onLog?.('[리더스 나노바나나] 로그인 세션 확인');
    setCached(context, page);
    return page;
  }

  // Attempt 2: show visible window for login (max 5 minutes)
  onLog?.('[리더스 나노바나나] 로그인 필요 → 브라우저 표시 (최대 5분)');
  await context.close();
  context = await launchBrowser(profileDir, false);
  page = context.pages()[0] || (await context.newPage());
    await page.goto(BOARD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

  let loggedIn = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const pages = context.pages();
      page =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages.find((p: any) => {
          try {
            return p.url().includes('dropshot.io');
          } catch {
            return false;
          }
        }) || pages[pages.length - 1];
      if (await isLoggedIn(page)) {
        loggedIn = true;
        await openDropshotImageWorkspace(page, onLog);
        break;
      }
    } catch {
      continue;
    }
    if (i % 6 === 5) {
      onLog?.(
        `[리더스 나노바나나] 로그인 대기 (${Math.round(((i + 1) * 5) / 60)}분 경과)`,
      );
    }
  }

  if (!loggedIn) {
    await context.close();
    throw new Error('[리더스 나노바나나] 로그인 시간 초과');
  }

  // Attempt 3: close visible, re-enter headless
  await context.close();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hctx: any = await launchBrowser(profileDir, true);
  const hpage = hctx.pages()[0] || (await hctx.newPage());
  await hpage.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 4000));
  await openDropshotImageWorkspace(hpage, onLog);
  if (!(await isLoggedIn(hpage))) {
    await hctx.close();
    clearCached();
    throw new Error('[리더스 나노바나나 무제한] 로그인 세션 저장 확인 실패 — 로그인 완료 후 다시 시도해주세요.');
  }

  setCached(hctx, hpage);
  onLog?.('[리더스 나노바나나] 준비 완료');
  return hpage;
}
