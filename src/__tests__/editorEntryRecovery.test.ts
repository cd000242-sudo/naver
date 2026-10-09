/**
 * [2026-10-09 고객 신고] "로그인돼 있는데 앱이 못 알아본다 — 크롬을 다 끄고 다시 열어야 인식한다."
 * 실측 두 건(10/8 311***, 10/9 tjd***) 모두 새 크롬의 첫 글쓰기 이동 직후 1초 안에 LOGIN_REQUIRED 로 멈췄고,
 * 10/9 건은 15초 뒤 같은 세션이 정상으로 확인됐다. 비밀번호는 절대 입력하지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  waitForLoginRedirectToSettle, isRestartRecoverableEntryError, describeUrlForLog, LOGIN_REDIRECT_SETTLE_MS,
} from '../automation/editorEntryRecovery';
import { shouldKeepProfileCookies } from '../automation/cookieRestorePolicy';
import { AccountExecutionGuardError } from '../automation/accountExecutionGuard';

function pageWith(urls: string[]) {
  let at = 0;
  return { url: () => urls[Math.min(at, urls.length - 1)], next: () => { at++; } };
}

describe('로그인 주소가 잠깐 보일 때 기다리기', () => {
  it('네이버가 스스로 블로그로 돌려보내면 그 주소를 돌려준다(입력 없이 지켜보기만)', async () => {
    const page = pageWith(['https://nid.naver.com/nidlogin.login?url=x', 'https://nid.naver.com/nidlogin.login?url=x', 'https://blog.naver.com/leadernam-?Redirect=Write&']);
    let waited = 0;
    const url = await waitForLoginRedirectToSettle(page, { delay: async (ms) => { waited += ms; page.next(); } });
    expect(url).toBe('https://blog.naver.com/leadernam-?Redirect=Write&');
    expect(waited).toBe(1000);
  });

  it('끝까지 로그인 화면이면 기다린 시간(15초)이 지나 로그인 주소를 그대로 돌려준다', async () => {
    const page = pageWith(['https://nid.naver.com/nidlogin.login']);
    let waited = 0;
    const url = await waitForLoginRedirectToSettle(page, { delay: async (ms) => { waited += ms; } });
    expect(url).toBe('https://nid.naver.com/nidlogin.login');
    expect(waited).toBe(LOGIN_REDIRECT_SETTLE_MS);
    expect(LOGIN_REDIRECT_SETTLE_MS).toBe(15000);
  });

  it('보호조치·본인확인 화면은 기다리지 않는다', async () => {
    let waited = 0;
    const url = await waitForLoginRedirectToSettle(pageWith(['https://nid.naver.com/user2/help/idSafetyRelease?x=1']), { delay: async (ms) => { waited += ms; } });
    expect(url).toContain('idSafetyRelease');
    expect(waited).toBe(0);
  });

  it('취소되면 기다리기를 멈춘다', async () => {
    const page = pageWith(['https://nid.naver.com/nidlogin.login']);
    await expect(waitForLoginRedirectToSettle(page, { delay: async () => {}, ensureNotCancelled: () => { throw new Error('취소'); } })).rejects.toThrow('취소');
  });
});

describe('크롬 재시작 1회 대상', () => {
  it('로그인 필요·네트워크 대기·에디터 프레임 못 찾음만 다시 시도한다', () => {
    expect(isRestartRecoverableEntryError(new AccountExecutionGuardError('LOGIN_REQUIRED'))).toBe(true);
    expect(isRestartRecoverableEntryError(new AccountExecutionGuardError('NETWORK_WAIT'))).toBe(true);
    expect(isRestartRecoverableEntryError(new Error('메인 프레임을 찾을 수 없습니다.\n페이지 URL: x'))).toBe(true);
    expect(isRestartRecoverableEntryError(new Error('메인 프레임으로 전환할 수 없습니다. iframe이 아직 로드되지 않았을 수 있습니다.'))).toBe(true);
  });

  it('보호조치·본인확인·계정 불일치·결과 불명·작업 중·시작 전 거절·그 밖의 오류는 다시 시도하지 않는다', () => {
    for (const code of ['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'ACCOUNT_MISMATCH', 'PUBLISH_OUTCOME_UNKNOWN', 'ACCOUNT_BUSY'] as const) {
      expect(isRestartRecoverableEntryError(new AccountExecutionGuardError(code))).toBe(false);
    }
    expect(isRestartRecoverableEntryError(new AccountExecutionGuardError('LOGIN_REQUIRED', undefined, true))).toBe(false);
    expect(isRestartRecoverableEntryError(new Error('EDITOR_DRAFT_CONTEXT_NOT_FRESH: 기존 작성중 글'))).toBe(false);
    expect(isRestartRecoverableEntryError(new Error('사용자가 취소했습니다'))).toBe(false);
    expect(isRestartRecoverableEntryError('문자열')).toBe(false);
  });

  it('기록용 주소는 도메인·경로만 남긴다(쿼리에 토큰이 실릴 수 있다)', () => {
    expect(describeUrlForLog('https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fblog&token=abc')).toBe('nid.naver.com/nidlogin.login');
    expect(describeUrlForLog('about:blank')).toBe('about:blank');
  });
});

describe('쿠키 복원: 크롬 프로필의 로그인을 덮어쓰지 않는다', () => {
  const now = 1_800_000_000;
  it('프로필에 살아 있는 NID_AUT 가 있으면 저장본으로 덮어쓰지 않는다', () => {
    expect(shouldKeepProfileCookies([{ name: 'NID_AUT', value: 'x', expires: now + 1000 }], now)).toBe(true);
    expect(shouldKeepProfileCookies([{ name: 'NID_AUT', value: 'x', expires: -1 }], now)).toBe(true);
  });
  it('프로필에 로그인 쿠키가 없거나 비었거나 만료됐으면 저장본을 넣는다(세션 쿠키 계정은 크롬을 끄면 사라진다)', () => {
    expect(shouldKeepProfileCookies([], now)).toBe(false);
    expect(shouldKeepProfileCookies([{ name: 'NID_SES', value: 'x', expires: -1 }], now)).toBe(false);
    expect(shouldKeepProfileCookies([{ name: 'NID_AUT', value: '', expires: -1 }], now)).toBe(false);
    expect(shouldKeepProfileCookies([{ name: 'NID_AUT', value: 'x', expires: now - 10 }], now)).toBe(false);
  });
});
