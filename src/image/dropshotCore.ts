/**
 * 🍌 Dropshot image engine — browser/page lifecycle management
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
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const BOARD_URL =
  'https://aistudio.dropshot.io/ko/workspace/board?panel=image&imageModelName=google/nano-banana-pro';
const PROFILE_NAME = 'dropshot-profile';
const PROFILE_ROOT = '.better-life-naver';
const PROMPT_SELECTOR = 'textarea[placeholder="어떤 장면을 만들고 싶나요?"]';

let cachedContext: unknown = null;
let cachedPage: unknown = null;
let _ensurePagePromise: Promise<unknown> | null = null;

/** Serialize all generation calls — single shared browser page. */
let _generationChain: Promise<unknown> = Promise.resolve();

export function getGenerationChain(): Promise<unknown> {
  return _generationChain;
}

export function setGenerationChain(p: Promise<unknown>): void {
  _generationChain = p;
}

function getProfileDir(): string {
  const dir = path.join(os.homedir(), PROFILE_ROOT, PROFILE_NAME);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launchBrowser(profileDir: string, headless: boolean): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chromium = (await import('patchright' as any)).chromium;
  } catch {
    chromium = (await import('playwright')).chromium;
  }

  const forceVisible =
    String(process.env['VISIBLE_BROWSER'] || '').toLowerCase() === 'true';
  const effectiveHeadless = forceVisible ? false : headless;

  const baseOptions = {
    headless: effectiveHeadless,
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
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
      try {
        await ctx.addInitScript(stealthInit);
      } catch {
        // stealth init is best-effort
      }
      return ctx;
    } catch {
      // try next channel
    }
  }
  throw new Error('Chrome/Edge/Chromium 실행 실패');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isLoggedIn(page: any): Promise<boolean> {
  try {
    // ✅ [SPEC-DROPSHOT-2026 2단계] 정밀화: 마케팅 텍스트('이미지 생성'/'플랜 업그레이드'/
    //   '워크스페이스')는 로그인 화면에도 나타나 false positive를 냈다("로그인한 적 없는데
    //   로그인 완료" 버그). 실제 로그인 신호 = 생성용 프롬프트 textarea 존재(인증된 사용자만
    //   board에서 볼 수 있고, 키트가 실제 생성에 쓰는 셀렉터).
    const has = await page.evaluate(
      (sel: string) => !!document.querySelector(sel),
      PROMPT_SELECTOR,
    );
    return !!has;
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePage(onLog?: (m: string) => void): Promise<any> {
  if (_ensurePagePromise) {
    await _ensurePagePromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (cachedPage && cachedContext) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (cachedPage as any).evaluate(() => document.readyState);
        return cachedPage;
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

export interface DropshotLoginStatus {
  loggedIn: boolean;
  message: string;
}

/**
 * Headless-only login check — fast, no visible window, no 5-minute wait.
 * Reuses the cached page when present to avoid a second persistent-context
 * lock on the same profile dir.
 */
export async function checkDropshotLogin(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  if (cachedPage) {
    try {
      if (await isLoggedIn(cachedPage)) {
        return { loggedIn: true, message: 'board 접근 가능 (로그인 추정 — 생성 0건이면 🔗 로그인 필요)' };
      }
    } catch {
      // cached page unusable — fall through to a fresh headless check
    }
  }
  const profileDir = getProfileDir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any = null;
  try {
    onLog?.('[리더스 나노바나나] 로그인 세션 확인 중...');
    ctx = await launchBrowser(profileDir, true);
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4000));
    return (await isLoggedIn(page))
      ? { loggedIn: true, message: '로그인 세션 확인됨' }
      : { loggedIn: false, message: '로그인이 필요합니다. [로그인] 버튼으로 진행하세요.' };
  } catch (err) {
    return { loggedIn: false, message: `세션 확인 실패: ${(err as Error)?.message ?? err}` };
  } finally {
    try {
      if (ctx) await ctx.close();
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Opens a visible dropshot browser so the user can log in directly, then waits
 * until the user closes the window (max 10 min) and re-caches a headless
 * session. DOM-based login auto-detection is unreliable (the board shows the
 * prompt textarea even when not logged in), so completion is user-controlled.
 */
export async function dropshotLogin(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  // ✅ [SPEC-DROPSHOT-2026 2단계 보정] dropshot은 미로그인에도 board/프롬프트 입력창을
  //   노출해 DOM만으로 로그인 여부를 신뢰성 있게 판정할 수 없다(textarea 존재 ≠ 로그인,
  //   실제 생성 시 0건 반환으로 확인됨). 따라서 자동 판정 대신 visible 브라우저를 띄우고
  //   사용자가 직접 로그인한 뒤 "창을 닫으면" 세션을 저장하는 사용자 제어 방식으로 처리한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any = null;
  try {
    // 기존 캐시 컨텍스트를 먼저 닫는다(동일 프로필 persistent-context 이중 락 방지).
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (cachedContext) await (cachedContext as any).close();
    } catch {
      // ignore
    }
    cachedContext = null;
    cachedPage = null;

    const profileDir = getProfileDir();
    onLog?.('[리더스 나노바나나] 로그인 브라우저 표시 — 로그인 후 이 창을 닫아주세요 (최대 10분).');
    ctx = await launchBrowser(profileDir, false);
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto('https://aistudio.dropshot.io', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // 사용자가 창을 닫을 때까지 대기(로그인 완료 신호 = 사용자가 창 닫음). 최대 10분.
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      try {
        ctx.on('close', finish);
      } catch {
        // event 미지원 시 타임아웃만 사용
      }
      setTimeout(finish, 10 * 60 * 1000);
    });

    // 세션은 profileDir에 저장됨. 생성용 headless 세션 재캐시.
    try {
      await ctx.close();
    } catch {
      // already closed by user
    }
    ctx = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hctx: any = await launchBrowser(profileDir, true);
    const hpage = hctx.pages()[0] || (await hctx.newPage());
    await hpage.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4000));
    cachedContext = hctx;
    cachedPage = hpage;
    return { loggedIn: true, message: '브라우저를 닫았습니다 — 세션이 저장되었습니다. (실제 로그인 여부는 생성으로 확인)' };
  } catch (err) {
    try {
      if (ctx) await ctx.close();
    } catch {
      // ignore
    }
    return { loggedIn: false, message: `로그인 실패: ${(err as Error)?.message ?? err}` };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _ensurePageInternal(onLog?: (m: string) => void): Promise<any> {
  if (cachedPage && cachedContext) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (cachedPage as any).evaluate(() => document.readyState);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(cachedPage as any).url().includes('dropshot.io')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (cachedPage as any).goto(BOARD_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await new Promise((r) => setTimeout(r, 3000));
      }
      return cachedPage;
    } catch {
      cachedPage = null;
      cachedContext = null;
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

  if (await isLoggedIn(page)) {
    onLog?.('[리더스 나노바나나] 로그인 세션 확인');
    cachedContext = context;
    cachedPage = page;
    return page;
  }

  // Attempt 2: show visible window for login (max 5 minutes)
  onLog?.('[리더스 나노바나나] 로그인 필요 → 브라우저 표시 (최대 5분)');
  await context.close();
  context = await launchBrowser(profileDir, false);
  page = context.pages()[0] || (await context.newPage());
  await page.goto('https://aistudio.dropshot.io', {
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

  cachedContext = hctx;
  cachedPage = hpage;
  onLog?.('[리더스 나노바나나] 준비 완료');
  return hpage;
}

/** Ensure unlimited mode toggle ON + counter set to 1 (idempotent). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDropshotControls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  onLog?: (m: string) => void,
): Promise<void> {
  try {
    // 1. Enable unlimited mode toggle
    const switches = await page.$$('input[role="switch"]');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const sw of switches) {
      const isOn: boolean = await sw.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el: any) =>
          el.checked || el.getAttribute('aria-checked') === 'true',
      );
      if (!isOn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parent = await sw.evaluateHandle(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (el: any) =>
            el.closest('label') ||
            el.closest('button') ||
            el.parentElement,
        );
        if (parent) {
          await parent.click({ timeout: 2000 }).catch(() => {
            // best-effort
          });
        }
      }
    }

    // 2. Set counter to 1 (React-controlled input requires native setter)
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
  } catch (e) {
    onLog?.(
      `[리더스 나노바나나] controls 설정 오류 (무시): ${(e as Error).message?.slice(0, 80)}`,
    );
  }
}

/** Download a URL as a buffer suitable for setInputFiles. */
export async function downloadAsFileBuffer(
  url: string,
): Promise<{ name: string; mimeType: string; buffer: Buffer } | null> {
  try {
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

export interface DropshotResult {
  ok: boolean;
  dataUrl: string;
  error?: string;
}

/** Build an enhanced + variation-seeded prompt (§12.3). */
export function buildDropshotPrompt(raw: string): string {
  const hasKorean = /[가-힯]/.test(raw);
  const isShort = raw.length < 50;
  const enhanced =
    hasKorean && isShort
      ? `${raw} — 본 주제를 직관적으로 표현하는 사실적 사진, 한국적 배경, 자연광, 시네마틱 4K, 텍스트 없음`
      : raw;

  const nonce = Math.random().toString(36).slice(2, 8);
  const variationSeed = Date.now().toString(36);
  return (
    enhanced +
    ` (버전-${variationSeed}-${nonce}: 매번 완전히 다른 구도와 시점, 다른 인물/배경/소품 — 이전 결과와 절대 같으면 안 됨)`
  );
}

/** Invalidate cached browser context (called on fatal errors). */
export function invalidateBrowserCache(): void {
  cachedPage = null;
  cachedContext = null;
}
