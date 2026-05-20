/**
 * [v2.10.304] botBackoff 단위 테스트
 *
 * 검증 대상: 봇감지 backoff 기록/조회/만료 + 다중계정 로그인 시차
 * 10팀 검증 팀8 권고에 따라 테스트 추가.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordBotBackoff,
  getBotBackoff,
  isAccountBackedOff,
  clearBotBackoff,
  listActiveBackoffs,
  computeLoginStaggerDelayMs,
  computePostLoginHumanDelayMs,
} from '../utils/botBackoff';

beforeEach(() => {
  // 각 테스트 전 모든 backoff 리셋
  for (const rec of listActiveBackoffs()) {
    clearBotBackoff(rec.accountId);
  }
});

describe('recordBotBackoff', () => {
  it('reason별 기본 시간 적용 — too_many_attempts 12h', () => {
    const rec = recordBotBackoff('acc1', 'too_many_attempts');
    const hours = (rec.expiresAt - rec.startedAt) / 3_600_000;
    expect(hours).toBeCloseTo(12, 1);
  });

  it('reason별 기본 시간 — suspicious_login 8h', () => {
    const rec = recordBotBackoff('acc1', 'suspicious_login');
    const hours = (rec.expiresAt - rec.startedAt) / 3_600_000;
    expect(hours).toBeCloseTo(8, 1);
  });

  it('reason별 기본 시간 — new_environment 6h', () => {
    const rec = recordBotBackoff('acc1', 'new_environment');
    const hours = (rec.expiresAt - rec.startedAt) / 3_600_000;
    expect(hours).toBeCloseTo(6, 1);
  });

  it('reason별 기본 시간 — captcha 4h', () => {
    const rec = recordBotBackoff('acc1', 'captcha');
    const hours = (rec.expiresAt - rec.startedAt) / 3_600_000;
    expect(hours).toBeCloseTo(4, 1);
  });

  it('알 수 없는 reason은 default 6h', () => {
    const rec = recordBotBackoff('acc1', 'unknown_reason');
    const hours = (rec.expiresAt - rec.startedAt) / 3_600_000;
    expect(hours).toBeCloseTo(6, 1);
  });

  it('hoursOverride로 시간 강제 지정 가능', () => {
    const rec = recordBotBackoff('acc1', 'captcha', 24);
    const hours = (rec.expiresAt - rec.startedAt) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
  });
});

describe('getBotBackoff / isAccountBackedOff', () => {
  it('기록 없는 계정은 null 반환', () => {
    expect(getBotBackoff('acc-nonexistent')).toBeNull();
    expect(isAccountBackedOff('acc-nonexistent')).toBe(false);
  });

  it('기록 후 조회 성공', () => {
    recordBotBackoff('acc1', 'captcha');
    const rec = getBotBackoff('acc1');
    expect(rec).not.toBeNull();
    expect(rec?.reason).toBe('captcha');
    expect(isAccountBackedOff('acc1')).toBe(true);
  });

  it('만료된 기록은 자동 삭제 후 null 반환', () => {
    // 음수 시간으로 즉시 만료 시뮬레이션 (expiresAt < Date.now() 만족)
    recordBotBackoff('acc-expired', 'captcha', -0.001);
    expect(getBotBackoff('acc-expired')).toBeNull();
    expect(isAccountBackedOff('acc-expired')).toBe(false);
  });

  it('clearBotBackoff로 명시 제거', () => {
    recordBotBackoff('acc1', 'captcha');
    clearBotBackoff('acc1');
    expect(getBotBackoff('acc1')).toBeNull();
  });
});

describe('listActiveBackoffs', () => {
  it('빈 상태에서 빈 배열', () => {
    expect(listActiveBackoffs()).toEqual([]);
  });

  it('여러 계정 기록 후 모두 반환', () => {
    recordBotBackoff('acc1', 'captcha');
    recordBotBackoff('acc2', 'suspicious_login');
    recordBotBackoff('acc3', 'new_environment');
    const list = listActiveBackoffs();
    expect(list).toHaveLength(3);
    const ids = list.map(r => r.accountId).sort();
    expect(ids).toEqual(['acc1', 'acc2', 'acc3']);
  });

  it('만료된 기록은 list에서 제외 + 자동 삭제', () => {
    recordBotBackoff('acc1', 'captcha'); // 4h 활성
    recordBotBackoff('acc2', 'captcha', -0.001); // 음수로 즉시 만료
    const list = listActiveBackoffs();
    expect(list).toHaveLength(1);
    expect(list[0].accountId).toBe('acc1');
  });
});

describe('computeLoginStaggerDelayMs', () => {
  it('첫 계정(index=0)은 0ms — 즉시 로그인', () => {
    expect(computeLoginStaggerDelayMs(0)).toBe(0);
  });

  it('두 번째 계정(index=1) — 최소 3분 이상', () => {
    const delay = computeLoginStaggerDelayMs(1);
    expect(delay).toBeGreaterThanOrEqual(3 * 60 * 1000);
    // 3분 base + 0~7분 jitter = 3~10분
    expect(delay).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('5번째 계정(index=4) — 12~19분', () => {
    const delay = computeLoginStaggerDelayMs(4);
    // 4 * 3분 = 12분 base + 0~7분 jitter
    expect(delay).toBeGreaterThanOrEqual(12 * 60 * 1000);
    expect(delay).toBeLessThanOrEqual(19 * 60 * 1000);
  });

  it('음수 index도 0ms 반환 (방어)', () => {
    expect(computeLoginStaggerDelayMs(-1)).toBe(0);
  });
});

describe('computePostLoginHumanDelayMs', () => {
  it('7~13초 범위', () => {
    for (let i = 0; i < 20; i++) {
      const delay = computePostLoginHumanDelayMs();
      expect(delay).toBeGreaterThanOrEqual(7000);
      expect(delay).toBeLessThanOrEqual(13000);
    }
  });

  it('호출마다 다른 값(랜덤성 확인)', () => {
    const values = new Set<number>();
    for (let i = 0; i < 20; i++) {
      values.add(computePostLoginHumanDelayMs());
    }
    // 20회 호출에서 적어도 5개 이상 다른 값이 나와야 의미 있는 랜덤성
    expect(values.size).toBeGreaterThanOrEqual(5);
  });
});
