/**
 * Dropshot login flows: short status checks and interactive browser login.
 * The persistent profile is shared with image generation, so every entry point
 * is coordinated through dropshotSession before it may open or close a context.
 */

import {
  ensureDropshotControls,
  getProfileDir,
  isLoggedIn,
  launchBrowser,
  minimizeDropshotWindow,
  navigateToDropshotBoard,
  openDropshotImageWorkspace,
  sanitizeDropshotErrorMessage,
  type DropshotLoginStatus,
} from './dropshotBrowser.js';
import {
  clearCached,
  closeBrowserCache,
  closeTrackedDropshotContext,
  DropshotCleanupIncompleteError,
  endDropshotCheck,
  endDropshotLogin,
  getCachedContext,
  getCachedPage,
  getDropshotOperationState,
  setCached,
  tryBeginDropshotCheck,
  tryBeginDropshotLogin,
} from './dropshotSession.js';

let _loginPromise: Promise<DropshotLoginStatus> | null = null;
let _checkPromise: Promise<DropshotLoginStatus> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryOpenDropshotBoard(page: any, onLog?: (m: string) => void): Promise<boolean> {
  const opened = await navigateToDropshotBoard(page, onLog, 90_000);
  if (opened) return true;
  onLog?.('[Dropshot] navigation failed; keeping login window open for manual retry.');
  return false;
}

async function closeLoginVerificationContext(ctx: unknown): Promise<void> {
  const closed = await closeTrackedDropshotContext(ctx);
  if (!closed) throw new DropshotCleanupIncompleteError();
}

function operationBusyStatus(action: 'login' | 'check'): DropshotLoginStatus {
  const state = getDropshotOperationState();
  if (state.pendingGenerations > 0) {
    return {
      loggedIn: false,
      message: '이미지 생성이 진행 중입니다. 생성이 끝난 뒤 다시 눌러주세요.',
      phase: 'checking',
      ready: false,
      code: 'GENERATION_ACTIVE',
    };
  }
  return {
    loggedIn: false,
    message: action === 'login'
      ? '로그인 확인 작업이 이미 진행 중입니다. 잠시만 기다려주세요.'
      : '로그인 작업이 이미 진행 중입니다. 로그인 창에서 먼저 완료해주세요.',
    phase: 'checking',
    ready: false,
    code: 'AUTH_OPERATION_ACTIVE',
  };
}

function authenticatedStatus(ready: boolean, message?: string): DropshotLoginStatus {
  return {
    loggedIn: true,
    message: message ?? (ready
      ? '로그인 및 무제한·0비용 모드가 확인되었습니다.'
      : '로그인은 확인되었습니다. 무제한·0비용 모드는 생성 전에 다시 확인합니다.'),
    phase: ready ? 'unlimited_ready' : 'authenticated',
    ready,
  };
}

function loginRequiredStatus(message: string, code = 'LOGIN_REQUIRED'): DropshotLoginStatus {
  return {
    loggedIn: false,
    message,
    phase: 'login_required',
    ready: false,
    code,
  };
}

async function checkDropshotLoginInternal(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  const cachedPage = getCachedPage();
  if (cachedPage) {
    let cachedLoggedIn = false;
    try {
      cachedLoggedIn = await isLoggedIn(cachedPage);
    } catch {
      // A stale page is closed below before a fresh profile check.
    }
    if (cachedLoggedIn) {
      const authenticated: DropshotLoginStatus = {
        loggedIn: true,
        message: '저장된 로그인을 자동으로 인식했습니다. 무제한·0비용 모드는 생성 전에 다시 확인합니다.',
        phase: 'authenticated',
        ready: false,
      };
      try {
        if (await openDropshotImageWorkspace(cachedPage, onLog)) {
          await ensureDropshotControls(cachedPage, onLog);
          return authenticatedStatus(true, '저장된 로그인과 무제한·0비용 모드를 자동으로 인식했습니다.');
        }
      } catch {
        onLog?.('[리더스 나노바나나] 로그인은 유효하며 무제한·0비용 상태는 생성 전에 다시 확인합니다.');
      }
      return authenticated;
    }
  }

  if (getCachedContext()) {
    await closeBrowserCache();
  }

  const profileDir = getProfileDir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any = null;
  try {
    onLog?.('[리더스 나노바나나] 저장된 로그인 세션 확인 중...');
    ctx = await launchBrowser(profileDir, true);

    const page = ctx.pages()[0] || (await ctx.newPage());
    const boardOpened = await navigateToDropshotBoard(page, onLog);
    if (!boardOpened) {
      return {
        loggedIn: false,
        message: 'Dropshot 사이트 연결 시간이 초과되었습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.',
        phase: 'error',
        ready: false,
        code: 'SITE_UNREACHABLE',
      };
    }

    if (!(await isLoggedIn(page))) {
      return loginRequiredStatus('로그인이 필요합니다. [로그인] 버튼으로 진행하세요.');
    }

    const authenticated: DropshotLoginStatus = {
      loggedIn: true,
      message: '저장된 로그인을 자동으로 인식했습니다. 무제한·0비용 모드는 생성 전에 다시 확인합니다.',
      phase: 'authenticated',
      ready: false,
    };
    setCached(ctx, page);
    ctx = null;

    try {
      if (await openDropshotImageWorkspace(page, onLog)) {
        await ensureDropshotControls(page, onLog);
        return authenticatedStatus(true, '저장된 로그인과 무제한·0비용 모드를 자동으로 인식했습니다.');
      }
    } catch {
      onLog?.('[리더스 나노바나나] 로그인은 유효하며 이미지 작업 화면은 생성 전에 다시 준비합니다.');
    }
    return authenticated;
  } catch (error) {
    const detail = sanitizeDropshotErrorMessage(error);
    return {
      loggedIn: false,
      message: detail ? `세션 확인 실패: ${detail}` : '세션 확인에 실패했습니다.',
      phase: 'error',
      ready: false,
      code: 'SESSION_CHECK_FAILED',
    };
  } finally {
    if (ctx) await closeLoginVerificationContext(ctx);
  }
}

export function checkDropshotLogin(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  if (_checkPromise) return _checkPromise;
  if (!tryBeginDropshotCheck()) return Promise.resolve(operationBusyStatus('check'));

  _checkPromise = checkDropshotLoginInternal(onLog).finally(() => {
    endDropshotCheck();
    _checkPromise = null;
  });
  return _checkPromise;
}

async function dropshotLoginInternal(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any = null;
  try {
    // A login click first performs a hidden, read-only probe. Existing sessions
    // must never spawn another visible browser window.
    const existing = await checkDropshotLoginInternal(onLog);
    if (existing.loggedIn) {
      return {
        ...existing,
        message: existing.ready
          ? '이미 로그인되어 있으며 무제한·0비용 모드도 준비되어 있습니다.'
          : '이미 로그인된 계정을 자동으로 인식했습니다.',
      };
    }

    // The operation gate guarantees that no generation owns this context.
    await closeBrowserCache();

    const profileDir = getProfileDir();
    onLog?.('[리더스 나노바나나] 로그인 브라우저 표시 - 로그인 완료 후 자동으로 확인합니다 (최대 10분).');
    ctx = await launchBrowser(profileDir, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page = ctx.pages()[0] || (await ctx.newPage());
    await tryOpenDropshotBoard(page, onLog);

    let userClosed = false;
    try {
      ctx.on('close', () => {
        userClosed = true;
      });
    } catch {
      // Some Playwright-compatible contexts do not expose EventEmitter methods.
    }

    let detected = false;
    let unlimitedReady = false;
    for (let i = 0; i < 100; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (userClosed) break;

      try {
        const pages = ctx.pages();
        if (!pages || pages.length === 0) {
          userClosed = true;
          break;
        }
        page = pages.find((candidate: any) => {
          try {
            return candidate.url().includes('dropshot.io');
          } catch {
            return false;
          }
        }) || pages[pages.length - 1];

        const tokenReady = await isLoggedIn(page);
        if (tokenReady) {
          detected = true;
          try {
            const workspaceReady = await openDropshotImageWorkspace(page, onLog);
            if (workspaceReady) {
              await ensureDropshotControls(page, onLog);
              unlimitedReady = true;
            }
          } catch {
            onLog?.('[리더스 나노바나나] 로그인은 완료되었습니다. 무제한·0비용 상태는 생성 전에 다시 확인합니다.');
          }
          break;
        }
      } catch {
        // OAuth redirects temporarily detach the page; keep polling.
      }

      if (i % 20 === 19) {
        onLog?.(`[리더스 나노바나나] 로그인 대기 (${Math.round(((i + 1) * 3) / 60)}분 경과)`);
      }
    }

    if (!detected) {
      if (!userClosed) await closeLoginVerificationContext(ctx);
      ctx = null;
      clearCached();
      return {
        loggedIn: false,
        message: userClosed
          ? '로그인 창이 닫혔지만 유효한 로그인 토큰이 확인되지 않았습니다. 다시 로그인해주세요.'
          : '로그인 시간이 초과되었습니다. 다시 시도해주세요.',
        phase: 'login_required',
        ready: false,
        code: userClosed ? 'LOGIN_WINDOW_CLOSED' : 'LOGIN_TIMEOUT',
      };
    }

    // Reuse the exact context that received the OAuth tokens. Closing it and
    // immediately reopening the same profile caused lock/flush races and login loops.
    setCached(ctx, page);
    await minimizeDropshotWindow(page, onLog);
    ctx = null;
    return authenticatedStatus(
      unlimitedReady,
      unlimitedReady
        ? '로그인 완료 - 무제한·0비용 생성 세션이 준비되었습니다.'
        : '로그인 완료 - 계정을 인식했습니다. 무제한·0비용 모드는 생성 전에 다시 확인합니다.',
    );
  } catch (error) {
    if (ctx) await closeLoginVerificationContext(ctx);
    const detail = sanitizeDropshotErrorMessage(error);
    return {
      loggedIn: false,
      message: detail ? `로그인 실패: ${detail}` : '로그인에 실패했습니다.',
      phase: 'error',
      ready: false,
      code: 'LOGIN_FAILED',
    };
  }
}

export function dropshotLogin(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  if (_loginPromise) return _loginPromise;
  if (!tryBeginDropshotLogin()) return Promise.resolve(operationBusyStatus('login'));

  _loginPromise = dropshotLoginInternal(onLog).finally(() => {
    endDropshotLogin();
    _loginPromise = null;
  });
  return _loginPromise;
}
