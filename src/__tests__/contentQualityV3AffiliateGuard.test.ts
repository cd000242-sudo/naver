import { describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator.js';
import { evaluateContentQualityV3AffiliateGuard } from '../contentQualityV3/affiliateGuard.js';

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: 'Product buying guide',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: '',
    bodyPlain: 'Detailed product information. '.repeat(140),
    headings: [
      { title: 'Key features', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Who it suits', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Checks before buying', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
    ],
    hashtags: [],
    images: [],
    metadata: {
      category: 'shopping',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '3m',
      wordCount: 500,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: 'natural',
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      originalityScore: 90,
      readabilityScore: 90,
      warnings: [],
    },
    conclusion: '\uC81C\uD734\uCEE4\uB125\uD2B8 \uC218\uC218\uB8CC\uAC00 \uBC1C\uC0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
    ...overrides,
  };
}

describe('Content Quality V3 affiliate guard', () => {
  it('requests one authenticity rewrite before blocking a hard failure', () => {
    const content = makeContent({
      selectedTitle: '\uC81C\uD488 \uC0AC\uC6A9 \uD6C4\uAE30',
    });
    const source = { productSpec: 'weight 680g' };

    const retry = evaluateContentQualityV3AffiliateGuard({
      content,
      source,
      minimumBodyChars: 1500,
      authenticityRetryAvailable: true,
      shoppingQualityRetryAvailable: true,
    });
    expect(retry.action).toBe('retry-authenticity');

    const blocked = evaluateContentQualityV3AffiliateGuard({
      content,
      source,
      minimumBodyChars: 1500,
      authenticityRetryAvailable: false,
      shoppingQualityRetryAvailable: true,
    });
    expect(blocked.action).toBe('fail');
    if (blocked.action !== 'fail') throw new Error('expected affiliate safety failure');
    expect(blocked.message).toContain('[CONTENT_SAFETY_BLOCKED]');
  });

  it('requests a shopping-quality rewrite for a safe but structurally thin draft', () => {
    const result = evaluateContentQualityV3AffiliateGuard({
      content: makeContent({ bodyPlain: 'thin', headings: [], conclusion: '' }),
      source: { productSpec: 'weight 680g' },
      minimumBodyChars: 1500,
      authenticityRetryAvailable: false,
      shoppingQualityRetryAvailable: true,
    });

    expect(result.action).toBe('retry-shopping-quality');
  });

  it('accepts safe content without mutating it and records both guard reports', () => {
    const content = Object.freeze(makeContent());
    const before = structuredClone(content);

    const result = evaluateContentQualityV3AffiliateGuard({
      content,
      source: { productSpec: 'weight 680g' },
      minimumBodyChars: 1500,
      authenticityRetryAvailable: false,
      shoppingQualityRetryAvailable: false,
    });

    expect(result.action).toBe('accept');
    if (result.action !== 'accept') throw new Error('expected accepted affiliate content');
    expect(result.content).not.toBe(content);
    expect((result.content.quality as any).affiliateAuthenticity.score).toBeGreaterThanOrEqual(85);
    expect((result.content.quality as any).shoppingValidation.qualityFloorReached).toBe(true);
    expect(content).toEqual(before);
  });

  it('preserves user-visible warnings for accepted shopping content below 100 points', () => {
    const headings = Array.from({ length: 9 }, (_, index) => ({
      title: `Section ${index + 1}`,
      content: 'Details',
      summary: '',
      keywords: [],
      imagePrompt: '',
    }));

    const result = evaluateContentQualityV3AffiliateGuard({
      content: makeContent({ headings }),
      source: { productSpec: 'weight 680g' },
      minimumBodyChars: 1500,
      authenticityRetryAvailable: false,
      shoppingQualityRetryAvailable: false,
    });

    expect(result.action).toBe('accept');
    if (result.action !== 'accept') throw new Error('expected accepted affiliate content');
    expect((result.content.quality as any).shoppingValidation.score).toBe(90);
    expect(result.content.quality.warnings).toContain('[쇼핑커넥트 검증] 품질 90/100');
  });
});
