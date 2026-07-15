import { describe, expect, it } from 'vitest';
import {
  finalizeStructuredContent,
  type ContentSource,
  type StructuredContent,
} from '../contentGenerator';
import {
  LEGACY_SEMANTIC_POST_DRAFT_MUTATIONS,
  shouldRunLegacySemanticPostDraftMutation,
} from '../contentQualityV3/postDraftMutationPolicy';

const EXPECTED_LEGACY_MUTATIONS = [
  'optimize-headings-for-mode',
  'apply-heading-keyword-patch',
  'enforce-sub-keyword-coverage',
  'optimize-for-viral',
  'filter-exaggerated-content',
  'humanize-content',
  'humanize-html-content',
  'optimize-content-for-naver',
  'optimize-html-for-naver',
  'truncate-heading-titles',
  'apply-keyword-prefix-to-structured-content',
  'apply-ordinal-heading-marker-fix',
  'recover-loose-structured-content-fields',
  'recover-missing-body-plain',
  'remove-duplicate-headings',
  'remove-repeated-full-content',
  'validate-structured-content',
  'strip-selected-title-prefix-from-headings',
  'strip-leading-subject-hook-from-headings',
  'cleanup-title-tokens',
  'repair-title-after-quality-gate',
] as const;

function createContent(title: string): StructuredContent {
  return {
    status: 'success',
    generationTime: '0ms',
    selectedTitle: title,
    titleAlternatives: [title],
    titleCandidates: [{ text: title, score: 90, reasoning: 'source-backed' }],
    bodyHtml: '<p>입력에서 확인된 사실만 설명합니다.</p>',
    bodyPlain: '입력에서 확인된 사실만 설명합니다.',
    headings: Array.from({ length: 3 }, () => ({
      title: '확인된 내용',
      content: '입력에서 확인된 사실만 설명합니다.',
      summary: '확인된 사실',
      keywords: [],
      imagePrompt: '',
    })),
    hashtags: ['#source'],
    images: [],
    metadata: {
      category: 'general',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1분',
      wordCount: 4,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: '',
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

const SOURCE: ContentSource = Object.freeze({
  sourceType: 'custom_text',
  rawText: '',
  contentMode: 'custom',
  metadata: Object.freeze({ keywords: Object.freeze([]) }),
});

describe('Content Quality V3 post-draft mutation policy', () => {
  it('publishes an immutable and exhaustive legacy mutation inventory', () => {
    expect(LEGACY_SEMANTIC_POST_DRAFT_MUTATIONS).toEqual(EXPECTED_LEGACY_MUTATIONS);
    expect(Object.isFrozen(LEGACY_SEMANTIC_POST_DRAFT_MUTATIONS)).toBe(true);
  });

  it('preserves every inventoried mutator for the exact legacy variant', () => {
    for (const mutation of EXPECTED_LEGACY_MUTATIONS) {
      expect(shouldRunLegacySemanticPostDraftMutation('legacy', mutation)).toBe(true);
    }
  });

  it('never invokes an inventoried semantic mutator for the exact v3 variant', () => {
    for (const mutation of EXPECTED_LEGACY_MUTATIONS) {
      expect(shouldRunLegacySemanticPostDraftMutation('v3', mutation)).toBe(false);
    }
  });

  it('fails closed for invalid variants and unregistered mutations without mutating inputs', () => {
    const invalidVariant = Object.freeze({ value: 'legacy' });
    const invalidMutation = Object.freeze({ value: 'optimize-for-viral' });

    expect(shouldRunLegacySemanticPostDraftMutation(undefined, 'optimize-for-viral')).toBe(false);
    expect(shouldRunLegacySemanticPostDraftMutation('V3', 'optimize-for-viral')).toBe(false);
    expect(shouldRunLegacySemanticPostDraftMutation(invalidVariant, 'optimize-for-viral')).toBe(false);
    expect(shouldRunLegacySemanticPostDraftMutation('legacy', 'future-unregistered-mutator')).toBe(false);
    expect(shouldRunLegacySemanticPostDraftMutation('legacy', invalidMutation)).toBe(false);
    expect(invalidVariant).toEqual({ value: 'legacy' });
    expect(invalidMutation).toEqual({ value: 'optimize-for-viral' });
  });

  it('preserves model-owned V3 title fields while legacy keeps its historical cleanup', () => {
    const v3 = finalizeStructuredContent(createContent('직접'), SOURCE, 'v3');
    const legacy = finalizeStructuredContent(createContent('직접'), SOURCE, 'legacy');

    expect(v3.selectedTitle).toBe('직접');
    expect(v3.titleAlternatives).toEqual(['직접']);
    expect(v3.titleCandidates.map(candidate => candidate.text)).toEqual(['직접']);
    expect(legacy.selectedTitle).toBe('');
    expect(legacy.titleAlternatives).toEqual([]);
    expect(legacy.titleCandidates.map(candidate => candidate.text)).toEqual(['']);
  });
});
