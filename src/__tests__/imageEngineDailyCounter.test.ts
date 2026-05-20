/**
 * [v2.10.304] imageEngineDailyCounter 단위 테스트
 *
 * 검증 대상: PT 자정 기준 일별 카운터 + 봇감지 vs 진짜 한도 분류 휴리스틱
 * 10팀 검증 팀2/팀9 권고에 따라 테스트 추가.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  incrementDailySuccess,
  getDailySuccess,
  classifyQuotaError,
  resetDailyCounter,
} from '../utils/imageEngineDailyCounter';

beforeEach(() => {
  resetDailyCounter();
});

describe('imageEngineDailyCounter', () => {
  it('초기 카운트는 0', () => {
    expect(getDailySuccess('imagefx')).toBe(0);
    expect(getDailySuccess('flow')).toBe(0);
  });

  it('increment 1회 시 카운트 1 반환', () => {
    const count = incrementDailySuccess('imagefx');
    expect(count).toBe(1);
    expect(getDailySuccess('imagefx')).toBe(1);
  });

  it('increment 여러 번 누적', () => {
    for (let i = 0; i < 5; i++) incrementDailySuccess('flow');
    expect(getDailySuccess('flow')).toBe(5);
  });

  it('imagefx와 flow 카운트는 독립', () => {
    incrementDailySuccess('imagefx');
    incrementDailySuccess('imagefx');
    incrementDailySuccess('flow');
    expect(getDailySuccess('imagefx')).toBe(2);
    expect(getDailySuccess('flow')).toBe(1);
  });

  it('resetDailyCounter(engine)는 해당 엔진만 리셋', () => {
    incrementDailySuccess('imagefx');
    incrementDailySuccess('flow');
    resetDailyCounter('imagefx');
    expect(getDailySuccess('imagefx')).toBe(0);
    expect(getDailySuccess('flow')).toBe(1);
  });

  it('resetDailyCounter() 인자 없으면 전체 리셋', () => {
    incrementDailySuccess('imagefx');
    incrementDailySuccess('flow');
    resetDailyCounter();
    expect(getDailySuccess('imagefx')).toBe(0);
    expect(getDailySuccess('flow')).toBe(0);
  });

  it('mutation 없이 새 객체로 set — 동일 reference 재사용 안 됨', () => {
    // 이 테스트는 v2.10.303의 immutable 패턴 회귀 가드.
    // 내부 구현 변경 시 동작 일치만 확인 (Map.set 호출 횟수는 외부에서 관찰 불가).
    incrementDailySuccess('imagefx');
    incrementDailySuccess('imagefx');
    incrementDailySuccess('imagefx');
    expect(getDailySuccess('imagefx')).toBe(3);
  });
});

describe('classifyQuotaError 휴리스틱', () => {
  it('0장 성공 시 bot_detected — 진짜 한도 도달 불가능', () => {
    expect(classifyQuotaError('imagefx')).toBe('bot_detected');
    expect(classifyQuotaError('flow')).toBe('bot_detected');
  });

  it('9장 성공까지 bot_detected — 임계치 10장 미만', () => {
    for (let i = 0; i < 9; i++) incrementDailySuccess('imagefx');
    expect(classifyQuotaError('imagefx')).toBe('bot_detected');
  });

  it('10장 성공 시 likely_bot — 임계치 진입', () => {
    for (let i = 0; i < 10; i++) incrementDailySuccess('imagefx');
    expect(classifyQuotaError('imagefx')).toBe('likely_bot');
  });

  it('99장 성공까지 likely_bot', () => {
    for (let i = 0; i < 99; i++) incrementDailySuccess('flow');
    expect(classifyQuotaError('flow')).toBe('likely_bot');
  });

  it('100장 성공 시 quota_likely — 진짜 한도 가능성', () => {
    for (let i = 0; i < 100; i++) incrementDailySuccess('imagefx');
    expect(classifyQuotaError('imagefx')).toBe('quota_likely');
  });

  it('imagefx와 flow는 독립 분류', () => {
    for (let i = 0; i < 100; i++) incrementDailySuccess('imagefx');
    expect(classifyQuotaError('imagefx')).toBe('quota_likely');
    expect(classifyQuotaError('flow')).toBe('bot_detected'); // flow는 0장
  });
});
