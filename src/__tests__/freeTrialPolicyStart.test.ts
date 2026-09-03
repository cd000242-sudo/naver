import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FREE_TRIAL_POLICY_START_MS } from '../licenseManager';

/**
 * [2026-08-26 사장님 규칙] 무료 체험 30일은 **9월 1일부터** 센다.
 *  - 9/1 전에는 기간 제한이 없다. 언제 등록했든 만료가 아니다.
 *  - 9/1 부터 30일. 기존 사용자도 그날이 출발선이다.
 *  - 9/5 에 처음 등록했다면 그날부터 30일.
 * 즉 카운트 시작 = 등록일과 시행일 중 늦은 쪽. → 기존 사용자는 10/1 만료.
 *
 * 실측 버그: 인증 화면(login.html)이 **등록일 + 30일**로 세고 있어,
 * 3월 등록자에게 "무료 체험 30일이 만료되어 결제 페이지로 안내합니다" 가 떴다.
 * licenseManager 는 9/1 규칙을 알고 있었는데 화면과 서버가 몰랐다.
 */
const POLICY = new Date('2026-09-01T00:00:00+09:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

const expired = (registeredIso: string, nowIso: string): boolean => {
  const now = new Date(nowIso).getTime();
  if (now < POLICY) return false;
  const from = Math.max(new Date(registeredIso).getTime(), POLICY);
  return from + 30 * DAY <= now;
};

describe('무료 체험 30일 시행일 (2026-09-01 KST)', () => {
  it('앱 상수가 9월 1일 자정(KST)이다', () => {
    expect(FREE_TRIAL_POLICY_START_MS).toBe(POLICY);
  });

  it('시행 전에는 등록일과 무관하게 만료가 아니다', () => {
    expect(expired('2026-03-26', '2026-08-26')).toBe(false);
    expect(expired('2025-01-01', '2026-08-31')).toBe(false);
  });

  it('기존 사용자도 9/1 이 출발선이라 10/1 에 만료된다', () => {
    expect(expired('2026-03-26', '2026-09-01')).toBe(false);
    expect(expired('2026-03-26', '2026-09-30')).toBe(false);
    expect(expired('2026-03-26', '2026-10-01')).toBe(true);
  });

  it('시행 후 새로 등록하면 그 날부터 30일이다', () => {
    expect(expired('2026-09-05', '2026-09-20')).toBe(false);
    expect(expired('2026-09-05', '2026-10-04')).toBe(false);
    expect(expired('2026-09-05', '2026-10-05')).toBe(true);
  });
});

describe('세 곳이 같은 규칙을 쓴다', () => {
  const login = readFileSync(join(__dirname, '..', '..', 'public', 'login.html'), 'utf-8');

  it('인증 화면이 등록일 + 30일로 세지 않는다', () => {
    // 이 계산이 3월 등록자를 만료로 만들었다.
    expect(login).not.toMatch(/new Date\(result\.registeredAt\)\.getTime\(\) \+ 30 \* 24 \* 60 \* 60 \* 1000/);
    expect(login).toMatch(/POLICY_START_MS/);
    expect(login).toMatch(/Math\.max\(registeredMs, POLICY_START_MS\)/);
  });

  it('인증 화면이 시행 전에는 만료로 막지 않는다', () => {
    expect(login).toMatch(/const beforePolicy = Date\.now\(\) < POLICY_START_MS/);
    expect(login).toMatch(/9월 1일부터 시작됩니다/);
  });

  it('체험 활성화(main.ts) 가 등록일 + 30일로 세지 않는다', () => {
    // [2026-09-03 실측] activateFreeTier 가 firstActivatedAt + 30일로만 세어,
    // 9/1 00:00 KST 를 넘긴 순간 8/2 이전 등록자 전원이 즉시 '만료' 판정을 받았다.
    // 그 거절 문구('만료')가 login.html 의 정규식에 걸려 페이월 모달로 둔갑,
    // 한 번도 쓰지 않은 사용자에게 '오늘 무료 사용량을 모두 쓰셨습니다' 가 떴다.
    const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf-8');
    expect(main).not.toMatch(
      /const trialExpiresAt = new Date\(new Date\(firstActivatedAt\)\.getTime\(\) \+ 30 \* 24 \* 60 \* 60 \* 1000\)/
    );
    expect(main).toMatch(/Math\.max\(\s*new Date\(firstActivatedAt\)\.getTime\(\),\s*licenseModule\.FREE_TRIAL_POLICY_START_MS/);
  });

  it('GAS 도 같은 시행일 규칙을 쓴다', () => {
    let gas: string;
    try {
      gas = readFileSync('C:/Users/박성현/Desktop/admin-panel/google-apps-script-code.gs', 'utf-8');
    } catch {
      return; // 다른 PC 에서는 건너뛴다
    }
    expect(gas).toMatch(/FREE_TRIAL_POLICY_START_MS_/);
    expect(gas).toMatch(/function isTrialExpiredByPolicy_/);
    expect(gas).toMatch(/Math\.max\(registered, FREE_TRIAL_POLICY_START_MS_\)/);
    expect(gas).toMatch(/isTrialExpiredByPolicy_\(registeredAtIso\)/);
  });
});
