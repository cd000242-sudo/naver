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

export const BOARD_URL =
  'https://aistudio.dropshot.io/ko/workspace/board?panel=image&imageModelName=google/nano-banana-pro';
const PROFILE_NAME = 'dropshot-profile';
const PROFILE_ROOT = '.better-life-naver';
export const PROMPT_SELECTOR = 'textarea[placeholder="어떤 장면을 만들고 싶나요?"]';

export interface DropshotLoginStatus {
  loggedIn: boolean;
  message: string;
}

export interface DropshotResult {
  ok: boolean;
  dataUrl: string;
  error?: string;
}

export function getProfileDir(): string {
  const dir = path.join(os.homedir(), PROFILE_ROOT, PROFILE_NAME);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function launchBrowser(profileDir: string, headless: boolean): Promise<unknown> {
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
export async function isLoggedIn(page: any): Promise<boolean> {
  try {
    // ✅ [SPEC-DROPSHOT-2026 2단계 보정] 정확한 로그인 신호 = AWS Cognito 인증 토큰.
    //   dropshot은 Cognito(키트 §0)를 쓰며 로그인 시 localStorage에
    //   `CognitoIdentityServiceProvider.<clientId>.<user>.idToken/accessToken` 를 저장한다.
    //   이전 휴리스틱(마케팅 텍스트 / 프롬프트 textarea)은 미로그인 board에도 존재해
    //   false positive("로그인한 적 없는데 완료" + 생성 0건)를 냈다.
    const has = await page.evaluate(() => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (
            /CognitoIdentityServiceProvider/i.test(k) &&
            /\.(idToken|accessToken)$/i.test(k)
          ) {
            const v = localStorage.getItem(k);
            if (v && v.length > 20) return true;
          }
        }
      } catch {
        // localStorage 접근 불가 시 미로그인 취급
      }
      return false;
    });
    return !!has;
  } catch {
    return false;
  }
}

/** Ensure unlimited mode toggle ON + counter set to 1 (idempotent). */
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
