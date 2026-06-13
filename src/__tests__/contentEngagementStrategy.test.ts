import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTrafficStrategy,
  calculateEngagementScore,
  extractShareableQuote,
  extractKeywordsFromContent,
  generateCTA,
  generateSelfComments,
  getOptimalPublishTime,
  inferTone,
} from '../contentEngagementStrategy.js';
import type { ContentSource, StructuredContent } from '../contentGenerator.js';

function makeSource(overrides: Partial<ContentSource> = {}): ContentSource {
  return {
    title: '기본 제목',
    rawText: '이 글의 핵심은 실제 사용자가 기억해야 하는 팁을 짧게 정리하는 것입니다.',
    keywords: ['기본'],
    articleType: 'general',
    ...overrides,
  } as ContentSource;
}

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  return {
    selectedTitle: '테스트 제목',
    bodyPlain: '본문',
    bodyHtml: '<p>본문</p>',
    headings: [],
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 80,
      originalityScore: 70,
      readabilityScore: 90,
      warnings: [],
    },
    metadata: {
      wordCount: 10,
      estimatedReadingTime: 1,
      tone: 'friendly',
    },
    ...overrides,
  } as StructuredContent;
}

describe('contentEngagementStrategy', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps automatic CTA disabled so crawler URLs are not appended as article links', () => {
    const source = makeSource({ title: '국민연금 신청 방법', url: 'https://example.com/news/1' });

    expect(generateCTA(source, 'general')).toBeUndefined();
  });

  it('extracts a shareable sentence that contains practical keywords first', () => {
    const quote = extractShareableQuote(
      '평범한 문장입니다. 이 글의 핵심은 장마철 실내 빨래 냄새를 줄이는 팁을 지키는 것입니다. 마지막 문장입니다.',
    );

    expect(quote).toBe('이 글의 핵심은 장마철 실내 빨래 냄새를 줄이는 팁을 지키는 것입니다');
  });

  it('infers tone from article type without changing the public metadata vocabulary', () => {
    expect(inferTone(makeSource({ articleType: 'finance' }))).toBe('expert');
    expect(inferTone(makeSource({ articleType: 'shopping_review' }))).toBe('relatable');
    expect(inferTone(makeSource({ articleType: 'travel' }))).toBe('friendly');
  });

  it('builds traffic strategy from the injected publish-time resolver', () => {
    const strategy = buildTrafficStrategy(
      makeSource({ articleType: 'shopping_review', targetTraffic: 'viral', categoryHint: '생활', targetAge: '30s' }),
      (category, targetAge, targetTraffic) => {
        expect(category).toBe('생활');
        expect(targetAge).toBe('30s');
        expect(targetTraffic).toBe('viral');
        return '2026-06-13 10:00:00';
      },
    );

    expect(strategy.publishRecommendTime).toBe('2026-06-13 10:00:00');
    expect(strategy.peakTrafficTime).toBe('2026-06-13 02:00:00');
    expect(strategy.controversyLevel).toBe('medium');
  });

  it('keeps engagement score and self-comment defaults stable', () => {
    expect(calculateEngagementScore(makeContent())).toBe(73);
    expect(generateSelfComments(makeSource(), makeContent())).toHaveLength(3);
    expect(generateSelfComments(makeSource({ personalExperience: '직접 써봤습니다.' }), makeContent())[0]).toBe('직접 써봤습니다.');
  });

  it('keeps optimal publish time rules stable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T00:00:00+09:00'));

    expect(getOptimalPublishTime('일반', '20s', 'viral')).toContain('13:00:00');
    expect(getOptimalPublishTime('일반', '40s', 'steady')).toContain('05:00:00');
    expect(getOptimalPublishTime('육아', '20s', 'viral')).toContain('01:00:00');
  });

  it('extracts top Korean keywords by frequency and caps the list at ten', () => {
    const keywords = extractKeywordsFromContent(
      '제습기 서큘레이터 제습기 빨래 건조 빨래 냄새 관리 제습기 서큘레이터 환기 전기요금 관리',
    );

    expect(keywords.slice(0, 3)).toEqual(['제습기', '서큘레이터', '빨래']);
    expect(keywords.length).toBeLessThanOrEqual(10);
    expect(extractKeywordsFromContent('')).toEqual([]);
  });
});
