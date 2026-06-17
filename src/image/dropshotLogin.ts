/**
 * 🍌 Dropshot login flows — headless session check + visible-browser interactive login.
 *
 * Both read/write the shared session cache (dropshotSession.ts) so a login here is
 * immediately visible to the page-lifecycle code in dropshotCore.ts.
 */

import {
  BOARD_URL,
  launchBrowser,
  isLoggedIn,
  openDropshotImageWorkspace,
  getProfileDir,
  type DropshotLoginStatus,
} from './dropshotBrowser.js';
import { getCachedPage, getCachedContext, setCached, clearCached } from './dropshotSession.js';

/**
 * Headless-only login check — fast, no visible window, no 5-minute wait.
 * Reuses the cached page when present to avoid a second persistent-context
 * lock on the same profile dir.
 */
export async function checkDropshotLogin(
  onLog?: (m: string) => void,
): Promise<DropshotLoginStatus> {
  const cachedPage = getCachedPage();
  if (cachedPage) {
    try {
      if (await isLoggedIn(cachedPage)) {
        return { loggedIn: true, message: '✅ 로그인됨 (Cognito 세션 확인)' };
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
 * Opens a visible dropshot browser so the user can log in directly, polls for
 * the Cognito auth token (the reliable logged-in signal), and AUTO-CLOSES the
 * window once login is detected (or when the user closes it manually). Then
 * re-caches a headless session for generation. Max 10-minute wait.
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
      const cachedContext = getCachedContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (cachedContext) await (cachedContext as any).close();
    } catch {
      // ignore
    }
    clearCached();

    const profileDir = getProfileDir();
    onLog?.('[리더스 나노바나나] 로그인 브라우저 표시 — 로그인하면 자동으로 감지·닫힘 (최대 10분).');
    ctx = await launchBrowser(profileDir, false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(BOARD_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Cognito 토큰이 보이면 = 로그인 완료. 폴링하다 감지되면 자동으로 창을 닫는다.
    // 사용자가 직접 창을 닫으면 그것도 종료 신호로 처리한다(fallback).
    let userClosed = false;
    try {
      ctx.on('close', () => {
        userClosed = true;
      });
    } catch {
      // event 미지원
    }
    let detected = false;
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 3000)); // ~10분
      if (userClosed) break;
      try {
        const pages = ctx.pages();
        if (!pages || pages.length === 0) {
          userClosed = true;
          break;
        }
        page =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pages.find((p: any) => {
            try {
              return p.url().includes('dropshot.io');
            } catch {
              return false;
            }
          }) || pages[pages.length - 1];
        if (page && (await isLoggedIn(page))) {
          await openDropshotImageWorkspace(page, onLog);
          detected = true;
          break;
        }
      } catch {
        // 페이지 일시 전환(OAuth 리다이렉트) 중 — 계속 폴링
      }
      if (i % 20 === 19) {
        onLog?.(`[리더스 나노바나나] 로그인 대기 (${Math.round(((i + 1) * 3) / 60)}분 경과)`);
      }
    }

    // 감지 시 자동 닫기(사용자가 이미 닫았으면 skip).
    if (!detected) {
      if (!userClosed) {
        try {
          await ctx.close();
        } catch {
          // ignore
        }
      }
      ctx = null;
      clearCached();
      return {
        loggedIn: false,
        message: userClosed
          ? '로그인 창이 닫혔지만 로그인 완료 신호가 감지되지 않았습니다. 로그인 후 [로그인 확인]을 눌러주세요.'
          : '로그인 시간 초과 — 다시 시도해 주세요.',
      };
    }

    if (!userClosed) {
      try {
        await ctx.close();
      } catch {
        // ignore
      }
    }
    ctx = null;

    if (!detected && !userClosed) {
      return { loggedIn: false, message: '로그인 시간 초과 — 다시 시도해 주세요.' };
    }

    // 생성용 headless 세션 재캐시 + 최종 확인.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hctx: any = await launchBrowser(profileDir, true);
    const hpage = hctx.pages()[0] || (await hctx.newPage());
    await hpage.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 4000));
    await openDropshotImageWorkspace(hpage, onLog);
    const finalLoggedIn = await isLoggedIn(hpage);
    if (!finalLoggedIn) {
      try {
        await hctx.close();
      } catch {
        // ignore
      }
      clearCached();
      return { loggedIn: false, message: '⚠️ 로그인이 확인되지 않았습니다(토큰 없음). 다시 로그인해 주세요.' };
    }
    setCached(hctx, hpage);
    return (await isLoggedIn(hpage))
      ? { loggedIn: true, message: '✅ 로그인 완료 — 세션이 저장되었습니다.' }
      : { loggedIn: false, message: '⚠️ 로그인이 확인되지 않았습니다(토큰 없음). 다시 로그인해 주세요.' };
  } catch (err) {
    try {
      if (ctx) await ctx.close();
    } catch {
      // ignore
    }
    return { loggedIn: false, message: `로그인 실패: ${(err as Error)?.message ?? err}` };
  }
}
