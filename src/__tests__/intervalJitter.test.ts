import { describe, it, expect } from 'vitest';
import { applyIntervalJitter } from '../renderer/modules/intervalJitter.js';

describe('applyIntervalJitter (A5 발행 간격 jitter)', () => {
  it('0 이하 입력은 그대로 반환한다 (대기 없음 보존)', () => {
    expect(applyIntervalJitter(0)).toBe(0);
    expect(applyIntervalJitter(-5)).toBe(-5);
  });

  it('비유한 입력은 그대로 반환한다', () => {
    expect(applyIntervalJitter(NaN)).toBeNaN();
    expect(applyIntervalJitter(Infinity)).toBe(Infinity);
  });

  it('결과가 항상 ±40% 범위 안에 있다', () => {
    const base = 600; // 10분
    for (let i = 0; i < 5000; i++) {
      const out = applyIntervalJitter(base);
      expect(out).toBeGreaterThanOrEqual(Math.round(base * 0.6));
      expect(out).toBeLessThanOrEqual(Math.round(base * 1.4));
    }
  });

  it('고정 간격을 비균일하게 흩뜨린다 (패턴화 방지)', () => {
    const samples = Array.from({ length: 1000 }, () => applyIntervalJitter(600));
    expect(new Set(samples).size).toBeGreaterThan(50);
  });

  it('24시간(86400초) 상한을 넘지 않는다', () => {
    for (let i = 0; i < 1000; i++) {
      expect(applyIntervalJitter(86400)).toBeLessThanOrEqual(86400);
    }
  });

  it('최소 1초 이상을 보장한다', () => {
    for (let i = 0; i < 1000; i++) {
      expect(applyIntervalJitter(1)).toBeGreaterThanOrEqual(1);
    }
  });

  it('jitter 평균은 원래 간격에 수렴한다', () => {
    const base = 1800;
    const samples = Array.from({ length: 20000 }, () => applyIntervalJitter(base));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // 균등 분포 ±40% → 평균은 base에 근접 (±5% 허용)
    expect(mean).toBeGreaterThan(base * 0.95);
    expect(mean).toBeLessThan(base * 1.05);
  });
});
