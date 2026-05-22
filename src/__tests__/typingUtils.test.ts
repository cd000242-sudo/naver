import { describe, it, expect } from 'vitest';
import { extractCoreKeywords, SHOPPING_HOOKS, humanInterKeyDelay } from '../automation/typingUtils';

describe('extractCoreKeywords', () => {
  it('extracts the most frequent/longest keyword', () => {
    const result = extractCoreKeywords('맛있는 돈까스 맛집 돈까스 추천 돈까스');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('돈까스'); // 3회 등장, 점수 최고
  });

  it('returns empty array for empty text', () => {
    expect(extractCoreKeywords('')).toEqual([]);
  });

  it('filters out single-character words', () => {
    const result = extractCoreKeywords('a b c 키워드 추출');
    // 한 글자 단어는 제외됨
    expect(result.every(w => w.length >= 2)).toBe(true);
  });

  it('removes punctuation before processing', () => {
    const result = extractCoreKeywords('맛집! 맛집? 맛집.');
    expect(result[0]).toBe('맛집');
  });

  it('returns max 1 keyword (가독성 제한)', () => {
    const result = extractCoreKeywords('서울 맛집 추천 서울 여행 서울 관광 맛집 추천');
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('scores by frequency * 2 + length', () => {
    // "짧은" appears 1x (score: 1*2 + 2 = 4)
    // "긴키워드임" appears 2x (score: 2*2 + 5 = 9)
    const result = extractCoreKeywords('짧은 긴키워드임 긴키워드임');
    expect(result[0]).toBe('긴키워드임');
  });
});

describe('humanInterKeyDelay (A3 본문 타이핑 인간화)', () => {
  const samples = Array.from({ length: 5000 }, () => humanInterKeyDelay());

  it('always returns a positive integer', () => {
    samples.forEach(d => {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    });
  });

  it('clamps base delays within the profile range (pauses may extend it)', () => {
    // 최소값은 프로파일 minMs(10) 이상
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(10);
    // 최대값은 clamp(120) + 휴식(최대 300) 이내
    expect(Math.max(...samples)).toBeLessThanOrEqual(420);
  });

  it('produces a non-uniform distribution (defeats fixed-interval bot signal)', () => {
    // 고정 간격이 아님을 보장 — 고유값이 충분히 많아야 함
    const unique = new Set(samples);
    expect(unique.size).toBeGreaterThan(50);
  });

  it('keeps the effective mean near the fast-human target (~40ms)', () => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(28);
    expect(mean).toBeLessThan(60);
  });
});

describe('SHOPPING_HOOKS', () => {
  it('has 6 hook messages', () => {
    expect(SHOPPING_HOOKS).toHaveLength(6);
  });

  it('all hooks are non-empty strings', () => {
    SHOPPING_HOOKS.forEach(hook => {
      expect(typeof hook).toBe('string');
      expect(hook.length).toBeGreaterThan(0);
    });
  });
});
