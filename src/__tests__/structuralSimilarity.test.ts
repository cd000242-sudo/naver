import { describe, it, expect } from 'vitest';
import {
  buildSkeleton,
  skeletonSimilarity,
  scanStructuralSimilarity,
} from '../validators/seo/structuralSimilarityScanner';
import type { CheckableContent } from '../contentQualityChecker';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPEC-AEO-EXPOSURE-2026 R0 — anti-homogenization scanner
// advisory only, pure function, no I/O, not wired to publish pipeline.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const defPost: CheckableContent = {
  headings: [
    { title: '청년도약계좌란', body: '청년도약계좌는 정부가 지원하는 5년 만기 적금이에요. 자세히 봅니다. 이어서 조건을 설명합니다.' },
    { title: '가입 조건', body: '가입 조건의 핵심은 소득 기준입니다. 연 소득과 가구 기준을 함께 봐야 합니다.' },
    { title: '신청 방법은?', body: '신청은 앱에서 가능합니다. 단계별로 정리합니다.' },
  ],
};

// Same structural skeleton as defPost (same heading count / question ratio / similar lengths / same intro type)
const defPostClone: CheckableContent = {
  headings: [
    { title: '에너지캐시백이란', body: '에너지캐시백은 전기 절약분에 지급되는 환급금이에요. 자세히 봅니다. 이어서 조건을 설명합니다.' },
    { title: '신청 자격', body: '신청 자격의 핵심은 거주 요건입니다. 세대주 여부와 주소를 함께 봐야 합니다.' },
    { title: '받는 방법은?', body: '수령은 계좌로 가능합니다. 단계별로 정리합니다.' },
  ],
};

// Structurally very different: 1 heading, emotional opening, long single block, no question heading
const distinctPost: CheckableContent = {
  headings: [
    {
      title: '다이슨 에어랩 솔직 후기',
      body: '솔직히 저도 처음엔 반신반의했거든요. 그런데 한 달을 매일 써보니 생각이 완전히 바뀌었습니다. ' +
        '아침마다 머리를 말리는 시간이 절반으로 줄었고, 곱슬기도 눈에 띄게 정돈됐어요. 가격이 부담스러웠지만 ' +
        '드라이기와 고데기를 따로 쓰던 걸 생각하면 오히려 합리적이라는 결론에 도달했습니다.',
    },
  ],
};

describe('buildSkeleton', () => {
  it('extracts heading count, question ratio, and length stats', () => {
    const s = buildSkeleton(defPost);
    expect(s.headingCount).toBe(3);
    // one of three headings is a question ("신청 방법은?")
    expect(s.questionHeadingRatio).toBeCloseTo(1 / 3, 5);
    expect(s.avgBodyLen).toBeGreaterThan(0);
    expect(s.bodyLenCv).toBeGreaterThanOrEqual(0);
  });

  it('classifies a definition opening', () => {
    expect(buildSkeleton(defPost).introPatternKey).toBe('definition');
  });

  it('classifies an emotional opening', () => {
    expect(buildSkeleton(distinctPost).introPatternKey).toBe('emotional');
  });

  it('handles empty content without throwing', () => {
    const s = buildSkeleton({});
    expect(s.headingCount).toBe(0);
    expect(s.avgBodyLen).toBe(0);
    expect(s.bodyLenCv).toBe(0);
  });
});

describe('skeletonSimilarity', () => {
  it('returns 1 for an identical skeleton', () => {
    const s = buildSkeleton(defPost);
    expect(skeletonSimilarity(s, s)).toBeCloseTo(1, 5);
  });

  it('returns a high score for the same structural template', () => {
    const a = buildSkeleton(defPost);
    const b = buildSkeleton(defPostClone);
    expect(skeletonSimilarity(a, b)).toBeGreaterThan(0.85);
  });

  it('returns a low score for structurally different posts', () => {
    const a = buildSkeleton(defPost);
    const b = buildSkeleton(distinctPost);
    expect(skeletonSimilarity(a, b)).toBeLessThan(0.6);
  });

  it('is symmetric', () => {
    const a = buildSkeleton(defPost);
    const b = buildSkeleton(distinctPost);
    expect(skeletonSimilarity(a, b)).toBeCloseTo(skeletonSimilarity(b, a), 5);
  });
});

describe('scanStructuralSimilarity', () => {
  it('flags homogeneity when a near-identical template exists in history', () => {
    const r = scanStructuralSimilarity(defPost, [defPostClone]);
    expect(r.comparedCount).toBe(1);
    expect(r.maxSimilarity).toBeGreaterThan(0.85);
    expect(r.isHomogeneous).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('does not flag when history is structurally diverse', () => {
    const r = scanStructuralSimilarity(defPost, [distinctPost]);
    expect(r.isHomogeneous).toBe(false);
    expect(r.warnings).toHaveLength(0);
  });

  it('returns no warning and not homogeneous when history is empty', () => {
    const r = scanStructuralSimilarity(defPost, []);
    expect(r.comparedCount).toBe(0);
    expect(r.isHomogeneous).toBe(false);
    expect(r.maxSimilarity).toBe(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('respects a custom threshold via options', () => {
    // With a very high threshold, the clone should no longer count as homogeneous.
    const r = scanStructuralSimilarity(defPost, [defPostClone], { threshold: 0.999 });
    expect(r.isHomogeneous).toBe(false);
  });

  it('uses meanSimilarity across multiple history items', () => {
    const r = scanStructuralSimilarity(defPost, [defPostClone, distinctPost]);
    expect(r.comparedCount).toBe(2);
    // max should track the clone, mean should sit between the two pairwise scores
    expect(r.maxSimilarity).toBeGreaterThan(r.meanSimilarity);
  });
});
