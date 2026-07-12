import type {
  ArticleDraft,
  ContentPolicyInput,
  IntentAnalysis,
  IntentType,
} from './types';

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/).filter((token) => token.length >= 2))];
}

function draftBody(draft: ArticleDraft): string {
  return [
    draft.introduction,
    draft.body_markdown,
    ...draft.headings.flatMap((heading) => [heading.title, heading.content]),
    ...draft.faq.flatMap((entry) => [entry.question, entry.answer]),
  ].join(' ');
}

function includesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function inferIntentTypes(input: ContentPolicyInput): IntentType[] {
  const context = normalize([
    input.primary_keyword,
    input.search_intent_hint ?? '',
    input.content_goal ?? '',
    ...(input.secondary_keywords ?? []),
    ...(input.related_questions ?? []),
  ].join(' '));
  const inferred: IntentType[] = ['informational'];

  if (input.region?.trim()) inferred.push('local');
  if (input.service?.trim() || input.cta?.trim() || includesAny(context, [/\b(?:buy|book|quote|price|cost|hire|service)\b/i])) {
    inferred.push('transactional');
  }
  if (includesAny(context, [/\b(?:compare|comparison|versus|vs|difference|better)\b/i])) {
    inferred.push('comparison');
  }
  if (includesAny(context, [/\b(?:urgent|today|immediate|quickly|emergency)\b/i])) {
    inferred.push('urgent');
  }
  if (includesAny(context, [/\b(?:aftercare|follow up|maintenance|after service)\b/i])) {
    inferred.push('aftercare');
  }

  return [...new Set(inferred)];
}

function keywordCoverage(keyword: string, body: string): number {
  const normalizedKeyword = normalize(keyword);
  const normalizedBody = normalize(body);
  if (!normalizedKeyword || !normalizedBody) return 0;
  if (normalizedBody.includes(normalizedKeyword)) return 1;

  const keywordTokens = tokens(keyword);
  if (keywordTokens.length === 0) return 0;
  const matched = keywordTokens.filter((token) => normalizedBody.includes(token)).length;
  return matched / keywordTokens.length;
}

export function analyzeSearchIntent(
  input: ContentPolicyInput,
  draft?: ArticleDraft,
): IntentAnalysis {
  const mismatchReasons: string[] = [];

  if (draft) {
    const body = draftBody(draft);
    if (!normalize(body)) {
      mismatchReasons.push('EMPTY_DRAFT_BODY');
    }
    if (keywordCoverage(input.primary_keyword, body) < 0.5) {
      mismatchReasons.push('KEYWORD_BODY_MISMATCH');
    }
  }

  const questions = (input.related_questions ?? [])
    .map((question) => question.trim())
    .filter(Boolean);
  const primaryQuestion = input.search_intent_hint?.trim()
    || questions[0]
    || `What should the reader know about ${input.primary_keyword.trim()}?`;

  return {
    type: inferIntentTypes(input),
    primary_question: primaryQuestion,
    supporting_questions: [...new Set(questions.filter((question) => question !== primaryQuestion))],
    keyword_intent_mismatch: mismatchReasons.length > 0,
    mismatch_reasons: mismatchReasons,
  };
}
