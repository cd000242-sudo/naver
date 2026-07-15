import { describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator';
import { validatePublishableContent } from '../contentPipeline/resultContract';

function makeValidContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  return {
    status: 'success',
    generationTime: '1.2s',
    selectedTitle: '실제 발행 가능한 제목',
    titleAlternatives: ['대안 제목'],
    titleCandidates: [{ text: '후보 제목', score: 91, reasoning: '검색 의도 일치' }],
    bodyHtml: '<p>실제 발행 가능한 본문입니다.</p>',
    bodyPlain: '실제 발행 가능한 본문입니다.',
    headings: [{
      title: '첫 번째 소제목',
      content: '첫 번째 본문',
      summary: '',
      keywords: ['핵심어'],
      imagePrompt: '',
    }],
    hashtags: ['#핵심어'],
    images: [{
      heading: '첫 번째 소제목',
      prompt: '관련 이미지',
      placement: 'after-heading',
      alt: '관련 이미지 설명',
      caption: '',
    }],
    metadata: {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1분',
      wordCount: 20,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 80,
      keywordStrategy: '핵심어 중심',
      publishTimeRecommend: '평일 오전',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 80,
      originalityScore: 85,
      readabilityScore: 90,
      warnings: [],
    },
    ...overrides,
  };
}

function withoutRequiredField(field: keyof StructuredContent): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(makeValidContent()).filter(([key]) => key !== field),
  );
}

describe('validatePublishableContent', () => {
  it('accepts the current StructuredContent shape without cloning or mutating it', () => {
    const content = makeValidContent();
    const before = structuredClone(content);

    const result = validatePublishableContent(content);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a publishable result');
    expect(result.content).toBe(content);
    expect(content).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.keys(result)).toEqual(['ok', 'content']);
  });

  it('accepts warning results and every well-formed optional StructuredContent field', () => {
    const content = makeValidContent({
      status: 'warning',
      content: '호환 본문',
      introduction: '도입부',
      conclusion: '마무리',
      viralHooks: {
        commentTriggers: [{ position: 1, type: 'opinion', text: '의견을 남겨 주세요.' }],
        shareTrigger: { position: 2, quote: '공유 문장', prompt: '공유해 주세요.' },
        bookmarkValue: { reason: '다시 볼 정보', seriesPromise: '다음 편 예고' },
      },
      trafficStrategy: {
        peakTrafficTime: '오후 8시',
        publishRecommendTime: '오후 7시',
        shareableQuote: '공유 문장',
        controversyLevel: 'low',
        retentionHook: '마지막 체크리스트',
      },
      postPublishActions: {
        selfComments: ['추가 정보'],
        shareMessage: '공유 메시지',
        notificationMessage: '알림 메시지',
      },
      cta: { text: '자세히 보기', link: 'https://example.com' },
      collectedImages: ['https://example.com/image.jpg'],
      metadata: {
        ...makeValidContent().metadata,
        originalTitle: '원제',
        tone: 'expert',
        estimatedEngagement: { views: 100, comments: 3, shares: 2 },
      },
      quality: {
        ...makeValidContent().quality,
        viralPotential: 75,
        engagementScore: 80,
      },
    });

    const result = validatePublishableContent(content);

    expect(result).toEqual({ ok: true, content });
  });

  it('preserves the end of a body longer than 20k characters', () => {
    const tail = '::END_OF_LONG_BODY::';
    const bodyPlain = `${'가'.repeat(20_500)}${tail}`;
    const content = makeValidContent({ bodyPlain });

    const result = validatePublishableContent(content);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a publishable result');
    expect(result.content.bodyPlain).toBe(bodyPlain);
    expect(result.content.bodyPlain.endsWith(tail)).toBe(true);
  });

  it.each([undefined, null, true, 1, 'content', [], () => undefined])(
    'rejects non-object input without throwing (%s)',
    input => {
      const result = validatePublishableContent(input);

      expect(result).toEqual({ ok: false, issueCode: 'not_object' });
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it('rejects an explicit error status before inspecting publishable fields', () => {
    const result = validatePublishableContent({
      status: 'error',
      bodyPlain: 'RAW_SECRET_THAT_MUST_NOT_LEAK',
    });

    expect(result).toEqual({ ok: false, issueCode: 'error_status' });
    expect(Object.keys(result)).toEqual(['ok', 'issueCode']);
    expect(JSON.stringify(result)).not.toContain('RAW_SECRET_THAT_MUST_NOT_LEAK');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([undefined, null, 'SUCCESS', 'unknown', 1])(
    'rejects an invalid status (%s)',
    status => {
      expect(validatePublishableContent({ ...makeValidContent(), status })).toEqual({
        ok: false,
        issueCode: 'invalid_status',
      });
    },
  );

  it.each(['', ' ', '\n\t'])('rejects a blank title (%j)', selectedTitle => {
    expect(validatePublishableContent(makeValidContent({ selectedTitle }))).toEqual({
      ok: false,
      issueCode: 'blank_title',
    });
  });

  it.each(['', ' ', '\n\t'])('rejects a blank body (%j)', bodyPlain => {
    expect(validatePublishableContent(makeValidContent({ bodyPlain }))).toEqual({
      ok: false,
      issueCode: 'blank_body',
    });
  });

  it.each([
    'generationTime',
    'selectedTitle',
    'titleAlternatives',
    'titleCandidates',
    'bodyHtml',
    'bodyPlain',
    'headings',
    'hashtags',
    'images',
    'metadata',
    'quality',
  ] as const)('rejects a missing required %s field', field => {
    expect(validatePublishableContent(withoutRequiredField(field))).toEqual({
      ok: false,
      issueCode: 'invalid_structure',
    });
  });

  it.each([
    ['generationTime', () => makeValidContent({ generationTime: 1 as never })],
    ['selectedTitle', () => makeValidContent({ selectedTitle: 1 as never })],
    ['titleAlternatives', () => makeValidContent({ titleAlternatives: ['valid', 1] as never })],
    ['titleCandidates', () => makeValidContent({
      titleCandidates: [{ text: '후보', score: Number.NaN, reasoning: '근거' }],
    })],
    ['headings', () => makeValidContent({
      headings: [{ title: '소제목', summary: '', keywords: [1], imagePrompt: '' }] as never,
    })],
    ['hashtags', () => makeValidContent({ hashtags: ['#valid', 1] as never })],
    ['images', () => makeValidContent({
      images: [{ heading: '소제목', prompt: 1, placement: 'after', alt: '', caption: '' }] as never,
    })],
    ['metadata', () => makeValidContent({
      metadata: { ...makeValidContent().metadata, targetAge: 'teens' } as never,
    })],
    ['metadata engagement', () => makeValidContent({
      metadata: {
        ...makeValidContent().metadata,
        estimatedEngagement: { views: 1, comments: Number.NaN, shares: 1 },
      },
    })],
    ['quality', () => makeValidContent({
      quality: { ...makeValidContent().quality, warnings: [1] } as never,
    })],
    ['optional content', () => makeValidContent({ content: 1 as never })],
    ['optional viral hooks', () => makeValidContent({
      viralHooks: {
        commentTriggers: [{ position: 1, type: 'unknown', text: '질문' }],
        shareTrigger: { position: 1, quote: '인용', prompt: '공유' },
        bookmarkValue: { reason: '이유', seriesPromise: '예고' },
      } as never,
    })],
    ['optional traffic strategy', () => makeValidContent({
      trafficStrategy: {
        peakTrafficTime: '저녁',
        publishRecommendTime: '저녁',
        shareableQuote: '인용',
        controversyLevel: 'extreme',
        retentionHook: '훅',
      } as never,
    })],
    ['optional post-publish actions', () => makeValidContent({
      postPublishActions: {
        selfComments: [1],
        shareMessage: '공유',
        notificationMessage: '알림',
      } as never,
    })],
    ['optional cta', () => makeValidContent({ cta: { text: '보기', link: 1 } as never })],
    ['optional collected images', () => makeValidContent({ collectedImages: [1] as never })],
  ] as const)('rejects malformed %s structure', (_label, buildCandidate) => {
    expect(validatePublishableContent(buildCandidate())).toEqual({
      ok: false,
      issueCode: 'invalid_structure',
    });
  });

  it('fails closed when property access throws and exposes no diagnostics', () => {
    const candidate = new Proxy(makeValidContent(), {
      get: (_target, property) => {
        if (property === 'status') throw new Error('RAW_PROXY_SECRET');
        return undefined;
      },
    });

    const result = validatePublishableContent(candidate);

    expect(result).toEqual({ ok: false, issueCode: 'invalid_structure' });
    expect(JSON.stringify(result)).not.toContain('RAW_PROXY_SECRET');
  });
});
