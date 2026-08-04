import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-04] 일일 리셋 타임존 버그.
 *
 * 사용자 신고: "일일 리셋이 안 되거나 카운팅이 안 돼서 3회 이상 쓸 수 있게 되면
 * 골치아프다."
 *
 * 발행 카운터(postLimitManager / postLimitManagerPerAccount)가
 * `new Date().toISOString().slice(0, 10)` 로 **UTC 날짜**를 썼다. KST는 UTC+9라
 * 한국 시간 자정이 아니라 **오전 9시**에 리셋됐다 — 00:00~08:59 사이에는
 * 전날 카운터가 그대로 이어졌고, 오전 9시에 갑자기 0이 됐다.
 *
 * 무료 체험 3회 한도를 담당하는 quotaManager는 원래부터 로컬 달력 기준이라
 * 정상이었다. 세 모듈의 날짜 기준을 하나로 맞춘다.
 */
const COUNTER_MODULES = [
  'postLimitManager.ts',
  'postLimitManagerPerAccount.ts',
  'quotaManager.ts',
];

describe('일일 리셋 — 로컬(한국) 달력 기준', () => {
  it('발행 카운터가 UTC 날짜를 쓰지 않는다', () => {
    for (const mod of COUNTER_MODULES) {
      // 주석에 남긴 "이전에는 …를 썼다" 설명이 걸리지 않도록 코드 라인만 본다.
      const codeLines = read(mod)
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
      for (const line of codeLines) {
        expect(line, `${mod}: ${line.trim()}`).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);
        expect(line, `${mod}: ${line.trim()}`).not.toMatch(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/);
      }
    }
  });

  it('세 모듈 모두 동일한 로컬 날짜 키 규칙을 쓴다', () => {
    for (const mod of COUNTER_MODULES) {
      const src = read(mod);
      expect(src, mod).toContain('function getLocalDateKey(): string');
      expect(src, mod).toMatch(/now\.getFullYear\(\)/);
      expect(src, mod).toMatch(/now\.getMonth\(\) \+ 1/);
      expect(src, mod).toMatch(/now\.getDate\(\)/);
    }
  });

  it('로컬 날짜 키 규칙이 자정 경계에서 정확하다 (규칙 재현 검증)', () => {
    // 실제 코드와 동일한 규칙
    const localKey = (d: Date): string => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    // 한국 시간 자정 직전/직후에 날짜가 바뀐다 (로컬 시간 기준 Date 생성)
    const justBeforeMidnight = new Date(2026, 7, 4, 23, 59, 59);
    const justAfterMidnight = new Date(2026, 7, 5, 0, 0, 1);
    expect(localKey(justBeforeMidnight)).toBe('2026-08-04');
    expect(localKey(justAfterMidnight)).toBe('2026-08-05');

    // 오전 9시에는 날짜가 바뀌지 않는다 (UTC 자르기였다면 여기서 바뀌었다)
    const beforeNine = new Date(2026, 7, 5, 8, 59, 0);
    const afterNine = new Date(2026, 7, 5, 9, 0, 1);
    expect(localKey(beforeNine)).toBe(localKey(afterNine));

    // 한 자리 월·일 zero-padding
    expect(localKey(new Date(2026, 0, 3, 12, 0, 0))).toBe('2026-01-03');
  });

  it('무료 체험 한도는 발행 한도 해제와 무관하게 3회를 유지한다', async () => {
    const { FREE_TRIAL_DAILY_PUBLISH_LIMIT, createFreeTrialQuotaLimits } = await import('../freeTrialPolicy');
    expect(FREE_TRIAL_DAILY_PUBLISH_LIMIT).toBe(3);
    const limits = createFreeTrialQuotaLimits();
    expect(limits.publish).toBe(3);
    expect(limits.content).toBe(3);
  });
});
