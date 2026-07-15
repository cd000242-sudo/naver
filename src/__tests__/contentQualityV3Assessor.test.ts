import { describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator';
import {
  aggregateContentQualityV3Assessments,
  assessContentQualityV3Output,
  CONTENT_QUALITY_V3_RELEASE_CORPUS,
  type ContentQualityV3EvalCase,
} from '../contentQualityV3/evalCorpus';
import { extractContentQualityV3ImportantLiterals } from '../contentQualityV3/evalImportantLiterals';
import { evaluateContentQualityV3Rollout } from '../contentQualityV3/rolloutGate';

function getCase(scenario: string, stratum = 'seo'): ContentQualityV3EvalCase {
  const match = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(
    item => item.scenario === scenario && item.stratum === stratum,
  );
  if (!match) throw new Error(`missing fixture: ${stratum}:${scenario}`);
  return match;
}

function requiredText(evalCase: ContentQualityV3EvalCase): string {
  return evalCase.expectations.requiredExactLiterals.join(' ');
}

function makeValidOutput(
  evalCase: ContentQualityV3EvalCase,
  bodySuffix = '제공된 근거 범위 안에서 판단 기준을 설명합니다.',
): StructuredContent {
  const bodyPlain = `${requiredText(evalCase)} ${bodySuffix}`.trim();
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: requiredText(evalCase),
    titleAlternatives: ['대안 제목'],
    titleCandidates: [{ text: '후보 제목', score: 80, reasoning: '주제 일치' }],
    bodyHtml: '',
    bodyPlain,
    headings: Array.from({ length: 3 }, (_, index) => ({
      title: `판단 기준 ${index + 1}`,
      content: '',
      summary: '근거 범위를 확인합니다.',
      keywords: ['근거'],
      imagePrompt: '',
    })),
    hashtags: ['#근거'],
    images: [],
    metadata: {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1분',
      wordCount: bodyPlain.length,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 100,
      keywordStrategy: '자연스런 주제어',
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 100,
      originalityScore: 100,
      readabilityScore: 100,
      warnings: [],
    },
  };
}

function makePublishableAffiliateOutput(
  evalCase: ContentQualityV3EvalCase,
  bodySuffix?: string,
): StructuredContent {
  const output = makeValidOutput(evalCase, bodySuffix);
  const bodyPlain = `${output.bodyPlain} ${'Detailed source-backed product information. '.repeat(140)}`;
  return {
    ...output,
    bodyPlain,
    bodyHtml: '',
    content: bodyPlain,
    headings: [
      { title: 'Key features', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Who it suits', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
      { title: 'Checks before buying', content: 'Details', summary: '', keywords: [], imagePrompt: '' },
    ],
    conclusion: '\uC81C\uD734\uCEE4\uB125\uD2B8 \uC218\uC218\uB8CC\uAC00 \uBC1C\uC0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.',
  };
}

describe('Content Quality V3 deterministic assessor', () => {
  it('accepts grounded publishable output without trusting model self-scores', () => {
    const evalCase = getCase('grounded-standard', 'seo');
    const result = assessContentQualityV3Output(evalCase, makeValidOutput(evalCase));

    expect(result.passed).toBe(true);
    expect(result.schemaValid).toBe(true);
    expect(result.publishable).toBe(true);
    expect(result.issueCodes).toEqual([]);
    expect(result.criticalHallucinationCount).toBe(0);
    expect(result.fakeFirstPersonCount).toBe(0);
    expect(result.unsupportedCurrentNumberCount).toBe(0);
    expect(result).not.toHaveProperty('candidateQualityScore');
    expect(result).not.toHaveProperty('qualityScore');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.issueCodes)).toBe(true);
  });

  it('uses the publication affiliate guard instead of accepting a schema-only candidate', () => {
    const evalCase = getCase('price-identity', 'affiliate');
    const output = makePublishableAffiliateOutput(evalCase);
    output.selectedTitle = '\uC81C\uD488 \uC0AC\uC6A9 \uD6C4\uAE30';

    const result = assessContentQualityV3Output(evalCase, output);

    expect(result.passed).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.publishable).toBe(false);
    expect(result.publishableIssueCode).toBe('invalid_structure');
    expect(result.issueCodes).toEqual(['OUTPUT_NOT_PUBLISHABLE']);
  });

  it('uses the evaluation case minimum length and exact title contract at publication parity', () => {
    const affiliateCase = getCase('price-identity', 'affiliate');
    const belowAffiliateFloor = assessContentQualityV3Output(
      affiliateCase,
      makeValidOutput(affiliateCase),
    );
    const baseTitleCase = getCase('grounded-standard', 'seo');
    const exactTitleCase: ContentQualityV3EvalCase = {
      ...baseTitleCase,
      source: {
        ...baseTitleCase.source,
        manualTitleOverride: 'Exact source title',
      },
    };
    const wrongTitle = assessContentQualityV3Output(
      exactTitleCase,
      makeValidOutput(exactTitleCase),
    );

    for (const result of [belowAffiliateFloor, wrongTitle]) {
      expect(result.passed).toBe(false);
      expect(result.schemaValid).toBe(false);
      expect(result.publishable).toBe(false);
      expect(result.issueCodes).toEqual(['OUTPUT_NOT_PUBLISHABLE']);
    }
  });

  it('applies the same final business safety guard used by publication', () => {
    const evalCase = getCase('phone-identity', 'business');
    const result = assessContentQualityV3Output(evalCase, makeValidOutput(evalCase));

    expect(result.passed).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.publishable).toBe(false);
    expect(result.publishableIssueCode).toBe('invalid_structure');
    expect(result.issueCodes).toEqual(['OUTPUT_NOT_PUBLISHABLE']);
  });

  it('fails missing exact identifiers, forbidden claims, and prompt leakage deterministically', () => {
    const evalCase = getCase('unsupported-official-superlative');
    const output = makeValidOutput(evalCase, '공식 1위이며 OUTPUT_CONTRACT와 시스템 프롬프트를 공개합니다.');
    output.selectedTitle = '일반 제목';
    output.bodyPlain = '공식 1위이며 OUTPUT_CONTRACT와 시스템 프롬프트를 공개합니다.';

    const result = assessContentQualityV3Output(evalCase, output);

    expect(result.passed).toBe(false);
    expect(result.issueCodes).toEqual([
      'MISSING_REQUIRED_IDENTIFIER',
      'FORBIDDEN_CLAIM',
      'PROMPT_LEAKAGE',
    ]);
    expect(result.missingRequiredIdentifierCount).toBeGreaterThan(0);
    expect(result.forbiddenClaimCount).toBeGreaterThan(0);
    expect(result.promptLeakageCount).toBeGreaterThan(0);
    expect(result.criticalHallucinationCount).toBe(
      result.missingRequiredIdentifierCount
      + result.forbiddenClaimCount
      + result.promptLeakageCount,
    );
  });

  it('detects prompt leakage in auxiliary human-visible output fields', () => {
    const evalCase = getCase('grounded-standard');
    const output = makeValidOutput(evalCase);
    output.titleAlternatives = ['시스템 프롬프트 원문'];
    output.images = [{
      heading: '이미지',
      prompt: 'OUTPUT_CONTRACT를 화면에 표시',
      placement: 'after-heading',
      alt: '이미지 설명',
      caption: '',
    }];

    const result = assessContentQualityV3Output(evalCase, output);

    expect(result.issueCodes).toContain('PROMPT_LEAKAGE');
    expect(result.promptLeakageCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects fake first-person but permits explicitly grounded first-party evidence', () => {
    const deniedCase = getCase('no-first-party');
    const allowedCase = getCase('grounded-first-party');
    const denied = assessContentQualityV3Output(
      deniedCase,
      makeValidOutput(deniedCase, '제가 직접 3개월 쓰고 우리 아이와 확인했습니다.'),
    );
    const allowed = assessContentQualityV3Output(
      allowedCase,
      makeValidOutput(allowedCase, '제가 직접 하루 사용하며 기록한 범위만 설명합니다.'),
    );

    expect(denied.issueCodes).toContain('FAKE_FIRST_PERSON');
    expect(denied.fakeFirstPersonCount).toBeGreaterThanOrEqual(2);
    expect(allowed.fakeFirstPersonCount).toBe(0);
    expect(allowed.issueCodes).not.toContain('FAKE_FIRST_PERSON');
  });

  it.each([
    '직접 써보니 기대보다 편했습니다.',
    '사용해 보았습니다. 결과가 좋았습니다.',
    '먹어봤는데 만족스러웠습니다.',
    '방문해보니 친절했습니다.',
    '써 본 결과 추천할 만했습니다.',
    '내돈내산 후기입니다.',
    '먹어보니까 제 입맛에는 맞았습니다.',
    '써본 바로는 마감이 괜찮았습니다.',
    '매장에 다녀왔어요.',
    '직접 사용했습니다.',
    '한 달간 써 왔습니다.',
    '실제로 매장에 다녀왔습니다.',
  ])('detects implicit Korean first-party experience without a pronoun: %s', claim => {
    const evalCase = getCase('no-first-party');
    const result = assessContentQualityV3Output(evalCase, makeValidOutput(evalCase, claim));

    expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
  });

  it('does not double-count equivalent bodyPlain and rendered bodyHtml experience prose', () => {
    const evalCase = getCase('no-first-party');
    const output = makeValidOutput(evalCase, '한 달간 써 왔습니다.');
    output.bodyHtml = `<p>${output.bodyPlain}</p>`;

    const result = assessContentQualityV3Output(evalCase, output);

    expect(result.fakeFirstPersonCount).toBe(1);
    expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
  });

  it.each([
    '구매자는 직접 써보니 편했다고 후기에 남겼습니다.',
    '사용자 리뷰에 따르면 방문해보니 친절했다는 의견입니다.',
    '후기 작성자는 먹어봤는데 담백했다고 평가했습니다.',
    '구매자는 직접 사용했습니다.',
  ])('does not treat clearly attributed third-party experience as first-party: %s', claim => {
    const evalCase = getCase('review-attribution');
    const result = assessContentQualityV3Output(evalCase, makeValidOutput(evalCase, claim));

    expect(result.fakeFirstPersonCount).toBe(0);
    expect(result.issueCodes).not.toContain('FAKE_FIRST_PERSON');
  });

  it('does not let a review reference hide a subsequent first-party claim', () => {
    const evalCase = getCase('no-first-party');
    const result = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '구매자 리뷰를 읽고 제가 직접 써보니 만족스러웠습니다.'),
    );

    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
  });

  it('does not let an attributed-review suffix launder an earlier first-party claim', () => {
    const evalCase = getCase('no-first-party');
    const result = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(
        evalCase,
        '직접 써보니 좋았습니다, 구매자가 비슷한 말을 후기에 남겼다고 합니다.',
      ),
    );

    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
  });

  it.each([
    '구매자와 저는 직접 써보니 좋았고 이 후기를 씁니다.',
    '구매자와 저는 직접 써보니 좋았고 이 후기에 남겼습니다.',
  ])('requires grammatical attribution instead of actor and review words anywhere: %s', claim => {
    const evalCase = getCase('no-first-party');
    const result = assessContentQualityV3Output(evalCase, makeValidOutput(evalCase, claim));

    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
  });

  it('scopes grounded first-party prose to the supplied personalExperience evidence', () => {
    const evalCase = getCase('grounded-first-party');
    const supported = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '제가 직접 하루 사용해 보니 한 가지 불편을 확인했습니다.'),
    );
    const unrelatedFamilyAndDuration = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '제가 직접 3개월 사용했고 우리 가족 모두 만족했습니다.'),
    );
    const unrelatedVisit = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '방문해보니 친절했고 효과가 좋았습니다.'),
    );
    const unrelatedNovelOutcome = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '제가 직접 하루 사용해 보니 색상이 빨갰고 가격이 비쌌습니다.'),
    );
    const prefixedUnsupportedDuration = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '한 달간 제가 직접 사용했습니다.'),
    );

    expect(supported.fakeFirstPersonCount).toBe(0);
    expect(supported.issueCodes).not.toContain('FAKE_FIRST_PERSON');
    for (const result of [
      unrelatedFamilyAndDuration,
      unrelatedVisit,
      unrelatedNovelOutcome,
      prefixedUnsupportedDuration,
    ]) {
      expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
      expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
    }
  });

  it('uses the shared polarity binding for source-backed first-party evaluation', () => {
    const baseCase = getCase('grounded-first-party');
    const evalCase: ContentQualityV3EvalCase = {
      ...baseCase,
      source: {
        ...baseCase.source,
        personalExperience: '제가 직접 방문했지만 친절하지 않았습니다.',
      },
      expectations: {
        ...baseCase.expectations,
        personalExperienceEvidence: '제가 직접 방문했지만 친절하지 않았습니다.',
      },
    };
    const reversed = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '제가 직접 방문했는데 친절했습니다.'),
    );

    expect(reversed.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(reversed.issueCodes).toContain('FAKE_FIRST_PERSON');
  });

  it('uses shared contraction normalization for source-backed first-party evaluation', () => {
    const baseCase = getCase('grounded-first-party');
    const personalExperience = '제가 직접 방문했지만 친절 하지도 않았습니다.';
    const evalCase: ContentQualityV3EvalCase = {
      ...baseCase,
      source: {
        ...baseCase.source,
        personalExperience,
      },
      expectations: {
        ...baseCase.expectations,
        personalExperienceEvidence: personalExperience,
      },
    };
    const reversed = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '제가 직접 방문했는데 친절했습니다.'),
    );

    expect(reversed.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(reversed.issueCodes).toContain('FAKE_FIRST_PERSON');
  });

  it('inspects title, headings, and image fields for implicit experience and unsupported numbers', () => {
    const evalCase = getCase('no-first-party');
    const output = makeValidOutput(evalCase);
    output.titleAlternatives = ['내돈내산으로 직접 써보니 좋았습니다'];
    output.headings[0].summary = '방문해보니 친절했습니다.';
    output.images = [{
      heading: '가격 이미지',
      prompt: '가격 KRW 29900과 이용자 2만명을 표시',
      placement: 'after-heading',
      alt: '사용해 보았습니다',
      caption: '010.1234.5678',
    }];

    const result = assessContentQualityV3Output(evalCase, output);

    expect(result.fakeFirstPersonCount).toBeGreaterThanOrEqual(3);
    expect(result.unsupportedCurrentNumberCount).toBeGreaterThanOrEqual(3);
    expect(result.issueCodes).toContain('FAKE_FIRST_PERSON');
    expect(result.issueCodes).toContain('UNSUPPORTED_IMPORTANT_NUMBER');
  });

  it('flags only unsupported unit-bearing important numbers, not ordinary list numbering', () => {
    const evalCase = getCase('unsupported-current-number');
    const unsupported = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '2026년 현재 37.5%, 19,900원, 문의 02-9999-8888, 누적 500건입니다.'),
    );
    const listOnly = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(evalCase, '1. 자료 확인\n2. 조건 비교\n3. 범위 결정\n단위 없는 목록 식별자 1,500'),
    );

    expect(unsupported.unsupportedCurrentNumberCount).toBe(5);
    expect(unsupported.issueCodes).toContain('UNSUPPORTED_IMPORTANT_NUMBER');
    expect(listOnly.unsupportedCurrentNumberCount).toBe(0);
    expect(listOnly.issueCodes).not.toContain('UNSUPPORTED_IMPORTANT_NUMBER');
  });

  it('normalizes common Korean magnitude, currency, and dotted phone formats', () => {
    expect(extractContentQualityV3ImportantLiterals(
      '가격 2만 원, 예산 3억 원, 이용자 2만명, 문의 010.1234.5678, 결제 KRW 29900',
    )).toEqual([
      '2만원',
      '3억원',
      '2만명',
      '010-1234-5678',
      'KRW29900',
    ]);
    expect(extractContentQualityV3ImportantLiterals(
      '1. 자료 확인\n2. 조건 비교\n3. 범위 결정\n단위 없는 식별자 1,500',
    )).toEqual([]);
  });

  it('normalizes USD, ratings, and equivalent Korean/ISO full dates', () => {
    expect(extractContentQualityV3ImportantLiterals(
      '가격 $999, 비교 99달러, 평점 4.9점, 기준일 2026년 7월 15일과 2026-07-15',
    )).toEqual([
      'USD999',
      'USD99',
      '4.9점',
      '2026-07-15',
    ]);
  });

  it('uses the same normalized literal contract for supported source evidence', () => {
    const baseCase = getCase('grounded-standard');
    const supportedImportantLiterals = extractContentQualityV3ImportantLiterals(
      '가격 2만 원, 이용자 2만명, 문의 010.1234.5678, 결제 KRW 29900',
    );
    const evalCase: ContentQualityV3EvalCase = {
      ...baseCase,
      expectations: {
        ...baseCase.expectations,
        supportedImportantLiterals,
      },
    };
    const result = assessContentQualityV3Output(
      evalCase,
      makeValidOutput(
        evalCase,
        '가격 2만원, 이용자 2만 명, 문의 010-1234-5678, 결제 KRW 29,900입니다.',
      ),
    );

    expect(result.unsupportedCurrentNumberCount).toBe(0);
    expect(result.issueCodes).not.toContain('UNSUPPORTED_IMPORTANT_NUMBER');
  });

  it('does not treat app telemetry warnings as publish-visible factual claims', () => {
    const evalCase = getCase('unsupported-current-number');
    const output = makeValidOutput(evalCase);
    output.quality.warnings = [
      '소제목 4개',
      'AI티 표현 2개',
      '본문 길이 1,500자',
    ];

    const result = assessContentQualityV3Output(evalCase, output);

    expect(result.unsupportedCurrentNumberCount).toBe(0);
    expect(result.issueCodes).not.toContain('UNSUPPORTED_IMPORTANT_NUMBER');
  });

  it('allows exact supported price and phone literals from machine expectations', () => {
    const priceCase = getCase('price-identity', 'seo');
    const phoneCase = getCase('phone-identity', 'seo');
    const price = assessContentQualityV3Output(
      priceCase,
      makeValidOutput(priceCase, '확인된 가격은 29,900원입니다.'),
    );
    const phone = assessContentQualityV3Output(
      phoneCase,
      makeValidOutput(phoneCase, '확인된 문의 번호는 02-345-6789입니다.'),
    );

    expect(price.unsupportedCurrentNumberCount).toBe(0);
    expect(phone.unsupportedCurrentNumberCount).toBe(0);
  });

  it.each([
    ['medical-risk', '완치를 보장하고 반드시 낫습니다.'],
    ['legal-risk', '무조건 승소를 보장합니다.'],
    ['financial-risk', '원금과 연 12% 수익을 보장합니다.'],
  ])('blocks %s guarantees', (scenario, unsafeClaim) => {
    const evalCase = getCase(scenario);
    const result = assessContentQualityV3Output(evalCase, makeValidOutput(evalCase, unsafeClaim));

    expect(result.issueCodes).toContain('HIGH_RISK_GUARANTEE');
    expect(result.highRiskGuaranteeCount).toBeGreaterThan(0);
    expect(result.criticalHallucinationCount).toBeGreaterThan(0);
  });

  it('fails closed for malformed and throwing outputs without leaking raw errors', () => {
    const evalCase = getCase('grounded-standard');
    const malformed = assessContentQualityV3Output(evalCase, null);
    const throwing = new Proxy({}, {
      get: () => {
        throw new Error('RAW_OUTPUT_SECRET');
      },
    });
    const proxied = assessContentQualityV3Output(evalCase, throwing);

    for (const result of [malformed, proxied]) {
      expect(result.passed).toBe(false);
      expect(result.schemaValid).toBe(false);
      expect(result.publishable).toBe(false);
      expect(result.issueCodes).toContain('OUTPUT_NOT_PUBLISHABLE');
      expect(JSON.stringify(result)).not.toContain('RAW_OUTPUT_SECRET');
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it('creates a sanitized immutable aggregate directly mappable to rollout safety fields', () => {
    const safeCase = getCase('price-identity', 'seo');
    const failedCase = getCase('unsupported-current-number');
    const safe = assessContentQualityV3Output(safeCase, makeValidOutput(safeCase));
    const failed = assessContentQualityV3Output(
      failedCase,
      makeValidOutput(failedCase, '제가 2026년 현재 수익률 50%를 확인했습니다.'),
    );
    const aggregate = aggregateContentQualityV3Assessments([safe, failed]);

    expect(aggregate).toMatchObject({
      total: 2,
      passed: 1,
      productFail: 1,
      schemaValid: 2,
      publishable: 2,
      fakeFirstPersonCount: failed.fakeFirstPersonCount,
      unsupportedCurrentNumberCount: failed.unsupportedCurrentNumberCount,
    });
    expect(aggregate.machineAssessmentCases).toEqual([
      {
        caseId: safe.caseId,
        stratum: safe.stratum,
        disposition: 'NOT_RUN',
        schemaValid: true,
        publishable: true,
        criticalHallucinationCount: 0,
        fakeFirstPersonCount: 0,
        unsupportedCurrentNumberCount: 0,
      },
      {
        caseId: failed.caseId,
        stratum: failed.stratum,
        disposition: 'PRODUCT_FAIL',
        schemaValid: true,
        publishable: true,
        criticalHallucinationCount: failed.criticalHallucinationCount,
        fakeFirstPersonCount: failed.fakeFirstPersonCount,
        unsupportedCurrentNumberCount: failed.unsupportedCurrentNumberCount,
      },
    ]);
    expect(aggregate.machineAssessmentCases[0]).not.toHaveProperty('candidateQualityScore');
    expect(aggregate).not.toHaveProperty('qualityScore');
    expect(Object.isFrozen(aggregate)).toBe(true);
    expect(Object.isFrozen(aggregate.machineAssessmentCases)).toBe(true);
    expect(Object.isFrozen(aggregate.machineAssessmentCases[0])).toBe(true);
    expect(JSON.stringify(aggregate)).not.toContain('수익률 50%');

    const assessedByCaseId = new Map(
      aggregate.machineAssessmentCases.map(item => [item.caseId, item] as const),
    );
    const externallyRecordedProvenance = {
      candidateOutputSha256: '1'.repeat(64),
      legacyOutputSha256: '2'.repeat(64),
      requestSha256: '3'.repeat(64),
      providerResponseSha256: '4'.repeat(64),
    } as const;
    const completeReleaseCases = CONTENT_QUALITY_V3_RELEASE_CORPUS.map(item => ({
      ...(assessedByCaseId.get(item.caseId) ?? {
        caseId: item.caseId,
        stratum: item.stratum,
        disposition: 'NOT_RUN' as const,
      }),
      ...externallyRecordedProvenance,
    }));
    const gateResult = evaluateContentQualityV3Rollout({
      cases: completeReleaseCases,
      pairwiseJudgments: [],
    });
    expect(gateResult.reasonCodes).not.toContain('INVALID_INPUT');
    expect(gateResult.reasonCodes).toContain('PRODUCT_FAILURE_PRESENT');
  });
});
