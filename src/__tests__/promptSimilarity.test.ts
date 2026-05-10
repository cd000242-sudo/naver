/**
 * 헤딩간 prompt 유사도 진단 단위 테스트.
 *
 * Flow가 같은 이미지 4개 반환하는 회귀의 *상류 진단*. 본 테스트가 빨개지면
 * Flow 결과 차별화 메커니즘 외에 *콘텐츠 생성 단계*도 점검해야 한다는 신호.
 */

import { describe, it, expect } from 'vitest';
import {
  tokenizePromptForSimilarity,
  jaccardSimilarity,
  diagnosePromptSimilarity,
} from '../image/promptSimilarity';

describe('tokenizePromptForSimilarity', () => {
  it('한글 + 영문 + 숫자 분리', () => {
    const t = tokenizePromptForSimilarity('A girl group photo, 2026년, K-pop idols');
    expect(t.has('girl')).toBe(true);
    expect(t.has('group')).toBe(true);
    expect(t.has('photo')).toBe(true);
    expect(t.has('idols')).toBe(true);
    expect(t.has('2026년')).toBe(true);
  });

  it('1-2자 토큰 제외 (noise 차단)', () => {
    const t = tokenizePromptForSimilarity('A b cd 한 나 가다나 abcd');
    expect(t.has('a')).toBe(false);
    expect(t.has('b')).toBe(false);
    expect(t.has('cd')).toBe(false);
    expect(t.has('한')).toBe(false);
    expect(t.has('나')).toBe(false);
    expect(t.has('가다')).toBe(false); // 2자 → 제외
    expect(t.has('가다나')).toBe(true); // 3자 → 포함
    expect(t.has('abcd')).toBe(true);
  });

  it('빈 입력 안전', () => {
    expect(tokenizePromptForSimilarity('').size).toBe(0);
    expect(tokenizePromptForSimilarity(null as any).size).toBe(0);
    expect(tokenizePromptForSimilarity(undefined as any).size).toBe(0);
  });

  it('대소문자 무시', () => {
    const t1 = tokenizePromptForSimilarity('Photo IMAGE Picture');
    const t2 = tokenizePromptForSimilarity('photo image picture');
    expect(Array.from(t1).sort()).toEqual(Array.from(t2).sort());
  });
});

describe('jaccardSimilarity', () => {
  it('동일 집합은 1', () => {
    const a = new Set(['photo', 'image']);
    const b = new Set(['photo', 'image']);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it('완전 다른 집합은 0', () => {
    const a = new Set(['cat']);
    const b = new Set(['dog']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('절반 겹치면 0.33 (1/3 union)', () => {
    const a = new Set(['x', 'y']);
    const b = new Set(['y', 'z']);
    // intersect=1, union=3 → 0.333
    expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3, 5);
  });

  it('빈 집합은 0', () => {
    expect(jaccardSimilarity(new Set(), new Set(['x']))).toBe(0);
    expect(jaccardSimilarity(new Set(['x']), new Set())).toBe(0);
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });
});

describe('diagnosePromptSimilarity — verdict 분류', () => {
  it('완전 다른 prompt 4개 → ok', () => {
    const r = diagnosePromptSimilarity([
      'cat playing piano',
      'dog jumping high',
      'bird flying south',
      'fish swimming deep',
    ]);
    expect(r.verdict).toBe('ok');
    expect(r.maxSimilarity).toBeLessThan(0.6);
  });

  it('완전 동일 prompt 4개 → danger (maxSim=1)', () => {
    const same = 'girl group photo studio recording session';
    const r = diagnosePromptSimilarity([same, same, same, same]);
    expect(r.verdict).toBe('danger');
    expect(r.maxSimilarity).toBe(1);
    expect(r.totalPairs).toBe(6); // C(4,2)
    expect(r.highSimilarPairs).toBe(6);
  });

  it('약간 다른 prompt → warning (절반 이상이 비슷)', () => {
    const r = diagnosePromptSimilarity([
      'girl group photo studio',
      'girl group photo recording',
      'girl group photo session',
      'totally different content here',
    ]);
    // 첫 3개는 서로 매우 비슷 (3 페어 highSim), 4번째와는 다름 (3 페어 low)
    expect(r.highSimilarPairs).toBeGreaterThanOrEqual(3);
    expect(r.totalPairs).toBe(6);
    // ratio = 3/6 = 0.5 → warning
    expect(['warning', 'danger']).toContain(r.verdict);
  });

  it('1개 prompt만 → ok (페어 없음)', () => {
    const r = diagnosePromptSimilarity(['only one']);
    expect(r.verdict).toBe('ok');
    expect(r.totalPairs).toBe(0);
  });

  it('빈 입력 안전', () => {
    expect(diagnosePromptSimilarity([]).verdict).toBe('ok');
    expect(diagnosePromptSimilarity(['', '', '']).maxSimilarity).toBe(0);
  });

  it('maxPair는 가장 비슷한 페어 인덱스 반환', () => {
    const r = diagnosePromptSimilarity([
      'apple banana cherry',
      'completely unrelated dog',
      'apple banana cherry orange',
    ]);
    // 0-2 페어가 가장 유사
    expect(r.maxPair).toEqual([0, 2]);
    expect(r.maxSimilarity).toBeGreaterThan(0.6);
  });
});

describe('실 사용자 시나리오 재현', () => {
  it('걸그룹 같은 이미지 4장 — 사용자 신고 케이스 시뮬', () => {
    const r = diagnosePromptSimilarity([
      'Korean girl group studio recording session, smiling members holding award',
      'Korean girl group studio recording session, smiling members holding award',
      'Korean girl group studio recording session, smiling members holding award',
      'Korean girl group studio recording session, smiling members holding award',
    ]);
    // 완전 동일 → danger
    expect(r.verdict).toBe('danger');
    expect(r.maxSimilarity).toBe(1);
  });

  it('헤딩 variation hint prepend된 prompt — 다양화 효과 검증', () => {
    const base = 'Korean girl group studio recording award';
    const variations = [
      `low-angle close-up\n\n${base}`,
      `wide-angle landscape view\n\n${base}`,
      `over-the-shoulder perspective\n\n${base}`,
      `top-down bird-eye view\n\n${base}`,
    ];
    const r = diagnosePromptSimilarity(variations);
    // base 부분이 같아 maxSim 높지만 hint 다름 → 0.7~0.85 정도 예상
    expect(r.maxSimilarity).toBeLessThan(1);
    expect(r.maxSimilarity).toBeGreaterThan(0.5);
  });

  it('정상적으로 다양한 헤딩 — 4 카테고리 prompt', () => {
    const r = diagnosePromptSimilarity([
      'Sunset beach landscape with palm trees and ocean waves',
      'Modern kitchen interior with marble countertops cooking utensils',
      'Hiking mountain trail forest pine trees backpack adventure',
      'City skyscraper night skyline neon lights traffic streets',
    ]);
    expect(r.verdict).toBe('ok');
  });
});
