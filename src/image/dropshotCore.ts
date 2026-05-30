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
    const has = await page.evaluate(() => {
      const text = (document.body as HTMLElement).innerText || '';
      return (
        text.includes('이미지 생성') ||
        text.includes('플랜 업그레이드') ||
        text.includes('워크스페이스')
      );
    });
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
