/**
 * SPEC-CONVERSION-001 L4-2.4 — promptReviewer 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { reviewPrompt, renderReportMarkdown } from '../monitor/promptReviewer';
import type { PatternExtractorResult } from '../monitor/rlhfPatternExtractor';

function makeResult(overrides: Partial<PatternExtractorResult> = {}): PatternExtractorResult {
  return {
    metric: 'conversionRate',
    totalPosts: 50,
    topPosts: [
      // 최소 1개 더미 — fallback 트리거 회피용
      {
        postId: 'p1', metricValue: 0.3,
        aggregate: {
          postId: 'p1', impressionCount: 100, clickCount: 30, addToCartCount: 0,
          purchaseCount: 9, totalValue: 0,
          clickRate: 0.3, conversionRate: 0.3,
          firstSeenAt: '', lastSeenAt: '',
        },
      },
    ],
    aggregatedPatterns: {
      avgCharCount: 2400,
      avgHeadingCount: 5.2,
      avgImageCount: 4.8,
      topStructureSignatures: [
        { signature: '1-2-2-2-2', count: 7 },
        { signature: '1-2-2-2-3', count: 3 },
      ],
      topKeywords: [
        { term: '카페', postCount: 8 },
        { term: '인테리어', postCount: 6 },
        { term: '메뉴', postCount: 5 },
        { term: '분위기', postCount: 4 },
        { term: '디저트', postCount: 3 },
      ],
      perCategory: { food: 10 },
    },
    ...overrides,
  };
}

describe('reviewPrompt — 격차 감지', () => {
  it('분량 격차 high', () => {
    const r = reviewPrompt({
      extractorResult: makeResult(),
      currentBaseline: { targetCharCount: 1500 },
    });
    expect(r.suggestions.find((s) => s.category === 'length' && s.severity === 'high')).toBeDefined();
  });

  it('분량 격차 medium', () => {
    const r = reviewPrompt({
      extractorResult: makeResult(),
      currentBaseline: { targetCharCount: 2200 },
    });
    expect(r.suggestions.find((s) => s.category === 'length')?.severity).toBe('medium');
  });

  it('헤딩 격차', () => {
    const r = reviewPrompt({
      extractorResult: makeResult(),
      currentBaseline: { targetHeadingCount: 3 },
    });
    expect(r.suggestions.find((s) => s.category === 'structure')).toBeDefined();
  });

  it('이미지 격차', () => {
    const r = reviewPrompt({
      extractorResult: makeResult(),
      currentBaseline: { targetImageCount: 2 },
    });
    expect(r.suggestions.find((s) => s.category === 'image')).toBeDefined();
  });

  it('키워드 미반영 감지', () => {
    const r = reviewPrompt({
      extractorResult: makeResult(),
      currentBaseline: { currentTopKeywords: ['커피', '음악'] },
    });
    const kwSug = r.suggestions.find((s) => s.category === 'keyword');
    expect(kwSug).toBeDefined();
    expect(kwSug!.observation).toMatch(/카페|인테리어|메뉴/);
  });

  it('단일 시그니처 편중 high', () => {
    const r = reviewPrompt({
      extractorResult: makeResult({
        aggregatedPatterns: {
          avgCharCount: 0, avgHeadingCount: 0, avgImageCount: 0,
          topStructureSignatures: [
            { signature: '1-2-2-2-2', count: 8 },
            { signature: '1-2-2-2-3', count: 1 },
          ],
          topKeywords: [],
          perCategory: {},
        },
      }),
      currentBaseline: {},
    });
    const sug = r.suggestions.find((s) => s.severity === 'high' && /시그니처/.test(s.observation));
    expect(sug).toBeDefined();
  });

  it('패턴 일치 시 제안 없음', () => {
    const r = reviewPrompt({
      extractorResult: makeResult({
        aggregatedPatterns: {
          avgCharCount: 0, avgHeadingCount: 0, avgImageCount: 0,
          topStructureSignatures: [], topKeywords: [], perCategory: {},
        },
      }),
      currentBaseline: {},
    });
    expect(r.suggestions).toHaveLength(0);
    expect(r.summary).toMatch(/제안 사항 없음/);
  });
});

describe('reviewPrompt — fallback', () => {
  it('extractor fallback이면 reviewer도 fallback 전파', () => {
    const r = reviewPrompt({
      extractorResult: makeResult({ fallbackReason: 'TEST_REASON', topPosts: [] }),
    });
    expect(r.fallbackReason).toBe('TEST_REASON');
  });

  it('topPosts 빈 배열은 NO_TOP_POSTS', () => {
    const r = reviewPrompt({
      extractorResult: makeResult({ topPosts: [] }),
    });
    expect(r.fallbackReason).toBe('NO_TOP_POSTS');
  });
});

describe('renderReportMarkdown', () => {
  it('제안 있을 때 마크다운 헤더·요약·상세 포함', () => {
    const r = reviewPrompt({
      extractorResult: makeResult(),
      currentBaseline: { targetCharCount: 1500 },
    });
    const md = renderReportMarkdown(r, '2026-05-10');
    expect(md).toContain('# 프롬프트 개선 제안');
    expect(md).toContain('2026-05-10');
    expect(md).toContain('## 요약');
    expect(md).toContain('### [HIGH]');
  });

  it('fallback이면 경고 박스 + 끝', () => {
    const r = reviewPrompt({
      extractorResult: makeResult({ fallbackReason: 'TEST', topPosts: [] }),
    });
    const md = renderReportMarkdown(r);
    expect(md).toContain('⚠️ TEST');
  });

  it('제안 0건이면 명시', () => {
    const r = reviewPrompt({
      extractorResult: makeResult({
        aggregatedPatterns: {
          avgCharCount: 0, avgHeadingCount: 0, avgImageCount: 0,
          topStructureSignatures: [], topKeywords: [], perCategory: {},
        },
      }),
      currentBaseline: {},
    });
    expect(renderReportMarkdown(r)).toContain('현재 제안 사항 없습니다');
  });
});
