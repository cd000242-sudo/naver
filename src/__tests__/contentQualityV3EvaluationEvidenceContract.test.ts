import { describe, expect, it } from 'vitest';

import { CONTENT_QUALITY_V3_RELEASE_CORPUS } from '../contentQualityV3/evalCorpus.js';
import {
  buildContentQualityV3ExpectedRequestBytes,
  deriveContentQualityV3CandidateEvidence,
  encodeContentQualityV3CanonicalJson,
} from '../contentQualityV3/evaluationEvidenceContract.js';

function outputForCase() {
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: '근거 중심 판단 기준',
    titleAlternatives: ['근거 중심 대안'],
    titleCandidates: [{ text: '근거 중심 판단 기준', score: 90, reasoning: '근거 일치' }],
    bodyHtml: '<script>discarded</script>',
    bodyPlain: '제공된 근거 범위에서 판단 기준을 설명합니다.',
    headings: Array.from({ length: 3 }, (_, index) => ({
      title: `판단 기준 ${index + 1}`,
      content: '근거 설명',
      summary: '근거 요약',
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
      wordCount: 30,
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

describe('Content Quality V3 evaluation evidence contract', () => {
  it('encodes the exact current prompt/provider request deterministically', () => {
    const evalCase = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(item => item.stratum === 'seo');
    if (!evalCase) throw new Error('missing seo case');

    const first = buildContentQualityV3ExpectedRequestBytes(evalCase);
    const second = buildContentQualityV3ExpectedRequestBytes(evalCase);
    const envelope = JSON.parse(Buffer.from(first).toString('utf8')) as Record<string, unknown>;

    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    expect(envelope).toMatchObject({
      model: 'gemini-3.1-flash-lite',
      useGrounding: false,
    });
    expect(JSON.stringify(envelope)).not.toContain('temperature');
  });

  it('strictly derives canonical final candidate bytes from the provider response', () => {
    const evalCase = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(item => item.stratum === 'seo');
    if (!evalCase) throw new Error('missing seo case');
    const rawOutput = outputForCase();
    const derived = deriveContentQualityV3CandidateEvidence(
      evalCase,
      Buffer.from(JSON.stringify(rawOutput), 'utf8'),
    );
    const materialized = JSON.parse(Buffer.from(derived.candidateOutputBytes).toString('utf8'));

    expect(materialized.bodyPlain).toBe(rawOutput.bodyPlain);
    expect(materialized.bodyHtml).toBe('제공된 근거 범위에서 판단 기준을 설명합니다.');
    expect(Buffer.from(derived.candidateOutputBytes).equals(Buffer.from(
      encodeContentQualityV3CanonicalJson(materialized),
    ))).toBe(true);
  });

  it('rejects invalid UTF-8, schema extras, and unrelated non-JSON responses', () => {
    const evalCase = CONTENT_QUALITY_V3_RELEASE_CORPUS[0];
    const withExtra = { ...outputForCase(), extra: true };

    for (const bytes of [
      new Uint8Array([0xc3, 0x28]),
      Buffer.from(JSON.stringify(withExtra), 'utf8'),
      Buffer.from('not-json', 'utf8'),
    ]) {
      expect(() => deriveContentQualityV3CandidateEvidence(evalCase, bytes))
        .toThrowError('INVALID_CONTENT_QUALITY_V3_EVALUATION_EVIDENCE');
    }
  });
});
