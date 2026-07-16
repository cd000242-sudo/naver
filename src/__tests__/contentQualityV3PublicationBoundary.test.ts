import { describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator.js';
import {
  ContentQualityV3PublicationError,
  beginContentQualityV3Publication,
  enforceContentQualityV3PublicationBoundary,
  finalizeContentQualityV3PublicationCandidate,
  materializeContentQualityV3PublicationEnvelope,
  registerContentQualityV3GeneratedContent,
  type ContentQualityV3PublicationTicket,
} from '../contentQualityV3/publicationBoundary.js';

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  const bodyPlain = 'Detailed source-backed product information. '.repeat(140);
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: 'Product buying guide',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: 'stale model html',
    bodyPlain,
    content: bodyPlain,
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
      wordCount: bodyPlain.length,
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

function attest(
  content: StructuredContent,
  source: Record<string, unknown> = { contentMode: 'seo' },
  minimumBodyChars = 1500,
): ContentQualityV3PublicationTicket {
  registerContentQualityV3GeneratedContent(content, { source, minimumBodyChars });
  const ticket = beginContentQualityV3Publication(content);
  if (!ticket) throw new Error('expected trusted V3 publication ticket');
  return ticket;
}

describe('Content Quality V3 publication boundary', () => {
  it.each(['seo', 'homefeed', 'affiliate', 'business', 'mate'] as const)(
    'blocks first-party polarity reversal before %s registration',
    contentMode => {
      const content = makeContent({ bodyPlain: '제가 직접 방문했는데 친절했습니다.' });

      expect(() => registerContentQualityV3GeneratedContent(content, {
        source: {
          contentMode,
          rawText: '방문 기록',
          personalExperience: '제가 직접 방문했지만 친절하지 않았습니다.',
        },
        minimumBodyChars: 1500,
      })).toThrow('[content-quality-v3-publication] factual_fake_first_person');
      expect(beginContentQualityV3Publication(content)).toBeUndefined();
    },
  );

  it.each([
    '제가 직접 방문했지만 친절하진 않았습니다.',
    '제가 직접 방문했지만 친절 하진 않았습니다.',
    '제가 직접 방문했지만 친절하지도 않았습니다.',
    '제가 직접 방문했지만 친절하지 는 않았습니다.',
    '제가 직접 방문했지만 친절 하지도 않았습니다.',
    '제가 직접 방문했지만 친절 하지는 않았습니다.',
  ])('blocks contracted negative evidence reversal before registration: %s', personalExperience => {
    const content = makeContent({ bodyPlain: '제가 직접 방문했는데 친절했습니다.' });

    expect(() => registerContentQualityV3GeneratedContent(content, {
      source: {
        contentMode: 'seo',
        rawText: '방문 기록',
        personalExperience,
      },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_fake_first_person');
    expect(beginContentQualityV3Publication(content)).toBeUndefined();
  });

  it('blocks first-party polarity reversal introduced after registration', () => {
    const content = makeContent({
      bodyPlain: '제가 직접 방문했지만 친절하지 않았습니다.',
      content: '제가 직접 방문했지만 친절하지 않았습니다.',
    });
    const ticket = attest(content, {
      contentMode: 'seo',
      rawText: '방문 기록',
      personalExperience: '제가 직접 방문했지만 친절하지 않았습니다.',
    });
    const reversed = {
      ...content,
      bodyPlain: '제가 직접 방문했는데 친절했습니다.',
      content: '제가 직접 방문했는데 친절했습니다.',
    };

    expect(() => enforceContentQualityV3PublicationBoundary(reversed, ticket))
      .toThrow('[content-quality-v3-publication] factual_fake_first_person');
  });

  it('blocks a contracted negative polarity reversal introduced after registration', () => {
    const personalExperience = '제가 직접 방문했지만 친절하진 않았습니다.';
    const content = makeContent({
      bodyPlain: personalExperience,
      content: personalExperience,
    });
    const ticket = attest(content, {
      contentMode: 'seo',
      rawText: '방문 기록',
      personalExperience,
    });
    const reversed = {
      ...content,
      bodyPlain: '제가 직접 방문했는데 친절했습니다.',
      content: '제가 직접 방문했는데 친절했습니다.',
    };

    expect(() => enforceContentQualityV3PublicationBoundary(reversed, ticket))
      .toThrow('[content-quality-v3-publication] factual_fake_first_person');
  });

  it('blocks a particle-spaced negative polarity reversal introduced after registration', () => {
    const personalExperience = '제가 직접 방문했지만 친절 하지도 않았습니다.';
    const content = makeContent({
      bodyPlain: personalExperience,
      content: personalExperience,
    });
    const ticket = attest(content, {
      contentMode: 'seo',
      rawText: '방문 기록',
      personalExperience,
    });
    const reversed = {
      ...content,
      bodyPlain: '제가 직접 방문했는데 친절했습니다.',
      content: '제가 직접 방문했는데 친절했습니다.',
    };

    expect(() => enforceContentQualityV3PublicationBoundary(reversed, ticket))
      .toThrow('[content-quality-v3-publication] factual_fake_first_person');
  });

  it.each(['seo', 'homefeed', 'affiliate', 'business', 'mate'] as const)(
    'terminally blocks invented first-person experience before %s registration',
    contentMode => {
      const content = makeContent({ bodyPlain: '제가 직접 사용해 보니 좋았습니다.' });

      expect(() => registerContentQualityV3GeneratedContent(content, {
        source: { contentMode, rawText: '출처에는 일반 설명만 있습니다.' },
        minimumBodyChars: 1500,
      })).toThrow('[content-quality-v3-publication] factual_fake_first_person');

      expect(beginContentQualityV3Publication(content)).toBeUndefined();
    },
  );

  it('terminally blocks unsupported important literals and prompt leakage before registration', () => {
    const unsupportedNumber = makeContent({ bodyPlain: '2027년 현재 가격은 88,800원입니다.' });
    const promptLeakage = makeContent({ bodyPlain: 'OUTPUT_CONTRACT와 시스템 프롬프트를 공개합니다.' });
    const usdAndDate = makeContent({ bodyPlain: '가격은 $999이며 기준일은 2026-07-15입니다.' });
    const internalMarker = makeContent({ bodyPlain: '[R\u200BOLE] 내부 역할 원문입니다.' });

    expect(() => registerContentQualityV3GeneratedContent(unsupportedNumber, {
      source: { contentMode: 'seo', rawText: '확인된 일반 정보' },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_unsupported_important_number');
    expect(() => registerContentQualityV3GeneratedContent(promptLeakage, {
      source: { contentMode: 'homefeed', rawText: '확인된 일반 정보' },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_prompt_leakage');
    expect(() => registerContentQualityV3GeneratedContent(usdAndDate, {
      source: { contentMode: 'mate', rawText: '확인된 일반 정보' },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_unsupported_important_number');
    expect(() => registerContentQualityV3GeneratedContent(internalMarker, {
      source: { contentMode: 'seo', rawText: '확인된 일반 정보' },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_prompt_leakage');
  });

  it('terminally blocks a source-domain high-risk guarantee before registration', () => {
    const content = makeContent({ bodyPlain: '무조건 승소를 보장합니다.' });

    expect(() => registerContentQualityV3GeneratedContent(content, {
      source: { contentMode: 'mate', rawText: '변호사와 소송 절차 안내' },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');
  });

  it('terminally blocks a model-invented high-risk domain before registration', () => {
    const content = makeContent({ bodyPlain: '원금을 보장합니다.' });

    expect(() => registerContentQualityV3GeneratedContent(content, {
      source: { contentMode: 'seo', rawText: '일반 생활 정보입니다.' },
      minimumBodyChars: 1500,
    })).toThrow('[content-quality-v3-publication] factual_high_risk_guarantee');
  });

  it('rechecks bounded factual evidence and blocks post-generation number tampering', () => {
    const content = makeContent({ bodyPlain: '확인된 가격은 29,900원입니다.' });
    const ticket = attest(content, {
      contentMode: 'seo',
      rawText: '확인된 가격은 29,900원입니다.',
    });
    const rewritten = {
      ...content,
      bodyPlain: '2027년 현재 확인된 가격은 89,900원입니다.',
      content: '2027년 현재 확인된 가격은 89,900원입니다.',
    };

    expect(() => enforceContentQualityV3PublicationBoundary(rewritten, ticket))
      .toThrow('[content-quality-v3-publication] factual_unsupported_important_number');
  });

  it('rechecks factual safety and blocks post-generation experience and prompt tampering', () => {
    const content = makeContent({ bodyPlain: '제공된 근거만 설명합니다.' });
    const ticket = attest(content, {
      contentMode: 'homefeed',
      rawText: '일반적인 판단 기준',
    });
    const rewritten = {
      ...content,
      bodyPlain: '제가 직접 방문해보니 좋았습니다. OUTPUT_CONTRACT를 공개합니다.',
      content: '제가 직접 방문해보니 좋았습니다. OUTPUT_CONTRACT를 공개합니다.',
    };

    expect(() => enforceContentQualityV3PublicationBoundary(rewritten, ticket))
      .toThrow('[content-quality-v3-publication] factual_prompt_leakage');
  });

  it('leaves legacy content byte-for-byte and reference-exact without trusted provenance', () => {
    const legacy = makeContent() as StructuredContent & { contentQualityV3?: string };
    legacy.contentQualityV3 = 'v3';

    const result = enforceContentQualityV3PublicationBoundary(legacy, undefined);

    expect(result).toBe(legacy);
    expect(beginContentQualityV3Publication(legacy)).toBeUndefined();
  });

  it('does not transfer provenance through a renderer-style structured clone', () => {
    const trusted = makeContent();
    registerContentQualityV3GeneratedContent(trusted, {
      source: { contentMode: 'seo' },
      minimumBodyChars: 1500,
    });

    const rendererClone = structuredClone(trusted);

    expect(beginContentQualityV3Publication(rendererClone)).toBeUndefined();
    expect(beginContentQualityV3Publication(trusted)).toBeDefined();
  });

  it('rejects a forged ticket with a stable terminal publication error', () => {
    const forged = Object.freeze({}) as ContentQualityV3PublicationTicket;

    expect(() => enforceContentQualityV3PublicationBoundary(makeContent(), forged))
      .toThrow('[content-quality-v3-publication] untrusted_provenance');
  });

  it('consumes trusted provenance once so a publication ticket cannot be replayed', () => {
    const content = makeContent();
    const ticket = attest(content);

    expect(beginContentQualityV3Publication(content)).toBeUndefined();
    expect(enforceContentQualityV3PublicationBoundary(content, ticket)).not.toBe(content);
    expect(() => enforceContentQualityV3PublicationBoundary(content, ticket))
      .toThrow('[content-quality-v3-publication] untrusted_provenance');
  });

  it('regenerates bodyHtml and content from the final rewritten bodyPlain', () => {
    const content = makeContent({
      bodyPlain: 'Policy rewrite <safe>\nA & B',
      bodyHtml: '<script>stale</script>',
      content: 'stale content',
    });
    const ticket = attest(content);

    const result = enforceContentQualityV3PublicationBoundary(content, ticket);

    expect(result.bodyPlain).toBe('Policy rewrite <safe>\nA & B');
    expect(result.content).toBe(result.bodyPlain);
    expect(result.bodyHtml).toBe('Policy rewrite &lt;safe&gt;<br>A &amp; B');
    expect(content.bodyHtml).toBe('<script>stale</script>');
  });

  it('carries a related-link conclusion mutation into bodyPlain and regenerated bodyHtml', () => {
    const originalConclusion = 'Original conclusion';
    const relatedLink = 'Related article\nhttps://example.com/post';
    const content = makeContent({
      bodyPlain: `Base body.\n\n${originalConclusion}`,
      conclusion: `${originalConclusion}\n\n${relatedLink}`,
    });
    const ticket = attest(content);

    const result = enforceContentQualityV3PublicationBoundary(content, ticket);

    expect(result.bodyPlain).toBe(`Base body.\n\n${originalConclusion}\n\n${relatedLink}`);
    expect(result.bodyHtml).toContain('Related article<br>https://example.com/post');
  });

  it('fails closed when a post-generation policy rewrite breaks the exact title contract', () => {
    const content = makeContent({ selectedTitle: 'Exact user title' });
    const ticket = attest(content, {
      contentMode: 'seo',
      manualTitleOverride: 'Exact user title',
    });
    const rewritten = { ...content, selectedTitle: 'Policy rewritten title' };

    expect(() => enforceContentQualityV3PublicationBoundary(rewritten, ticket))
      .toThrow('[content-quality-v3-publication] manual_title_mismatch');
  });

  it('repairs a final affiliate authenticity hard failure before publication', () => {
    const content = makeContent({ selectedTitle: '\uC81C\uD488 \uC0AC\uC6A9 \uD6C4\uAE30' });
    const ticket = attest(content, {
      contentMode: 'affiliate',
      productSpec: 'weight 680g',
    });

    const result = enforceContentQualityV3PublicationBoundary(content, ticket) as StructuredContent;

    expect(result.selectedTitle).toBe('\uC81C\uD488 \uAD6C\uB9E4 \uC804 \uD655\uC778 \uAC00\uC774\uB4DC');
    expect(result.quality.warnings).toContain(
      '[\uC1FC\uD551\uCEE4\uB125\uD2B8 \uC790\uB3D9 \uAD50\uC815] \uC815\uCC45 \uC704\uD5D8 \uD45C\uD604\uC744 \uC81C\uAC70\uD558\uACE0 \uBC1C\uD589\uC744 \uACC4\uC18D\uD569\uB2C8\uB2E4.',
    );
  });

  it('removes a post-generation shopping pressure sentence instead of failing the post', () => {
    const unsafeSentence = '\uC624\uB298\uB9CC \uAD6C\uB9E4\uD560 \uC218 \uC788\uC73C\uB2C8 \uB193\uCE58\uBA74 \uD6C4\uD68C\uD569\uB2C8\uB2E4.';
    const content = makeContent({
      bodyPlain: `${'Detailed product information. '.repeat(140)} ${unsafeSentence}`,
      content: `${'Detailed product information. '.repeat(140)} ${unsafeSentence}`,
      conclusion: unsafeSentence,
    });
    const ticket = attest(content, {
      contentMode: 'affiliate',
      productSpec: 'weight 680g',
    });

    const result = enforceContentQualityV3PublicationBoundary(content, ticket) as StructuredContent;

    expect(result.bodyPlain).not.toContain(unsafeSentence);
    expect(result.bodyHtml).not.toContain(unsafeSentence);
    expect(result.content).not.toContain(unsafeSentence);
    expect(result.conclusion).not.toContain(unsafeSentence);
  });

  it('keeps final affiliate quality below the publication floor as a warning', () => {
    const content = makeContent({ bodyPlain: 'thin', content: 'thin', headings: [], conclusion: '' });
    const ticket = attest(content, {
      contentMode: 'affiliate',
      productSpec: 'weight 680g',
    });

    const result = enforceContentQualityV3PublicationBoundary(content, ticket) as StructuredContent;

    expect((result.quality as any).shoppingValidation.qualityFloorReached).toBe(false);
    expect(result.quality.warnings.some(message => message.includes('품질'))).toBe(true);
  });

  it('terminally blocks a business draft made unsafe by post-generation mutation', () => {
    const content = makeContent({
      headings: Array.from({ length: 5 }, (_, index) => ({
        title: `Section ${index + 1}`,
        content: 'Details',
        summary: '',
        keywords: [],
        imagePrompt: '',
      })),
    });
    const ticket = attest(content, {
      contentMode: 'business',
      rawText: 'Trusted business details',
    });
    const rewritten = { ...content, headings: content.headings.slice(0, 1) };

    expect(() => enforceContentQualityV3PublicationBoundary(rewritten, ticket))
      .toThrow('[content-quality-v3-publication] business_safety_failed');
  });

  it('revalidates safe final business content and preserves validator telemetry', () => {
    const content = makeContent({
      headings: Array.from({ length: 5 }, (_, index) => ({
        title: `Section ${index + 1}`,
        content: 'Details',
        summary: '',
        keywords: [],
        imagePrompt: '',
      })),
    });
    const ticket = attest(content, {
      contentMode: 'business',
      rawText: 'Trusted business details',
    });

    const result = enforceContentQualityV3PublicationBoundary(content, ticket);

    expect(result.quality.warnings.some(warning => warning.startsWith('BusinessValidator:')))
      .toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.quality.warnings)).toBe(true);
  });

  it('uses bounded trusted business evidence instead of post-generation forged evidence', () => {
    const headings = Array.from({ length: 5 }, (_, index) => ({
      title: `Trusted Co section ${index + 1}`,
      content: 'Trusted Co details',
      summary: '',
      keywords: [],
      imagePrompt: '',
    }));
    const content = makeContent({
      selectedTitle: 'Trusted Co service guide',
      bodyPlain: 'Trusted Co contact 02-345-6789',
      content: 'Trusted Co contact 02-345-6789',
      headings,
    });
    const source = {
      contentMode: 'business',
      rawText: 'Trusted Co contact 02-345-6789',
      businessInfo: { name: 'Trusted Co', phone: '02-345-6789' },
    };
    const ticket = attest(content, source);
    source.businessInfo.phone = '010-9999-0000';
    const forged = {
      ...content,
      bodyPlain: 'Trusted Co contact 010-9999-0000',
      content: 'Trusted Co contact 010-9999-0000',
      businessInfo: { name: 'Trusted Co', phone: '010-9999-0000' },
    };

    expect(() => enforceContentQualityV3PublicationBoundary(forged, ticket))
      .toThrow('[content-quality-v3-publication] business_safety_failed');
  });

  it('revalidates safe affiliate content and records final guard telemetry', () => {
    const content = makeContent();
    const ticket = attest(content, {
      contentMode: 'affiliate',
      productSpec: 'weight 680g',
    });

    const result = enforceContentQualityV3PublicationBoundary(content, ticket);

    expect((result.quality as any).affiliateAuthenticity.score).toBeGreaterThanOrEqual(85);
    expect((result.quality as any).shoppingValidation.qualityFloorReached).toBe(true);
  });

  it('keeps runtime context, collected images, and telemetry outside schema validation', () => {
    const content = Object.assign(makeContent(), {
      contentPolicyContext: { input: { primary_keyword: 'keyword' } },
      collectedImages: [{ url: 'https://example.com/image.jpg', source: 'crawled' }],
      contentPolicy: { decision: 'PASS' },
      factCheckReport: { passed: true },
    });
    const ticket = attest(content);

    const result = enforceContentQualityV3PublicationBoundary(content, ticket) as StructuredContent & {
      contentPolicyContext?: unknown;
      collectedImages?: unknown[];
      contentPolicy?: unknown;
      factCheckReport?: unknown;
    };

    expect(result.contentPolicyContext).toEqual(content.contentPolicyContext);
    expect(result.collectedImages).toEqual(content.collectedImages);
    expect(result.contentPolicy).toEqual(content.contentPolicy);
    expect(result.factCheckReport).toEqual(content.factCheckReport);
    expect(result.collectedImages).not.toBe(content.collectedImages);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.quality)).toBe(true);
    expect(Object.isFrozen(result.contentPolicyContext)).toBe(true);
    expect(Object.isFrozen(result.collectedImages)).toBe(true);
    expect(Object.isFrozen(result.collectedImages?.[0])).toBe(true);
  });

  it('exposes the same body/title/schema candidate contract to deterministic evaluation', () => {
    const result = finalizeContentQualityV3PublicationCandidate(
      makeContent({ bodyPlain: 'Candidate <body>', bodyHtml: 'stale' }),
      { titleContract: undefined },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected a publishable evaluation candidate');
    expect(result.envelope.content.bodyHtml).toBe('Candidate &lt;body&gt;');
    expect(result.envelope.content.content).toBe('Candidate <body>');
    const materialized = materializeContentQualityV3PublicationEnvelope(result.envelope);
    expect(materialized).toEqual(result.envelope.content);
    expect(Object.isFrozen(materialized)).toBe(true);
    expect(Object.isFrozen(materialized.metadata)).toBe(true);
  });

  it('uses a typed terminal error carrying a stable issue code', () => {
    const error = new ContentQualityV3PublicationError('invalid_candidate');

    expect(error.issueCode).toBe('invalid_candidate');
    expect(error.message).toBe('[content-quality-v3-publication] invalid_candidate');
    expect(Object.isFrozen(error)).toBe(true);
  });
});
