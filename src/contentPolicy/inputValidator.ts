import type {
  ArticleDraft,
  ContentPolicyConfig,
  ContentPolicyInput,
} from './types';

export interface PolicyInputValidationResult {
  valid: boolean;
  isValid: boolean;
  blockReasons: string[];
  warnings: string[];
  missingFields: string[];
}

const DEFAULT_REQUIRED_FIELDS = [
  'primary_keyword',
  'target_reader',
  'business_facts',
  'recent_posts',
];

const REQUIRED_FIELD_REASONS: Record<string, string> = {
  primary_keyword: 'BLOCK_MISSING_PRIMARY_KEYWORD',
  target_reader: 'BLOCK_MISSING_TARGET_READER',
  business_facts: 'BLOCK_MISSING_FACTS',
  recent_posts: 'BLOCK_MISSING_RECENT_POSTS',
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some(hasText);
}

function isRequiredValuePresent(input: ContentPolicyInput, field: string): boolean {
  const value = (input as unknown as Record<string, unknown>)[field];
  if (field === 'business_facts') return hasNonEmptyStringArray(value);
  if (field === 'recent_posts') return Array.isArray(value) && value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return hasText(value);
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function collectDraftText(draft: ArticleDraft): string {
  return [
    draft.title,
    draft.summary,
    draft.introduction,
    draft.body_markdown,
    ...draft.headings.flatMap((heading) => [heading.title, heading.content]),
    ...draft.faq.flatMap((entry) => [entry.question, entry.answer]),
    draft.cta,
  ].filter(hasText).join('\n');
}

function containsForbiddenClaim(input: ContentPolicyInput, draft: ArticleDraft): boolean {
  const text = normalizeForMatch(collectDraftText(draft));
  return (input.forbidden_claims ?? [])
    .filter(hasText)
    .some((claim) => text.includes(normalizeForMatch(claim)));
}

function containsUnverifiedFirsthandClaim(input: ContentPolicyInput, draft: ArticleDraft): boolean {
  const hasFirstPartyEvidence = (input.source_materials ?? [])
    .some((source) => source.type === 'first_party' && hasText(source.content));
  if (hasFirstPartyEvidence) return false;

  return /\b(?:i|we)\s+(?:personally\s+)?(?:handled|visited|experienced|witnessed)\b/i
    .test(collectDraftText(draft));
}

export function validatePolicyInput(
  input: ContentPolicyInput,
  draft?: ArticleDraft,
  config?: ContentPolicyConfig,
): PolicyInputValidationResult {
  const requiredFields = config?.inputs.required ?? DEFAULT_REQUIRED_FIELDS;
  const missingFields = requiredFields.filter((field) => !isRequiredValuePresent(input, field));
  const blockReasons = missingFields.map(
    (field) => REQUIRED_FIELD_REASONS[field] ?? `BLOCK_MISSING_${field.toUpperCase()}`,
  );
  const warnings: string[] = [];

  for (const field of config?.inputs.recommended ?? []) {
    if (!isRequiredValuePresent(input, field)) warnings.push(`MISSING_RECOMMENDED_${field.toUpperCase()}`);
  }

  if (draft) {
    if (!hasText(draft.title) || !hasText(draft.body_markdown)) {
      blockReasons.push('BLOCK_EMPTY_DRAFT');
    }
    if (containsForbiddenClaim(input, draft)) {
      blockReasons.push('BLOCK_FORBIDDEN_CLAIM');
    }
    if (containsUnverifiedFirsthandClaim(input, draft)) {
      blockReasons.push('BLOCK_FABRICATED_FIRSTHAND_EXPERIENCE');
    }
  }

  const uniqueBlockReasons = [...new Set(blockReasons)];
  return {
    valid: uniqueBlockReasons.length === 0,
    isValid: uniqueBlockReasons.length === 0,
    blockReasons: uniqueBlockReasons,
    warnings: [...new Set(warnings)],
    missingFields: [...missingFields],
  };
}
