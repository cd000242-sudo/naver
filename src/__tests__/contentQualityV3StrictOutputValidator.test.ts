import { describe, expect, it } from 'vitest';

import { finalizeContentQualityV3Draft } from '../contentQualityV3/finalizer.js';
import {
  validateContentQualityV3StrictOutput,
} from '../contentQualityV3/strictOutputValidator.js';

function heading(index: number) {
  return {
    title: `소제목 ${index}`,
    content: `본문 ${index}`,
    summary: `요약 ${index}`,
    keywords: ['키워드'],
    imagePrompt: '',
  };
}

function schemaValidOutput() {
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: '검증된 제목',
    titleAlternatives: ['대안 제목'],
    titleCandidates: [{ text: '후보 제목', score: 80, reasoning: '근거 일치' }],
    bodyHtml: '<b>discarded</b>',
    bodyPlain: '근거에 맞는 본문입니다.',
    headings: [heading(1), heading(2), heading(3)],
    hashtags: ['#근거'],
    images: [],
    metadata: {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1분',
      wordCount: 20,
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

describe('Content Quality V3 strict output validator', () => {
  it('sanitizes an exact native-schema output into an immutable clone', () => {
    const original = schemaValidOutput();
    const result = validateContentQualityV3StrictOutput(original);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected strict output');
    expect(result.content).toEqual(original);
    expect(result.content).not.toBe(original);
    expect(Object.isFrozen(result.content)).toBe(true);
    expect(Object.isFrozen(result.content.headings)).toBe(true);
    expect(Object.isFrozen(result.content.headings[0])).toBe(true);
  });

  it.each([
    ['top-level extra key', (value: any) => ({ ...value, extra: true })],
    ['nested extra key', (value: any) => ({
      ...value,
      metadata: { ...value.metadata, extra: true },
    })],
    ['empty alternatives', (value: any) => ({ ...value, titleAlternatives: [] })],
    ['too few headings', (value: any) => ({ ...value, headings: value.headings.slice(0, 2) })],
    ['too many headings', (value: any) => ({
      ...value,
      headings: Array.from({ length: 11 }, (_, index) => heading(index)),
    })],
    ['out-of-range candidate score', (value: any) => ({
      ...value,
      titleCandidates: [{ ...value.titleCandidates[0], score: 101 }],
    })],
    ['fractional word count', (value: any) => ({
      ...value,
      metadata: { ...value.metadata, wordCount: 1.5 },
    })],
    ['invalid enum', (value: any) => ({
      ...value,
      quality: { ...value.quality, legalRisk: 'unknown' },
    })],
  ])('rejects %s exactly as the provider schema does', (_label, mutate) => {
    const result = validateContentQualityV3StrictOutput(mutate(schemaValidOutput()));

    expect(result).toEqual({ ok: false, issueCode: 'strict_schema_invalid' });
  });

  it('rejects accessors without evaluating them', () => {
    const candidate = schemaValidOutput();
    let reads = 0;
    Object.defineProperty(candidate.metadata, 'seoScore', {
      enumerable: true,
      get: () => {
        reads += 1;
        return 90;
      },
    });

    expect(validateContentQualityV3StrictOutput(candidate))
      .toEqual({ ok: false, issueCode: 'strict_schema_invalid' });
    expect(reads).toBe(0);
  });

  it('makes the production finalizer fail closed on schema-invalid output', () => {
    const invalid = { ...schemaValidOutput(), extra: 'not-in-native-schema' };

    expect(finalizeContentQualityV3Draft(invalid)).toEqual({
      ok: false,
      issueCode: 'structured_output_invalid_structure',
    });
    expect(finalizeContentQualityV3Draft(schemaValidOutput())).toMatchObject({ ok: true });
  });
});
