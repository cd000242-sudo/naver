import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { resolveRateLimitKey } from '../main/services/BlogExecutor';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-04] ULTRA 안정화 플랜 R4 — 스케줄·한도 P0.
 *
 * R4-1: 시간당 발행 가드가 체크와 증가에서 서로 다른 키를 써서 실질적으로
 *       동작하지 않았다. 체크는 payload.accountId||payload.naverId,
 *       증가는 resolveAccount가 돌려준 account.accountId(payload 자격증명
 *       경로에서는 undefined)였다 — 카운터가 오르지 않거나 다른 이름으로 올랐다.
 * R4-2: 예약 cron이 한 틱에서 due한 예약을 전부 연속 발행했다. 라이브 색인
 *       조사에서 "90분에 3~5건 몰아치기"가 노출 누락 원인으로 확인된 패턴.
 */
describe('R4-1: 발행 빈도 카운터 키 통일', () => {
  it('accountId가 있으면 accountId를 쓴다', () => {
    expect(resolveRateLimitKey({ accountId: 'acct-1', naverId: 'naver-1' })).toBe('acct-1');
  });

  it('accountId가 없으면 naverId로 떨어진다 (payload 자격증명 경로)', () => {
    expect(resolveRateLimitKey({ naverId: 'naver-1' })).toBe('naver-1');
    expect(resolveRateLimitKey({ accountId: '', naverId: 'naver-1' })).toBe('naver-1');
    expect(resolveRateLimitKey({ accountId: '   ', naverId: 'naver-1' })).toBe('naver-1');
  });

  it('둘 다 없으면 빈 문자열 — 호출부가 가드를 건너뛴다', () => {
    expect(resolveRateLimitKey({})).toBe('');
    expect(resolveRateLimitKey(null)).toBe('');
    expect(resolveRateLimitKey(undefined)).toBe('');
  });

  it('공백은 정규화된다 (같은 계정이 다른 키로 세지 않도록)', () => {
    expect(resolveRateLimitKey({ accountId: '  acct-1  ' })).toBe('acct-1');
  });

  it('체크와 증가가 모두 이 리졸버를 거친다', () => {
    const src = read('main/services/BlogExecutor.ts');
    // 체크(executePublishing 진입부)
    expect(src).toContain('const _accountId = resolveRateLimitKey(payload as any);');
    // 증가(cleanup)
    expect(src).toContain('const rateLimitKey = resolveRateLimitKey({ accountId, naverId: (payload as any).naverId });');
    expect(src).toContain('await incrementForAccount(rateLimitKey);');
    // 예전의 서로 다른 키가 남아 있지 않다
    expect(src).not.toContain("const _accountId = (payload as any).accountId || (payload as any).naverId;");
  });
});

describe('R4-2: 예약 cron 틱당 1건 (몰아치기 방지)', () => {
  const main = read('main.ts');

  it('한 건 처리 후 루프를 벗어난다', () => {
    expect(main).toContain('// [2026-08-04] 한 틱에 1건만 발행한다.');
    expect(main).toMatch(/directLease\.release\(\);\s*\}\s*[\s\S]{0,900}?\n            break;/);
  });

  it('잔여 due 건수를 사용자에게 알린다 (조용한 순연 금지)', () => {
    expect(main).toContain('몰아치기 발행을 피하려고 다음 점검(1분 뒤)에 이어서 발행합니다');
    expect(main).toMatch(/const remainingDue = scheduledPosts\.filter/);
  });

  it('예약이 삭제되거나 실패 처리되지 않는다 (순연일 뿐)', () => {
    // break 직전에 상태를 failed로 바꾸는 코드가 끼어들지 않았는지
    const tail = main.slice(main.indexOf('// [2026-08-04] 한 틱에 1건만 발행한다.'));
    const untilBreak = tail.slice(0, tail.indexOf('break;'));
    expect(untilBreak).not.toContain('createFailedScheduledPostState');
    expect(untilBreak).not.toContain('deleteScheduledPost');
  });
});
