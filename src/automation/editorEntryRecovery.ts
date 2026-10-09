/**
 * [2026-10-09 고객 신고] "로그인돼 있는데 앱이 못 알아본다 — 크롬을 다 끄고 네이버를 다시 열어야 인식한다."
 * 실측 두 건(10/8, 10/9) 모두 새 크롬의 첫 글쓰기 이동 직후 1초 안에 LOGIN_REQUIRED 로 멈췄고,
 * 10/9 건은 15초 뒤 같은 세션이 정상으로 확인됐다. 여기서는 지켜보기와 크롬 재시작만 한다. 비밀번호는 절대 입력하지 않는다.
 */
import { AccountExecutionGuardError } from './accountExecutionGuard.js';
import { isNaverLoginUrl } from './editorUrlState.js';
import { isLoginChallengeUrl } from './loginPageNavigationPolicy.js';

export const LOGIN_REDIRECT_SETTLE_MS = 15000;
const LOGIN_REDIRECT_POLL_MS = 500;

/** 로그인 주소에 있는 동안 네이버가 스스로 블로그로 돌려보내는지 지켜본다. 보호조치·본인확인 화면은 기다리지 않는다. */
export async function waitForLoginRedirectToSettle(
  page: { url(): string; isClosed?(): boolean },
  options: { timeoutMs?: number; delay?: (ms: number) => Promise<void>; ensureNotCancelled?: () => void } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? LOGIN_REDIRECT_SETTLE_MS;
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let waited = 0;
  let url = page.url();
  while (isNaverLoginUrl(url) && !isLoginChallengeUrl(url) && waited < timeoutMs && !page.isClosed?.()) {
    await delay(LOGIN_REDIRECT_POLL_MS);
    waited += LOGIN_REDIRECT_POLL_MS;
    options.ensureNotCancelled?.();
    url = page.url();
  }
  return url;
}

const EDITOR_FRAME_MISSING = /^메인 프레임(?:을 찾을 수 없습니다|으로 전환할 수 없습니다)/;

/**
 * "로그인을 못 알아봄 / 글쓰기 창을 못 찾음" 진입 실패만 크롬 재시작 1회 대상이다.
 * 보호조치·본인확인·계정 불일치·결과 불명·시작 전 거절은 바로 멈춘다.
 */
export function isRestartRecoverableEntryError(error: unknown): boolean {
  if (error instanceof AccountExecutionGuardError) {
    return !error.refusedBeforeStart && (error.code === 'LOGIN_REQUIRED' || error.code === 'NETWORK_WAIT');
  }
  return error instanceof Error && EDITOR_FRAME_MISSING.test(error.message);
}

/** 도메인·경로만 남긴다 — 로그인 주소의 쿼리에는 돌아갈 주소와 토큰이 실린다. */
export function describeUrlForLog(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'about:' ? value : `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return String(value).split('?')[0].slice(0, 120);
  }
}
