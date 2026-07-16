/**
 * Dropshot image engine page lifecycle and compatibility facade.
 * Persistent contexts are cached only after auth and workspace readiness pass.
 */

import {
  ensureDropshotControls,
  getProfileDir,
  isLoggedIn,
  launchBrowser,
  navigateToDropshotBoard,
  openDropshotImageWorkspace,
  selectDropshotPage,
} from './dropshotBrowser.js';
import { reopenDropshotHeadlessGenerationContext } from './dropshotHeadlessSession.js';
import {
  clearCached,
  closeTrackedDropshotContext,
  closeBrowserCache,
  DropshotCleanupIncompleteError,
  getCachedContext,
  getCachedPage,
  setCached,
} from './dropshotSession.js';

export {
  buildDropshotPrompt,
  downloadAsFileBuffer,
  openDropshotImageWorkspace,
  PROMPT_SELECTOR,
  sanitizeDropshotErrorMessage,
  type DropshotLoginStatus,
  type DropshotResult,
} from './dropshotBrowser.js';
export { ensureDropshotControls };
export {
  closeBrowserCache,
  closeAllDropshotContexts,
  endDropshotGeneration,
  getDropshotGenerationEpoch,
  getGenerationChain,
  invalidateBrowserCache,
  isDropshotGenerationAborted,
  setGenerationChain,
  tryBeginDropshotGeneration,
} from './dropshotSession.js';
export { checkDropshotLogin, dropshotLogin } from './dropshotLogin.js';

let _ensurePagePromise: Promise<unknown> | null = null;

async function closeContext(context: unknown): Promise<void> {
  const closed = await closeTrackedDropshotContext(context);
  if (!closed) {
    throw new DropshotCleanupIncompleteError();
  }
}

export function assertDropshotNavigationOpened(opened: boolean): void {
  if (!opened) {
    throw new Error('Dropshot 사이트 연결 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getHealthyCachedPage(onLog?: (m: string) => void): Promise<any | null> {
  const page = getCachedPage();
  const context = getCachedContext();
  if (!page || !context) {
    if (page || context) await closeBrowserCache();
    return null;
  }

  try {
    await (page as any).evaluate(() => document.readyState);
    if (!(await isLoggedIn(page))) {
      await closeBrowserCache();
      return null;
    }
    if (!(await openDropshotImageWorkspace(page, onLog))) {
      onLog?.('[리더스 나노바나나] 로그인은 유지되며 이미지 작업 화면은 생성 단계에서 다시 준비합니다.');
    }
    return page;
  } catch {
    await closeBrowserCache();
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePage(onLog?: (m: string) => void): Promise<any> {
  if (_ensurePagePromise) return await _ensurePagePromise;

  const cachedPage = await getHealthyCachedPage(onLog);
  if (cachedPage) return cachedPage;
  if (_ensurePagePromise) return await _ensurePagePromise;

  const pending = _ensurePageInternal(onLog);
  _ensurePagePromise = pending;
  try {
    return await pending;
  } finally {
    if (_ensurePagePromise === pending) _ensurePagePromise = null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _ensurePageInternal(onLog?: (m: string) => void): Promise<any> {
  const profileDir = getProfileDir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any = null;

  try {
    onLog?.('[리더스 나노바나나] 저장된 로그인 세션 확인 중...');
    context = await launchBrowser(profileDir, true);
    const headlessProbePage = await selectDropshotPage(context);
    const boardOpened = await navigateToDropshotBoard(headlessProbePage, onLog);
    assertDropshotNavigationOpened(boardOpened);
    const initialAuthenticated = await isLoggedIn(headlessProbePage);

    if (initialAuthenticated) {
      try {
        const workspaceReady = await openDropshotImageWorkspace(headlessProbePage, onLog);
        if (workspaceReady) {
          await ensureDropshotControls(headlessProbePage, onLog);
        }
      } catch (controlError) {
        onLog?.(
          `[리더스 나노바나나] 로그인은 자동 인식됐으며 무제한·0비용 상태는 생성 전에 다시 확인합니다: ${(controlError as Error).message?.slice(0, 120)}`,
        );
      }
      setCached(context, headlessProbePage);
      context = null;
      onLog?.('[리더스 나노바나나] 저장된 로그인 자동 인식 완료');
      return headlessProbePage;
    }

    await closeContext(context);
    context = null;

    onLog?.('[리더스 나노바나나] 로그인이 필요합니다. 브라우저에서 로그인해주세요 (최대 5분).');
    context = await launchBrowser(profileDir, false);
    let page = await selectDropshotPage(context);
    const loginBoardOpened = await navigateToDropshotBoard(page, onLog);
    assertDropshotNavigationOpened(loginBoardOpened);

    let userClosed = false;
    try {
      context.on('close', () => {
        userClosed = true;
      });
    } catch {
      // Optional EventEmitter API.
    }

    let loggedIn = false;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (userClosed) break;

      try {
        const pages = context.pages();
        if (!pages || pages.length === 0) {
          userClosed = true;
          break;
        }
        page = await selectDropshotPage(context);

        if (await isLoggedIn(page)) {
          loggedIn = true;
          try {
            const workspaceReady = await openDropshotImageWorkspace(page, onLog);
            if (workspaceReady) await ensureDropshotControls(page, onLog);
          } catch {
            onLog?.('[리더스 나노바나나] 로그인 완료 - 무제한·0비용 상태는 생성 전에 다시 확인합니다.');
          }
          break;
        }
      } catch {
        // OAuth page transitions can temporarily detach the active page.
      }

      if (i % 6 === 5) {
        onLog?.(`[리더스 나노바나나] 로그인 대기 (${Math.round(((i + 1) * 5) / 60)}분 경과)`);
      }
    }

    if (!loggedIn) {
      throw new Error(userClosed
        ? '로그인 창이 닫혔지만 유효한 로그인 토큰이 확인되지 않았습니다.'
        : '로그인 시간이 초과되었습니다.');
    }

    await closeContext(context);
    context = null;
    clearCached();
    const headlessPage = await reopenDropshotHeadlessGenerationContext(profileDir, onLog);
    onLog?.('[리더스 나노바나나] 로그인 창 종료 및 백그라운드 준비 완료');
    return headlessPage;
  } catch (error) {
    if (context) await closeContext(context);
    clearCached();
    throw error;
  }
}
