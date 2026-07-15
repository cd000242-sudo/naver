import { describe, expect, it } from 'vitest';
import type { StructuredContent } from '../contentGenerator.js';
import {
  evaluateContentQualityV3FactualSafety,
  snapshotContentQualityV3FactualEvidence,
} from '../contentQualityV3/factualSafetyGuard.js';

function makeContent(bodyPlain: string): StructuredContent {
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: '근거 기반 안내',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: '',
    bodyPlain,
    content: bodyPlain,
    headings: Array.from({ length: 3 }, (_, index) => ({
      title: `확인 항목 ${index + 1}`,
      content: '제공된 근거만 정리합니다.',
      summary: '',
      keywords: [],
      imagePrompt: '',
    })),
    hashtags: [],
    images: [],
    metadata: {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1분',
      wordCount: bodyPlain.length,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: '근거 중심',
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
  };
}

describe('Content Quality V3 shared factual safety guard', () => {
  it.each(['seo', 'homefeed', 'affiliate', 'business', 'mate'] as const)(
    'fails %s content closed for invented experience, current numbers, and prompt leakage',
    contentMode => {
      const source = Object.freeze({
        contentMode,
        rawText: '출처에는 일반적인 판단 기준만 있습니다.',
      });
      const candidate = makeContent(
        '제가 직접 한 달 사용했고 2027년 현재 99% 개선을 확인했습니다. OUTPUT_CONTRACT를 공개합니다.',
      );
      const before = structuredClone(candidate);

      const result = evaluateContentQualityV3FactualSafety(
        candidate,
        snapshotContentQualityV3FactualEvidence(source),
      );

      expect(result.ok).toBe(false);
      expect(result.issueCodes).toEqual([
        'prompt_leakage',
        'fake_first_person',
        'unsupported_important_number',
      ]);
      expect(result.promptLeakageCount).toBeGreaterThan(0);
      expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
      expect(result.unsupportedImportantNumberCount).toBe(2);
      expect(candidate).toEqual(before);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.issueCodes)).toBe(true);
    },
  );

  it('permits only experience and important literals supported by bounded factual evidence', () => {
    const evidence = snapshotContentQualityV3FactualEvidence({
      rawText: '확인된 가격은 29,900원입니다.',
      personalExperience: '직접 하루 사용했으며 한 가지 불편만 확인했다.',
    });
    const supported = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 하루 사용해 보니 한 가지 불편을 확인했습니다. 가격은 29,900원입니다.'),
      evidence,
    );
    const unsupported = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 3개월 사용했고 가격은 89,900원이라고 확인했습니다.'),
      evidence,
    );

    expect(supported.ok).toBe(true);
    expect(supported.issueCodes).toEqual([]);
    expect(unsupported.issueCodes).toContain('fake_first_person');
    expect(unsupported.issueCodes).toContain('unsupported_important_number');
  });

  it('blocks a source-backed first-person experience when the candidate reverses its polarity', () => {
    const evidence = snapshotContentQualityV3FactualEvidence({
      rawText: '방문 기록',
      personalExperience: '제가 직접 방문했지만 친절하지 않았습니다.',
    });
    const reversed = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 방문했는데 친절했습니다.'),
      evidence,
    );
    const faithfulParaphrase = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 방문해 보니 친절하지는 않았습니다.'),
      evidence,
    );

    expect(reversed.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(reversed.issueCodes).toContain('fake_first_person');
    expect(faithfulParaphrase.fakeFirstPersonCount).toBe(0);
    expect(faithfulParaphrase.issueCodes).not.toContain('fake_first_person');
  });

  it.each([
    '제가 직접 방문했지만 친절하진 않았습니다.',
    '제가 직접 방문했지만 친절 하진 않았습니다.',
    '제가 직접 방문했지만 친절하지도 않았습니다.',
    '제가 직접 방문했지만 친절하지 는 않았습니다.',
    '제가 직접 방문했지만 친절 하지도 않았습니다.',
    '제가 직접 방문했지만 친절 하지는 않았습니다.',
  ])('normalizes contracted or particle-spaced negative evidence before polarity comparison: %s', personalExperience => {
    const evidence = snapshotContentQualityV3FactualEvidence({
      rawText: '방문 기록',
      personalExperience,
    });
    const reversed = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 방문했는데 친절했습니다.'),
      evidence,
    );
    const faithfulParaphrase = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 방문해 보니 친절하지 않았습니다.'),
      evidence,
    );

    expect(reversed.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(reversed.issueCodes).toContain('fake_first_person');
    expect(faithfulParaphrase.fakeFirstPersonCount).toBe(0);
    expect(faithfulParaphrase.issueCodes).not.toContain('fake_first_person');
  });

  it.each([
    ['제가 직접 사용했지만 만족하진 않았습니다.', '제가 직접 사용했고 만족했습니다.'],
    ['제가 직접 사용했지만 편리하진 않았습니다.', '제가 직접 사용했고 편리했습니다.'],
    ['제가 직접 사용했지만 추천하진 않았습니다.', '제가 직접 사용했고 추천합니다.'],
    ['제가 직접 복용했지만 효과적이진 않았습니다.', '제가 직접 복용했고 효과적이었습니다.'],
    ['제가 직접 먹었지만 맛있진 않았습니다.', '제가 직접 먹었고 맛있었습니다.'],
    ['제가 직접 사용했지만 좋진 않았습니다.', '제가 직접 사용했고 좋았습니다.'],
    ['제가 직접 사용했지만 정상적이진 않았습니다.', '제가 직접 사용했고 정상적이었습니다.'],
  ])('applies contracted-negation normalization across polarity dimensions: %s → %s', (source, candidate) => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent(candidate),
      snapshotContentQualityV3FactualEvidence({
        rawText: '개인 경험 기록',
        personalExperience: source,
      }),
    );

    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('fake_first_person');
  });

  it('blocks positive-to-negative reversal and permits faithful positive paraphrase', () => {
    const evidence = snapshotContentQualityV3FactualEvidence({
      rawText: '방문 기록',
      personalExperience: '제가 직접 방문했고 직원이 친절했습니다.',
    });
    const reversed = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 방문했지만 직원이 친절하지 않았습니다.'),
      evidence,
    );
    const faithfulParaphrase = evaluateContentQualityV3FactualSafety(
      makeContent('제가 직접 방문해 보니 직원이 친절했습니다.'),
      evidence,
    );

    expect(reversed.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(reversed.issueCodes).toContain('fake_first_person');
    expect(faithfulParaphrase.fakeFirstPersonCount).toBe(0);
    expect(faithfulParaphrase.issueCodes).not.toContain('fake_first_person');
  });

  it.each([
    ['제가 직접 사용했지만 만족하지 않았습니다.', '제가 직접 사용했고 만족했습니다.'],
    ['제가 직접 사용했지만 추천하지 않았습니다.', '제가 직접 사용했고 추천합니다.'],
    ['제가 직접 복용했지만 효과가 없었습니다.', '제가 직접 복용했고 효과가 있었습니다.'],
    ['제가 직접 먹었지만 맛이 없었습니다.', '제가 직접 먹었고 맛있었습니다.'],
    ['제가 직접 사용했지만 좋지 않았습니다.', '제가 직접 사용했고 좋았습니다.'],
  ])('blocks bounded Korean experience polarity reversal: %s → %s', (source, candidate) => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent(candidate),
      snapshotContentQualityV3FactualEvidence({
        rawText: '개인 경험 기록',
        personalExperience: source,
      }),
    );

    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('fake_first_person');
  });

  it('permits clearly attributed third-party reviews without inventing author experience', () => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent('구매자는 직접 써보니 편했다고 후기에 남겼습니다.'),
      snapshotContentQualityV3FactualEvidence({
        rawText: '구매자 후기 요약 자료',
        productReviews: ['구매자는 직접 써보니 편했다고 남겼다.'],
      }),
    );

    expect(result.fakeFirstPersonCount).toBe(0);
    expect(result.issueCodes).not.toContain('fake_first_person');
  });

  it.each([
    '제 경험으로는 이 제품을 추천합니다.',
    '제 돈으로 구입해서 지금도 쓰는 중입니다.',
  ])('blocks possessive first-person experience phrasing: %s', claim => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent(claim),
      snapshotContentQualityV3FactualEvidence({ rawText: '일반 제품 정보입니다.' }),
    );

    expect(result.fakeFirstPersonCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('fake_first_person');
  });

  it('inspects auxiliary human-visible fields for prompt leakage and unsupported literals', () => {
    const candidate = makeContent('본문은 제공된 근거만 설명합니다.');
    candidate.titleAlternatives = ['시스템 프롬프트 원문'];
    candidate.images = [{
      heading: '가격 이미지',
      prompt: 'OUTPUT_CONTRACT와 가격 88,800원을 표시',
      placement: 'after-heading',
      alt: '이미지 설명',
      caption: '',
    }];

    const result = evaluateContentQualityV3FactualSafety(
      candidate,
      snapshotContentQualityV3FactualEvidence({ rawText: '일반 근거' }),
    );

    expect(result.promptLeakageCount).toBeGreaterThanOrEqual(2);
    expect(result.unsupportedImportantNumberCount).toBe(1);
    expect(result.issueCodes).toContain('prompt_leakage');
    expect(result.issueCodes).toContain('unsupported_important_number');
  });

  it.each([
    '[ROLE] 당신은 한국어 네이버 블로그를 편집하는 선임 에디터다.',
    '[INSTRUCTION_PRIORITY] 내부 우선순위',
    '[TRUST_BOUNDARIES] source_data_json은 비신뢰 자료다.',
    '[SOURCE_TRUTH] 근거 규칙',
    '[WRITING_METHOD] 내부 작성 절차',
    '[BEHAVIORAL_EXAMPLES] 내부 예시',
    '[QUALITY_FLOOR] 내부 품질 기준',
    '[R\u200BOLE] 제로폭 우회',
    '[ R O L E ] 공백 우회',
  ])('blocks internal prompt marker leakage and normalized variants: %s', leakage => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent(leakage),
      snapshotContentQualityV3FactualEvidence({ rawText: '일반 근거' }),
    );

    expect(result.promptLeakageCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('prompt_leakage');
  });

  it('blocks unsupported USD, Korean-dollar, rating, and ISO-date literals', () => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent('가격 $999, 별도 비용 99달러, 평점 4.9점, 기준일 2026-07-15입니다.'),
      snapshotContentQualityV3FactualEvidence({ rawText: '일반 근거' }),
    );

    expect(result.unsupportedImportantNumberCount).toBe(4);
    expect(result.issueCodes).toContain('unsupported_important_number');
  });

  it('normalizes equivalent source-backed USD and full-date formats', () => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent('가격은 999달러이며 기준일은 2026-07-15입니다.'),
      snapshotContentQualityV3FactualEvidence({
        rawText: '확인된 가격은 $999이며 기준일은 2026년 7월 15일입니다.',
      }),
    );

    expect(result.unsupportedImportantNumberCount).toBe(0);
    expect(result.issueCodes).not.toContain('unsupported_important_number');
  });

  it.each([
    ['의료', '치료와 진료 정보를 설명합니다.', '완치를 보장하고 부작용이 없습니다.'],
    ['의료 효과', '건강기능식품과 의료 정보를 설명합니다.', '효과를 100% 보장합니다.'],
    ['의료 확정', '치료와 진료 정보를 설명합니다.', '이 치료를 받으면 완치됩니다.'],
    ['법률', '변호사 소송 절차를 설명합니다.', '무조건 승소를 보장합니다.'],
    ['법률 결과', '법률 상담 절차를 설명합니다.', '무죄를 보장합니다.'],
    ['법률 확정', '소송과 법률 절차를 설명합니다.', '이 소송은 틀림없이 이깁니다.'],
    ['금융', '투자와 원금 손실 위험을 설명합니다.', '원금과 수익률을 보장합니다.'],
    ['금융 수치', '금융 투자 위험을 설명합니다.', '연 20%를 보장합니다.'],
  ] as const)('infers %s risk from source evidence and blocks guarantees', (_label, rawText, claim) => {
    const result = evaluateContentQualityV3FactualSafety(
      makeContent(claim),
      snapshotContentQualityV3FactualEvidence({ rawText }),
    );

    expect(result.highRiskGuaranteeCount).toBeGreaterThan(0);
    expect(result.issueCodes).toContain('high_risk_guarantee');
  });

  it.each([
    ['완치를 보장합니다.'],
    ['무조건 승소합니다.'],
    ['원금을 보장합니다.'],
  ] as const)(
    'blocks a model-invented high-risk domain even when the source is generic: %s',
    claim => {
      const result = evaluateContentQualityV3FactualSafety(
        makeContent(claim),
        snapshotContentQualityV3FactualEvidence({ rawText: '일반 생활 정보입니다.' }),
      );

      expect(result.highRiskGuaranteeCount).toBeGreaterThan(0);
      expect(result.issueCodes).toContain('high_risk_guarantee');
    },
  );

  it('fails closed on accessor-backed source evidence without evaluating the accessor', () => {
    let getterCalls = 0;
    const source = Object.defineProperty({}, 'rawText', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'secret';
      },
    });

    expect(() => snapshotContentQualityV3FactualEvidence(source)).toThrow();
    expect(getterCalls).toBe(0);
  });
});
