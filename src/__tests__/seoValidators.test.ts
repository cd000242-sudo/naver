import { describe, it, expect } from 'vitest';
import { scanDefinitionFirstSentences } from '../validators/seo/definitionFirstSentenceScanner';
import { scanMainKeywordPosition } from '../validators/seo/mainKeywordPositionScanner';
import { scanFaqHeadings } from '../validators/seo/faqHeadingScanner';
import { validateContent } from '../services/contentValidationPipeline';
import type { CheckableContent } from '../contentQualityChecker';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// definitionFirstSentenceScanner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scanDefinitionFirstSentences', () => {
  it('detects "A는 B이다" pattern', () => {
    const content: CheckableContent = {
      headings: [
        { title: 'H1', body: '청년도약계좌는 정부가 지원하는 5년 만기 적금이에요. 자세한 내용을 살펴봅니다.' },
      ],
    };
    const result = scanDefinitionFirstSentences(content);
    expect(result.definitionHitCount).toBe(1);
    expect(result.hitRatio).toBe(1);
  });

  it('detects "핵심은 ~" pattern', () => {
    const content: CheckableContent = {
      headings: [
        { title: 'H1', body: '절약의 핵심은 꾸준한 습관입니다. 구체적으로 설명할게요.' },
      ],
    };
    expect(scanDefinitionFirstSentences(content).definitionHitCount).toBe(1);
  });

  it('detects "결론부터 말하면 ~" pattern', () => {
    const content: CheckableContent = {
      headings: [
        { title: 'H1', body: '결론부터 말하면 매달 70만원이 답입니다. 상세 계산을 보면.' },
      ],
    };
    expect(scanDefinitionFirstSentences(content).definitionHitCount).toBe(1);
  });

  it('skips non-definition emotional openings', () => {
    const content: CheckableContent = {
      headings: [
        { title: '궁금했던 것', body: '솔직히 저도 처음엔 많이 헷갈렸거든요. 알아볼게요.' },
      ],
    };
    const result = scanDefinitionFirstSentences(content);
    expect(result.definitionHitCount).toBe(0);
    expect(result.missedHeadings).toContain('궁금했던 것');
  });

  it('reports ratio across multiple headings', () => {
    const content: CheckableContent = {
      headings: [
        { title: 'A', body: '청년도약계좌는 정부 적금이에요. 설명합니다.' },
        { title: 'B', body: '진짜 궁금하셨죠? 한번 알아봅시다.' },
        { title: 'C', body: '가입 조건의 핵심은 소득 기준입니다. 자세히.' },
      ],
    };
    const result = scanDefinitionFirstSentences(content);
    expect(result.definitionHitCount).toBe(2);
    expect(result.hitRatio).toBeCloseTo(2 / 3, 2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mainKeywordPositionScanner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scanMainKeywordPosition', () => {
  it('returns emptyInput=true when no keyword provided', () => {
    const result = scanMainKeywordPosition({ title: '제목', introduction: '본문' }, '');
    expect(result.emptyInput).toBe(true);
  });

  it('detects keyword in first 3 chars of title', () => {
    const result = scanMainKeywordPosition(
      { title: '청년도약계좌 가입 조건 완벽 정리', introduction: '청년도약계좌는 정부 지원입니다.' },
      '청년도약계좌',
    );
    expect(result.titleHasKeywordInFirst3Chars).toBe(true);
    expect(result.introMentionsKeyword).toBe(true);
  });

  it('flags keyword not in title first 3 chars', () => {
    const result = scanMainKeywordPosition(
      { title: '2026년에 바뀌는 청년도약계좌 총정리', introduction: '안녕하세요 오늘은' },
      '청년도약계좌',
    );
    expect(result.titleHasKeywordInFirst3Chars).toBe(false);
  });

  it('detects conclusion keyword mention', () => {
    const result = scanMainKeywordPosition(
      {
        title: '청년도약계좌 정리',
        introduction: '청년도약계좌 안내',
        conclusion: '결국 청년도약계좌가 가장 현실적이에요.',
      },
      '청년도약계좌',
    );
    expect(result.conclusionMentionsKeyword).toBe(true);
  });

  it('counts occurrences across the full document', () => {
    const content = {
      title: '청년도약계좌',
      introduction: '청년도약계좌 도입부',
      headings: [{ title: '안내', body: '청년도약계좌 설명. 청년도약계좌 추가.' }],
      conclusion: '청년도약계좌 마무리',
    };
    const result = scanMainKeywordPosition(content, '청년도약계좌');
    expect(result.occurrenceCount).toBeGreaterThanOrEqual(5);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// faqHeadingScanner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('scanFaqHeadings', () => {
  it('recognizes question marks', () => {
    const content: CheckableContent = {
      headings: [
        { title: '가입 조건 무엇인가?', body: 'x' },
        { title: '일반 정보', body: 'y' },
      ],
    };
    const result = scanFaqHeadings(content);
    expect(result.questionHeadingCount).toBe(1);
    expect(result.withinRecommendedRange).toBe(true);
  });

  it('recognizes interrogative words without ?', () => {
    const content: CheckableContent = {
      headings: [
        { title: '어떻게 가입하는 법', body: 'x' },
        { title: 'A와 B 차이', body: 'y' },
      ],
    };
    const result = scanFaqHeadings(content);
    expect(result.questionHeadingCount).toBe(2);
  });

  it('flags count outside recommended 1~2 range when >=3 headings', () => {
    const content: CheckableContent = {
      headings: [
        { title: 'A 정보', body: 'x' },
        { title: 'B 정보', body: 'y' },
        { title: 'C 정보', body: 'z' },
        { title: 'D 정보', body: 'w' },
      ],
    };
    const result = scanFaqHeadings(content);
    expect(result.questionHeadingCount).toBe(0);
    expect(result.withinRecommendedRange).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// contentValidationPipeline — SEO mode integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('validateContent — SEO mode integration', () => {
  const weakContent: CheckableContent = {
    introduction: '그냥 이야기하러 왔어요. 궁금한 점 같이 봐봐요.',
    headings: [
      { title: '첫 번째', body: '진짜 대박이었어요. 믿기 힘들더라고요.' },
      { title: '두 번째', body: '다들 궁금했잖아요. 한번 알아봅시다.' },
      { title: '세 번째', body: '가보죠 한번.' },
    ],
    conclusion: '결론은 알아서 보세요.',
  };

  it('does NOT run SEO scanners when mode is not seo (default)', () => {
    const result = validateContent(weakContent, { skipFingerprint: true });
    expect(result.metrics.seoDefinitionHitRatio).toBeNull();
    expect(result.metrics.seoKeywordDensity).toBeNull();
    expect(result.metrics.seoFaqHeadingCount).toBeNull();
  });

  it('runs SEO scanners and reports metrics when mode=seo', () => {
    const result = validateContent(weakContent, {
      skipFingerprint: true,
      mode: 'seo',
      mainKeyword: '청년도약계좌',
      title: '2026 청년도약계좌 바뀐 점',
    });
    expect(result.metrics.seoDefinitionHitRatio).not.toBeNull();
    expect(result.metrics.seoFaqHeadingCount).not.toBeNull();
    // Weak content has no definitions, no keyword in title first 3 chars → warnings
    expect(
      result.issues.some((i) => i.category === 'seo_definition_first'),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.category === 'seo_keyword_position'),
    ).toBe(true);
  });

  it('passes clean SEO content without SEO warnings', () => {
    const cleanContent: CheckableContent = {
      introduction: '청년도약계좌는 정부 지원 5년 만기 적금이에요. 핵심만 정리합니다.',
      headings: [
        { title: '청년도약계좌 가입 조건', body: '청년도약계좌는 만 19세부터 34세까지 가입 가능한 적금입니다. 구체적인 소득 기준을 설명합니다.' },
        { title: '우대금리 조건은?', body: '우대금리의 핵심은 소득 구간별 차등 적용이에요. 표로 정리했어요.' },
        { title: '만기 수령 시나리오', body: '5년 만기 시 최대 2200만원 수령이 가능합니다. 계산 과정을 설명합니다.' },
      ],
      conclusion: '핵심만 뽑아보면 청년도약계좌는 조건 맞으면 무조건 가입이에요. 여러분은 가입 대상이세요? 주변에 해당하는 분 있으면 알려주세요.',
    };
    const result = validateContent(cleanContent, {
      skipFingerprint: true,
      mode: 'seo',
      mainKeyword: '청년도약계좌',
      title: '청년도약계좌 가입 조건 완벽 정리',
    });
    expect(
      result.issues.some((i) => i.category === 'seo_keyword_position'),
    ).toBe(false);
    expect(result.metrics.seoDefinitionHitRatio).toBeGreaterThan(0.5);
  });
});
