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
export const PROMPT_SELECTOR =
  'textarea, [contenteditable="true"], div[role="textbox"]';

export interface DropshotLoginStatus {
  loggedIn: boolean;
  message: string;
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

export function getProfileDir(): string {
  const dir = path.join(os.homedir(), PROFILE_ROOT, PROFILE_NAME);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function launchBrowser(
  profileDir: string,
  headless: boolean,
  options: DropshotLaunchOptions = {},
): Promise<unknown> {
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
            /(CognitoIdentityServiceProvider|amplify|auth|token|user)/i.test(k) &&
            /(idToken|accessToken|refreshToken|LastAuthUser|session|user)$/i.test(k)
          ) {
            const v = localStorage.getItem(k);
            if (v && v.length > 20) return true;
          }
        }
      } catch {
        // localStorage 접근 불가 시 미로그인 취급
      }
      try {
        if (/(cognito|amplify|idtoken|accesstoken|refreshtoken|session)/i.test(document.cookie || '')) {
          return true;
        }
      } catch {
        // cookie access can fail in rare browser states.
      }
      return false;
    });
    return !!has;
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
      await page.goto(BOARD_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await new Promise((r) => setTimeout(r, 4000));
    }

    if (await isImageWorkspaceReady(page)) return true;

    const clicked = await clickImageEntry(page);
    if (clicked) {
      onLog?.('[dropshot] image workspace entry clicked');
      await new Promise((r) => setTimeout(r, 5000));
      if (await isImageWorkspaceReady(page)) return true;
    }

    await page.goto(BOARD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
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

/** Ensure unlimited mode toggle ON + counter set to 1 (idempotent). */
export async function ensureDropshotControls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  onLog?: (m: string) => void,
): Promise<void> {
  try {
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
      await new Promise((r) => setTimeout(r, 1200));
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
    await new Promise((r) => setTimeout(r, 500));
    const state = await readDropshotControlState(page);
    const switchConfirmed = state.unlimitedModeOn !== false;
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
