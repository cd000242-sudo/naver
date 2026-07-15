export const LEGACY_SEMANTIC_POST_DRAFT_MUTATIONS = Object.freeze([
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
] as const);

export type LegacySemanticPostDraftMutation =
  typeof LEGACY_SEMANTIC_POST_DRAFT_MUTATIONS[number];

/**
 * V3 owns its wording and factual contract end-to-end. Only the exact legacy
 * driver may run post-draft transforms that can add or rewrite semantics.
 */
export function shouldRunLegacySemanticPostDraftMutation(
  promptVariant: unknown,
  mutation: unknown,
): mutation is LegacySemanticPostDraftMutation {
  return promptVariant === 'legacy'
    && LEGACY_SEMANTIC_POST_DRAFT_MUTATIONS.some(item => item === mutation);
}
