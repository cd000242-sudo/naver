// src/image/genspark/gensparkBrowser.ts
// [2026-10-10] 젠스파크 전용 크롬 실행·탭 선택·창 숨기기. 로그인된 전용 프로필을 UI 자동화로 쓴다.
//   구조는 dropshotBrowser.ts 를 본땄지만 dropshot 세션 추적과 묶여 있어 재사용하지 않고 별도로 둔다.
//   창 숨김 기본값은 화면 밖 위치(offscreen) — headless 는 옵션. 숨은 탭은 크롬이 멈추므로 생성 전 bringToFront 한다.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GENSPARK_PROFILE_IN_USE, GensparkError } from './gensparkErrors.js';
import {
  hasTrackedGensparkContexts,
  trackGensparkContext,
  untrackGensparkContext,
} from './gensparkSession.js';

export type GensparkHideMode = 'offscreen' | 'headless';

export interface GensparkLaunchOptions {
  /** true 면 사람이 보는 로그인 창(화면 안), 아니면 숨긴 생성용 창 */
  visible?: boolean;
  /** 숨김 방식(기본 offscreen) */
  hideMode?: GensparkHideMode;
  /** 추적 종류(기본: visible 이면 login, 아니면 generation) */
  kind?: 'generation' | 'login';
}

export const GENSPARK_OFFSCREEN_POSITION = -32000;

export function getGensparkProfileDir(): string {
  return path.join(os.homedir(), '.better-life-naver', 'genspark-profile');
}

/** 크롬 프로필 잠김(다른 크롬이 같은 프로필을 사용 중) 오류인가 */
export function isGensparkProfileLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:ProcessSingleton|SingletonLock|user data directory[^\n]*(?:already\s+)?in use|profile(?: directory)?[^\n]*(?:in use|locked))/i.test(message);
}

function sanitize(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return raw.split('\n')[0].replace(/\s+/g, ' ').slice(0, 160);
}

/** 실행 인자 — 시험에서 확인할 수 있게 순수 함수로 분리 */
export function buildGensparkLaunchArgs(options: GensparkLaunchOptions = {}): string[] {
  const args = [
    '--no-first-run',
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--lang=ko-KR,ko',
    '--window-size=1280,900',
  ];
  const hidden = !options.visible;
  if (hidden && (options.hideMode ?? 'offscreen') === 'offscreen') {
    args.push(`--window-position=${GENSPARK_OFFSCREEN_POSITION},${GENSPARK_OFFSCREEN_POSITION}`);
  }
  return args;
}

/**
 * 전용 프로필로 크롬을 띄운다. patchright 우선, 없으면 playwright. 채널은 chrome → msedge → 번들 chromium.
 * 이미 추적 중인 컨텍스트가 있거나 프로필이 잠겨 있으면 GENSPARK_PROFILE_IN_USE.
 */
export async function launchGensparkBrowser(options: GensparkLaunchOptions = {}): Promise<unknown> {
  if (hasTrackedGensparkContexts()) {
    throw new GensparkError(GENSPARK_PROFILE_IN_USE, '이전 젠스파크 창이 아직 종료되지 않았습니다');
  }
  const profileDir = getGensparkProfileDir();
  fs.mkdirSync(profileDir, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chromium = (await import('patchright' as any)).chromium;
  } catch {
    chromium = (await import('playwright')).chromium;
  }

  const visible = options.visible === true;
  const baseOptions = {
    headless: !visible && options.hideMode === 'headless',
    args: buildGensparkLaunchArgs(options),
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

  let lastError: unknown = null;
  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx: any = await chromium.launchPersistentContext(
        profileDir,
        channel ? { ...baseOptions, channel } : baseOptions,
      );
      trackGensparkContext(ctx, options.kind ?? (visible ? 'login' : 'generation'));
      try {
        ctx.on('close', () => untrackGensparkContext(ctx));
      } catch {
        // 일부 호환 컨텍스트는 이벤트를 지원하지 않는다 — 닫기 도우미가 추적을 해제한다.
      }
      try {
        await ctx.addInitScript(() => {
          Object.defineProperty(navigator, 'languages', {
            get: () => ['ko-KR', 'ko', 'en-US', 'en'],
            configurable: true,
          });
        });
      } catch {
        // 보조 설정일 뿐이다.
      }
      return ctx;
    } catch (error) {
      lastError = error;
      // 잠긴 프로필은 다른 채널로도 열리지 않는다 — 빈 창만 늘어나므로 즉시 중단.
      if (isGensparkProfileLockError(error)) break;
    }
  }
  if (isGensparkProfileLockError(lastError)) {
    throw new GensparkError(GENSPARK_PROFILE_IN_USE);
  }
  const detail = sanitize(lastError);
  throw new Error(`[젠스파크] Chrome/Edge/Chromium 실행 실패${detail ? ` (${detail})` : ''}`);
}

/** 컨텍스트의 사용할 탭 하나를 고른다(젠스파크 탭 > 빈 탭 아닌 마지막 탭 > 첫 탭 > 새 탭). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function selectGensparkPage(context: any): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages: any[] = (typeof context.pages === 'function' ? context.pages() : []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => !(typeof p?.isClosed === 'function' && p.isClosed()),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const urlOf = (p: any): string => {
    try { return String(p.url()); } catch { return ''; }
  };
  const gensparkPage = pages.find((p) => urlOf(p).includes('genspark.ai'));
  const nonBlank = [...pages].reverse().find((p) => {
    const u = urlOf(p);
    return u.length > 0 && u !== 'about:blank';
  });
  return gensparkPage || nonBlank || pages[0] || (await context.newPage());
}

/** 열린 탭이 쓸 수 있는 상태인가 */
export function isGensparkPageUsable(page: unknown): boolean {
  if (!page) return false;
  const p = page as { isClosed?: () => boolean };
  try {
    return typeof p.isClosed === 'function' ? !p.isClosed() : true;
  } catch {
    return false;
  }
}

/** 창 위치를 CDP 로 옮긴다(화면 밖/안). 성공 여부를 돌려준다. */
async function setWindowPosition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  left: number,
  top: number,
): Promise<boolean> {
  let cdp: any = null;
  try {
    const context = typeof page?.context === 'function' ? page.context() : null;
    if (!context || typeof context.newCDPSession !== 'function') return false;
    cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left, top } });
    return true;
  } catch {
    return false;
  } finally {
    try { await cdp?.detach?.(); } catch { /* 이미 닫힌 세션 */ }
  }
}

/** 로그인 끝난 창을 화면 밖으로 옮긴다(최소화는 크롬이 탭을 멈춰 쓰지 않는다). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hideGensparkWindow(page: any): Promise<boolean> {
  return setWindowPosition(page, GENSPARK_OFFSCREEN_POSITION, GENSPARK_OFFSCREEN_POSITION);
}

/** 숨긴 창을 화면 안으로 되돌린다(사람이 확인해야 할 때). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function showGensparkWindow(page: any): Promise<boolean> {
  return setWindowPosition(page, 80, 60);
}

/** 숨은 탭은 크롬이 멈춰 입력이 시간 초과된다 — 생성 전에 앞으로 가져온다. 실패해도 진행한다. */
export async function bringGensparkPageToFront(page: unknown): Promise<void> {
  try {
    await (page as { bringToFront: () => Promise<void> }).bringToFront();
  } catch {
    // 탭이 이미 닫혔다면 이후 단계가 오류로 처리한다.
  }
}
