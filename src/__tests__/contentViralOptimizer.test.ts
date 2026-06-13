import { describe, expect, it } from 'vitest';
import { optimizeForViral } from '../contentViralOptimizer.js';
import type { ContentSource, StructuredContent } from '../contentGenerator.js';

function makeSource(overrides: Partial<ContentSource> = {}): ContentSource {
  return {
    title: '제습기와 서큘레이터 사용법',
    rawText: '빨래 냄새를 줄이는 핵심은 습도 제거와 공기 순환을 같이 보는 것입니다.',
    keywords: ['제습기'],
    articleType: 'shopping_review',
    targetTraffic: 'steady',
    images: [{ url: 'https://example.com/image.jpg' }],
    ...overrides,
  } as ContentSource;
}

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  return {
    selectedTitle: '제습기와 서큘레이터 같이 쓰는 법',
    bodyPlain: '첫 번째 문단입니다.\n\n두 번째 문단에는 핵심 팁이 있습니다.\n\n세 번째 문단입니다.',
    bodyHtml: '<p>첫 번째 문단입니다.</p>',
    headings: [],
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 70,
      originalityScore: 70,
      readabilityScore: 70,
      warnings: [],
    },
    metadata: {
      wordCount: 30,
      estimatedReadingTime: 1,
      tone: 'friendly',
    },
    ...overrides,
  } as StructuredContent;
}

describe('contentViralOptimizer', () => {
  it('keeps optimizeForViral output contract after god-file extraction', () => {
    const source = makeSource();
    const content = makeContent();

    const optimized = optimizeForViral(content, source);

    expect(optimized).not.toBe(content);
    expect(optimized.collectedImages).toEqual(source.images);
    expect(optimized.trafficStrategy?.publishRecommendTime).toBeTruthy();
    expect(optimized.metadata.originalTitle).toBe(source.title);
    expect(optimized.metadata.tone).toBe('relatable');
    expect(optimized.viralHooks?.shareTrigger.quote).toContain('핵심');
    expect(optimized.cta).toBeUndefined();
  });
});
