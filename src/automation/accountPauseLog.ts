/**
 * [2026-10-09] 계정이 멈출 때(가드 pause) 어디서·어느 화면에서·무엇 때문에 멈췄는지 기록 1줄로 남긴다.
 * 기록에는 계정 아이디 앞 3자, 화면 도메인+경로(쿼리·해시 제거), 호출 위치(함수@파일이름:줄)만 싣는다.
 * 접두어 [AccountGuard] 는 화면 전달 목록에 없어 화면에 두 번 뜨지 않는다. 이 모듈은 절대 throw 하지 않는다.
 * (URL 읽기 함수는 가드 모듈이 아닌 여기에 둔다 — 가드를 통째로 mock 하는 시험들이 세션 관리자 import 때 깨지지 않게.)
 */
import { redactKnownAccountId } from '../debug/privacyScrubber.js';

type PageUrlReader = (accountId: string) => string;
let pageUrlReader: PageUrlReader | null = null;

export function setPausePageUrlReader(reader: PageUrlReader | null): void {
  pageUrlReader = reader;
}

const STACK_FRAME = /^\s*at (?:async )?(?:(.+?) \()?(?:.*[\\/])?([^\\/()]+?):(\d+):\d+\)?\s*$/;
const SELF_FRAMES = /accountPauseLog|accountExecutionGuard/;

function parseFrame(line: string): string | null {
  const m = STACK_FRAME.exec(line);
  if (!m) return null;
  return `${m[1] ? `${m[1]}@` : ''}${m[2]}:${m[3]}`;
}

/** 호출 위치를 `함수@파일이름:줄 <- 한 단계 위` 로 줄인다. 경로는 버리고, 못 읽으면 '?'. */
export function describePauseCaller(stack: string | undefined): string {
  try {
    const frames = String(stack ?? '').split('\n').slice(1)
      .filter((line) => !SELF_FRAMES.test(line))
      .map(parseFrame)
      .filter((frame): frame is string => !!frame);
    if (!frames.length) return '?';
    return frames.slice(0, 2).join(' <- ');
  } catch { return '?'; }
}

/** 화면 주소를 도메인+경로만 남긴다(쿼리·해시 제거). blog.naver.com 의 첫 경로 칸(블로그 아이디)은 `*` 로 가린다. */
export function describePauseScreen(url: string | undefined | null, accountId: string): string {
  try {
    const raw = String(url ?? '').trim();
    if (!raw) return '(화면 없음)';
    const parsed = new URL(raw);
    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (/(^|\.)blog\.naver\.com$/i.test(parsed.hostname)) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length) { parts[0] = '*'; pathname = `/${parts.join('/')}`; }
    }
    return redactKnownAccountId(`${parsed.hostname}${pathname}`, accountId);
  } catch { return '(화면 읽기 실패)'; }
}

export function formatAccountPauseLine(input: { accountId: string; code: string; saved: boolean; url?: string | null; stack?: string }): string {
  const id = String(input.accountId || '').trim();
  const who = id ? `${id.substring(0, 3)}***` : '계정 미상';
  return `[AccountGuard] ⚠️ 계정 멈춤 ${input.saved ? '저장' : '저장 실패'}: ${input.code} · ${who} · 화면 ${describePauseScreen(input.url, id)} · 호출 ${describePauseCaller(input.stack)}`;
}

export function logAccountPause(accountId: string, code: string, saved: boolean, stack: string | undefined): void {
  try {
    let url = '';
    try { url = pageUrlReader ? pageUrlReader(accountId) : ''; } catch { url = ''; }
    console.warn(formatAccountPauseLine({ accountId, code, saved, url, stack }));
  } catch { /* 기록 실패가 멈춤 처리를 막으면 안 된다 */ }
}
