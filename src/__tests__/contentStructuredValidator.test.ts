import { describe, expect, it } from 'vitest';
import { validateStructuredContent } from '../contentStructuredValidator';
import type { ContentSource, StructuredContent } from '../contentGenerator';

const baseSource = (overrides: Partial<ContentSource> = {}): ContentSource => ({
  sourceType: 'custom_text',
  rawText: '테스트 원문입니다. 실제 본문 복구와 제목 검증을 위한 충분한 원문입니다.',
  title: '테스트 키워드',
  metadata: { keywords: ['테스트', '복구'] },
  ...overrides,
});

const baseContent = (overrides: Partial<StructuredContent> = {}): StructuredContent => ({
  status: 'success',
  generationTime: '0s',
  selectedTitle: '테스트 제목',
  titleAlternatives: ['테스트 제목'],
  titleCandidates: [],
  bodyHtml: '<p>테스트 본문입니다.</p>',
  bodyPlain: '테스트 본문입니다.',
  headings: [
    {
      title: '첫 번째 소제목',
      content: '첫 번째 본문입니다.',
      summary: '첫 번째 본문입니다.',
      keywords: [],
      imagePrompt: '',
    },
  ],
  hashtags: ['#테스트'],
  images: [],
  metadata: {
    category: 'general',
    targetAge: 'all',
    urgency: 'evergreen',
    estimatedReadTime: '1분',
    wordCount: 20,
    aiDetectionRisk: 'low',
    legalRisk: 'safe',
    seoScore: 70,
    keywordStrategy: '기본',
    publishTimeRecommend: '언제든지',
  },
  quality: {
    aiDetectionRisk: 'low',
    legalRisk: 'safe',
    seoScore: 70,
    originalityScore: 70,
    readabilityScore: 70,
    warnings: [],
  },
  ...overrides,
});

describe('contentStructuredValidator', () => {
  it('recovers loose body and heading aliases before rejecting a model response', () => {
    const content = baseContent({
      bodyPlain: '',
      bodyHtml: '',
      headings: [] as any,
      content: '별도 필드에 들어온 실제 본문입니다. 제목만 반복한 값이 아니므로 복구되어야 합니다.',
    });

    validateStructuredContent(content, baseSource());

    expect(content.bodyPlain).toContain('별도 필드에 들어온 실제 본문');
    expect(content.bodyHtml).toContain('별도 필드에 들어온 실제 본문');
    expect(content.headings.length).toBeGreaterThan(0);
  });

  it('turns the V3 empty bodyHtml fixture into well-formed paragraph HTML', () => {
    const content = baseContent({
      bodyHtml: '',
      bodyPlain: '첫 문단입니다.\n줄바꿈은 같은 문단입니다.\n\n둘째 문단입니다.',
    });

    validateStructuredContent(content, baseSource());

    expect(content.bodyHtml).toBe(
      '<p>첫 문단입니다.<br>줄바꿈은 같은 문단입니다.</p>\n<p>둘째 문단입니다.</p>',
    );
    expect(content.bodyHtml).not.toMatch(/<\s+p\s+>/i);
    expect(content.bodyHtml).not.toMatch(/<\s*\/\s*p\s+>/i);
  });

  it('escapes tag-shaped bodyPlain text before promoting it to bodyHtml', () => {
    const content = baseContent({
      bodyHtml: '',
      bodyPlain: '<script>alert("x")</script> & <img onerror="boom">\n문자 그대로의 <태그>',
    });

    validateStructuredContent(content, baseSource());

    expect(content.bodyHtml).toBe(
      '<p>&lt;script&gt;alert("x")&lt;/script&gt; &amp; &lt;img onerror="boom"&gt;<br>문자 그대로의 &lt;태그&gt;</p>',
    );
    expect(content.bodyHtml).not.toContain('<script');
    expect(content.bodyHtml).not.toContain('<img');
  });

  it('escapes headings-only recovery while preserving ordinary legacy text', () => {
    const unsafe = baseContent({
      bodyHtml: '',
      bodyPlain: '',
      headings: [{
        title: '<b>소</b>',
        content: '<i>본</i>',
        summary: '',
        keywords: [],
        imagePrompt: '',
      }],
    });
    const ordinary = baseContent({
      bodyHtml: '',
      bodyPlain: '',
      headings: [{
        title: '일반 제목',
        content: '일반 본문',
        summary: '',
        keywords: [],
        imagePrompt: '',
      }],
    });

    validateStructuredContent(unsafe, baseSource());
    validateStructuredContent(ordinary, baseSource());

    expect(unsafe.bodyHtml).toBe('<h2>&lt;b&gt;소&lt;/b&gt;</h2>\n<p>&lt;i&gt;본&lt;/i&gt;</p>');
    expect(ordinary.bodyHtml).toBe('<h2>일반 제목</h2>\n<p>일반 본문</p>');
  });

  it('replaces leaked prompt titles with the first safe alternative', () => {
    const content = baseContent({
      selectedTitle: '테스트 키워드 SEO 최적화 제목 작성 가이드',
      titleAlternatives: ['테스트 키워드 실제 사용 팁 정리'],
    });

    validateStructuredContent(content, baseSource({ title: '테스트 키워드' }));

    expect(content.selectedTitle).toBe('테스트 키워드 실제 사용 팁 정리');
    expect(content.titleAlternatives[0]).toBe('테스트 키워드 실제 사용 팁 정리');
  });

  it('normalizes hashtags and restores metadata and quality defaults', () => {
    const content = baseContent({
      hashtags: ['복구 태그', '복구 태그', '!!'],
      metadata: undefined as any,
      quality: undefined as any,
    });

    validateStructuredContent(content, baseSource({ metadata: { keywords: ['서브키워드', '모바일 정리'] } }));

    expect(content.hashtags).toContain('#복구태그');
    expect(new Set(content.hashtags).size).toBe(content.hashtags.length);
    expect(content.hashtags.length).toBeGreaterThanOrEqual(5);
    expect(content.metadata.category).toBe('general');
    expect(content.quality.warnings).toEqual([]);
  });

  it('does not trim bodyPlain when removing a duplicate first heading', () => {
    const bodyPlain = [
      'Intro paragraph that must stay.',
      '',
      'Exact Main Title',
      'This duplicate heading line may exist in the raw body.',
      '',
      'Second valid heading',
      'This is the first real section body.',
    ].join('\n');

    const content = baseContent({
      selectedTitle: 'Exact Main Title',
      bodyPlain,
      headings: [
        {
          title: 'Exact Main Title',
          content: 'Duplicate heading body.',
          summary: '',
          keywords: [],
          imagePrompt: '',
        },
        {
          title: 'Second valid heading',
          content: 'This is the first real section body.',
          summary: '',
          keywords: [],
          imagePrompt: '',
        },
      ],
    });

    validateStructuredContent(content, baseSource({ title: 'Exact Main Title' }));

    expect(content.headings[0].title).toBe('Second valid heading');
    expect(content.bodyPlain).toBe(bodyPlain);
    expect(content.bodyPlain).toContain('Intro paragraph that must stay.');
  });
});
