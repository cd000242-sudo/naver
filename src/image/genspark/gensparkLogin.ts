// src/image/genspark/gensparkLogin.ts
// [2026-10-10] 젠스파크 로그인 상태 확인 · 로그인 창 · 생성용 탭 준비.
//   비밀번호는 절대 자동 입력하지 않는다 — 사람이 보이는 창에서 직접 로그인하고, 앱은 3초마다 상태만 지켜본다.
//   로그인이 감지되면 닫지 않고 그 창을 숨겨 생성용으로 이어 받는다(닫았다 다시 열면 프로필 잠김과 부딪힘).
//   생성 중에는 로그인 창을 띄우지 않고 GENSPARK_LOGIN_REQUIRED 로 멈춘다(자동 폴백 금지).

import {
  GENSPARK_CHALLENGE,
  GENSPARK_COMPOSER_NOT_FOUND,
  GENSPARK_LOGIN_REQUIRED,
  GensparkError,
  gensparkIsError,
} from './gensparkErrors.js';
import {
  bringGensparkPageToFront,
  hideGensparkWindow,
  isGensparkPageUsable,
  launchGensparkBrowser,
  selectGensparkPage,
  type GensparkHideMode,
} from './gensparkBrowser.js';
import { GENSPARK_IMAGE_URL, readGensparkPageSignals, type GensparkPageSignals } from './gensparkSelectors.js';
import {
  clearGensparkCached,
  closeGensparkBrowserCache,
  closeTrackedGensparkContext,
  endGensparkCheck,
  endGensparkLogin,
  getGensparkCachedContext,
  getGensparkCachedPage,
  setGensparkCached,
  tryBeginGensparkCheck,
  tryBeginGensparkLogin,
} from './gensparkSession.js';

export type GensparkLoginState = 'logged-in' | 'logged-out' | 'unknown';

export interface GensparkLoginStatus {
  state: GensparkLoginState;
  message: string;
  /** 로그인 창 결과 코드 */
  code?: 'LOGIN_WINDOW_CLOSED' | 'LOGIN_TIMEOUT' | 'BUSY' | 'HIDE_FAILED';
}

export interface GensparkLoginDeps {
  launch: (opts: { visible: boolean; hideMode: GensparkHideMode }) => Promise<unknown>;
  hide: (page: unknown) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

const defaultDeps: GensparkLoginDeps = {
  launch: (o) => launchGensparkBrowser({ visible: o.visible, hideMode: o.hideMode }),
  hide: hideGensparkWindow,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: () => undefined,
};

/** 로그인 창 대기 상수: 3초마다 확인, 최대 10분 */
export const GENSPARK_LOGIN_POLL_MS = 3_000;
export const GENSPARK_LOGIN_MAX_WAIT_MS = 600_000;

/** 화면 신호를 로그인 상태로 분류한다(순수 함수). */
export function gensparkClassifySignals(sig: GensparkPageSignals | null | undefined): GensparkLoginState {
  if (!sig) return 'unknown';
  if (sig.challenge) return 'unknown';
  if (sig.loginRequired) return 'logged-out';
  if (sig.hasComposer) return 'logged-in';
  return 'unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readSignals(page: any): Promise<GensparkPageSignals | null> {
  try {
    return (await page.evaluate(readGensparkPageSignals)) as GensparkPageSignals;
  } catch {
    return null; // 이동 중이라 문맥이 끊긴 경우 — 다음 확인에서 다시 읽는다.
  }
}

/** 생성 화면으로 들어가 입력창/로그인 신호가 나타날 때까지 짧게 기다린 뒤 신호를 돌려준다. */
async function loadAndReadSignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  deps: GensparkLoginDeps,
  waitRounds = 10,
): Promise<GensparkPageSignals | null> {
  await page.goto(GENSPARK_IMAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  let last: GensparkPageSignals | null = null;
  for (let i = 0; i < waitRounds; i += 1) {
    last = await readSignals(page);
    if (last && (last.hasComposer || last.loginRequired || last.challenge)) return last;
    await deps.sleep(1_000);
  }
  return last;
}

/** 게이트 없이 상태를 읽는다. 열린 생성용 탭이 있으면 거기서, 없으면 숨긴 창을 띄워 확인한다. */
async function probeGensparkLogin(
  deps: GensparkLoginDeps,
  hideMode: GensparkHideMode,
): Promise<GensparkLoginStatus> {
  const cachedPage = getGensparkCachedPage();
  if (cachedPage && isGensparkPageUsable(cachedPage)) {
    const sig = await loadAndReadSignals(cachedPage, deps);
    return statusFrom(gensparkClassifySignals(sig), sig);
  }
  if (getGensparkCachedContext()) {
    await closeGensparkBrowserCache(); // 탭이 죽은 컨텍스트는 정리한 뒤 다시 연다.
  }
  const ctx = await deps.launch({ visible: false, hideMode });
  try {
    const page = await selectGensparkPage(ctx);
    const sig = await loadAndReadSignals(page, deps);
    const state = gensparkClassifySignals(sig);
    if (state === 'logged-in') {
      setGensparkCached(ctx, page); // 확인에 쓴 숨긴 창을 생성용으로 그대로 이어 쓴다.
      return statusFrom(state, sig);
    }
    await closeTrackedGensparkContext(ctx); // 로그인 창이 프로필을 쓸 수 있게 비운다.
    return statusFrom(state, sig);
  } catch (error) {
    await closeTrackedGensparkContext(ctx);
    throw error;
  }
}

function statusFrom(state: GensparkLoginState, sig: GensparkPageSignals | null): GensparkLoginStatus {
  if (state === 'logged-in') return { state, message: '젠스파크 로그인 상태입니다.' };
  if (state === 'logged-out') return { state, message: '젠스파크 로그인이 필요합니다.' };
  return {
    state,
    message: sig?.challenge
      ? '보안 확인 화면이 떠 있어 로그인 상태를 판단하지 못했습니다.'
      : '젠스파크 화면에서 로그인 상태를 판단하지 못했습니다.',
  };
}

const busyStatus = (what: '확인' | '로그인'): GensparkLoginStatus => ({
  state: 'unknown',
  message: `젠스파크 ${what} 작업이 다른 작업과 겹쳐 잠시 미룹니다. 잠시 뒤 다시 시도해 주세요.`,
  code: 'BUSY',
});

let checkPromise: Promise<GensparkLoginStatus> | null = null;

/** 로그인 상태 확인. 같은 확인이 진행 중이면 그 결과를 공유하고, 생성·로그인 중이면 BUSY 로 돌려준다. */
export function checkGensparkLogin(
  overrides: Partial<GensparkLoginDeps> = {},
  hideMode: GensparkHideMode = 'offscreen',
): Promise<GensparkLoginStatus> {
  if (checkPromise) return checkPromise;
  if (!tryBeginGensparkCheck()) return Promise.resolve(busyStatus('확인'));
  const deps = { ...defaultDeps, ...overrides };
  checkPromise = probeGensparkLogin(deps, hideMode)
    .catch((error): GensparkLoginStatus => {
      if (gensparkIsError(error)) return { state: 'unknown', message: error.userMessage };
      throw error;
    })
    .finally(() => {
      endGensparkCheck();
      checkPromise = null;
    });
  return checkPromise;
}

/**
 * 보이는 로그인 창을 열고 사람이 직접 로그인하길 기다린다(3초마다, 최대 10분).
 * 성공하면 창을 화면 밖으로 숨겨 생성용으로 이어 받는다. 숨기지 못하면 로그인은 디스크에 남기고 창을 닫는다.
 */
export async function openGensparkLoginWindow(
  overrides: Partial<GensparkLoginDeps> & { maxWaitMs?: number; hideMode?: GensparkHideMode } = {},
): Promise<GensparkLoginStatus> {
  const deps: GensparkLoginDeps = { ...defaultDeps, ...overrides };
  const maxWaitMs = overrides.maxWaitMs ?? GENSPARK_LOGIN_MAX_WAIT_MS;
  const hideMode = overrides.hideMode ?? 'offscreen';
  if (!tryBeginGensparkLogin()) return busyStatus('로그인');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any = null;
  try {
    const existing = await probeGensparkLogin(deps, hideMode);
    if (existing.state === 'logged-in') {
      return { ...existing, message: '이미 로그인되어 있습니다.' };
    }

    await closeGensparkBrowserCache();
    deps.log('[젠스파크] 로그인 창을 표시합니다 — 직접 로그인하면 자동으로 확인합니다 (최대 10분).');
    ctx = await deps.launch({ visible: true, hideMode });
    let page = await selectGensparkPage(ctx);
    try {
      await page.goto(GENSPARK_IMAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch {
      // 첫 이동이 실패해도 사람이 주소를 직접 열 수 있다 — 계속 지켜본다.
    }

    let userClosed = false;
    try {
      ctx.on('close', () => { userClosed = true; });
    } catch {
      // 이벤트 미지원 컨텍스트
    }

    const maxRounds = Math.max(1, Math.ceil(maxWaitMs / GENSPARK_LOGIN_POLL_MS));
    for (let i = 0; i < maxRounds; i += 1) {
      if (i > 0) await deps.sleep(GENSPARK_LOGIN_POLL_MS);
      if (userClosed) break;
      try {
        if (ctx.pages().length === 0) { userClosed = true; break; }
        page = await selectGensparkPage(ctx);
        const sig = await readSignals(page);
        if (gensparkClassifySignals(sig) !== 'logged-in') continue;

        // 토큰을 받은 바로 그 컨텍스트를 숨겨 이어 받는다(닫고 다시 열지 않는다).
        if (!(await deps.hide(page))) {
          await closeTrackedGensparkContext(ctx);
          ctx = null;
          clearGensparkCached();
          return {
            state: 'logged-in',
            message: '로그인은 확인했지만 창을 숨기지 못해 안전하게 닫았습니다. 생성 때 자동으로 다시 엽니다.',
            code: 'HIDE_FAILED',
          };
        }
        setGensparkCached(ctx, page);
        ctx = null;
        deps.log('[젠스파크] 로그인을 확인했고 창을 숨겨 생성에 이어 씁니다.');
        return { state: 'logged-in', message: '젠스파크 로그인을 확인했습니다.' };
      } catch {
        // 이동 중 탭이 분리되는 경우 — 계속 지켜본다.
      }
      if (i % 20 === 19) deps.log(`[젠스파크] 로그인 대기 (${Math.round(((i + 1) * GENSPARK_LOGIN_POLL_MS) / 60_000)}분 경과)`);
    }

    await closeTrackedGensparkContext(ctx);
    ctx = null;
    clearGensparkCached();
    return {
      state: 'logged-out',
      message: userClosed
        ? '로그인 창이 닫혔지만 로그인이 확인되지 않았습니다. 다시 시도해 주세요.'
        : '로그인 시간이 초과되었습니다. 다시 시도해 주세요.',
      code: userClosed ? 'LOGIN_WINDOW_CLOSED' : 'LOGIN_TIMEOUT',
    };
  } catch (error) {
    if (ctx) await closeTrackedGensparkContext(ctx);
    if (gensparkIsError(error)) return { state: 'unknown', message: error.userMessage };
    throw error;
  } finally {
    endGensparkLogin();
  }
}

/**
 * 생성용 탭을 준비한다: 열린 탭이 있으면 쓰고 없으면 숨긴 창을 띄운 뒤, 생성 화면에서 로그인·보안 확인을 판정한다.
 * 로그인 풀림이면 로그인 창을 띄우지 않고 GENSPARK_LOGIN_REQUIRED, 보안 확인이면 GENSPARK_CHALLENGE 로 멈춘다.
 * 호출자는 tryBeginGensparkGeneration() 으로 생성 게이트를 잡고 있어야 한다.
 */
export async function prepareGensparkGenerationPage(
  overrides: Partial<GensparkLoginDeps> & { hideMode?: GensparkHideMode } = {},
): Promise<unknown> {
  const deps: GensparkLoginDeps = { ...defaultDeps, ...overrides };
  let page = getGensparkCachedPage();
  if (!page || !isGensparkPageUsable(page)) {
    if (getGensparkCachedContext()) await closeGensparkBrowserCache();
    const ctx = await deps.launch({ visible: false, hideMode: overrides.hideMode ?? 'offscreen' });
    page = await selectGensparkPage(ctx);
    setGensparkCached(ctx, page);
  }
  await bringGensparkPageToFront(page);
  let sig: GensparkPageSignals | null;
  try {
    sig = await loadAndReadSignals(page, deps);
  } catch (error) {
    if (gensparkIsError(error)) throw error;
    throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND, error instanceof Error ? error.message.split('\n')[0] : undefined);
  }
  if (sig?.challenge) throw new GensparkError(GENSPARK_CHALLENGE);
  const state = gensparkClassifySignals(sig);
  if (state === 'logged-out') throw new GensparkError(GENSPARK_LOGIN_REQUIRED);
  if (state === 'unknown') throw new GensparkError(GENSPARK_COMPOSER_NOT_FOUND);
  return page;
}
