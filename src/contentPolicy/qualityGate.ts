import {
  normalizeText,
  splitNormalizedSentences,
  tokenCoverage,
  tokenize,
} from './textMetrics';
import { hasSourceCopySignal } from './similarityGuard';
import type {
  ArticleDraft,
  ContentPolicyConfig,
  ContentPolicyInput,
  IntentAnalysis,
  QualityReport,
  SimilarityReport,
} from './types';

export interface QualityGateContext {
  readonly input: ContentPolicyInput;
  readonly draft: ArticleDraft;
  readonly intent: IntentAnalysis;
  readonly similarity: SimilarityReport;
  readonly config: ContentPolicyConfig;
}

const RISKY_CLAIM = /(?:\d[\d,.]*\s*(?:원|만원|천원|억원|%|퍼센트|명|건|회)|100\s*%|상위\s*노출|보장|무조건|모두가?\s*만족|완벽(?:히|한)?|반드시\s*(?:해결|성공))/u;
const FIRSTHAND_CLAIM = /(?:지난(?:달|주|해)|현장에서|고객\s*\d|저희가\s*직접|직접\s*(?:작업|처리)|실제\s*(?:사례|경험))/u;
const EXPLICIT_NO_GUARANTEE = /(?:단정(?:하|하기|할)\S*\s*(?:어렵|힘들|없)|보장(?:하|할)\S*\s*(?:어렵|없|않)|100\s*%?\s*(?:아니|보장되지|확실하지)|완벽(?:히|한)?\S*\s*(?:아니|보장되지|확실하지)|차량마다\s*(?:다르|달라)|최신\s*(?:가격|조건)\S*\s*확인)/u;

function weightedScore(weight: number, factor: number): number {
  const safeFactor = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 0;
  return Math.round(weight * safeFactor * 100) / 100;
}

function articleBody(draft: ArticleDraft): string {
  return [
    draft.introduction,
    draft.body_markdown,
    ...draft.headings.map((heading) => `${heading.title}\n${heading.content}`),
    ...draft.faq.map((item) => `${item.question}\n${item.answer}`),
  ].filter(Boolean).join('\n\n');
}

function wholeArticle(draft: ArticleDraft): string {
  return [draft.title, draft.summary, articleBody(draft), draft.cta].filter(Boolean).join('\n\n');
}

function includesNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  return normalizedNeedle.length > 0 && normalizeText(haystack).includes(normalizedNeedle);
}

function intentFactor(context: QualityGateContext): number {
  if (context.intent.keyword_intent_mismatch) return 0;

  const { input, draft } = context;
  const body = articleBody(draft);
  const titleMatch = includesNormalized(draft.title, input.primary_keyword);
  const bodyMatch = includesNormalized(body, input.primary_keyword)
    || tokenCoverage(input.primary_keyword, body) >= 0.8;
  const introductionMatch = includesNormalized(draft.introduction, input.primary_keyword)
    || tokenCoverage(input.primary_keyword, draft.introduction) >= 0.8;
  return 0.55 + (titleMatch ? 0.2 : 0) + (bodyMatch ? 0.2 : 0) + (introductionMatch ? 0.05 : 0);
}

function countWithinRange(count: number, minimum: number, maximum: number): number {
  if (count >= minimum && count <= maximum) return 1;
  if (count > 0 && count < minimum) return count / minimum;
  if (count > maximum) return Math.max(0, 1 - ((count - maximum) / Math.max(1, maximum)));
  return 0;
}

function readerValueFactor(context: QualityGateContext): number {
  const { draft, config } = context;
  const headingFit = countWithinRange(
    draft.headings.length,
    config.content.headings_min,
    config.content.headings_max,
  );
  const faqFit = countWithinRange(draft.faq.length, config.content.faq_min, config.content.faq_max);
  const completeHeadings = draft.headings.length === 0 ? 0 : draft.headings.filter((heading) => (
    normalizeText(heading.title).length > 0 && normalizeText(heading.content).length >= 8
  )).length / draft.headings.length;
  const supportingCopy = Number(Boolean(normalizeText(draft.summary)))
    + Number(Boolean(normalizeText(draft.cta)));
  return (headingFit * 0.4) + (faqFit * 0.25) + (completeHeadings * 0.2) + (supportingCopy * 0.075);
}

function originalityFactor(similarity: SimilarityReport): number {
  if (similarity.risk === 'HIGH') return 0;
  if (similarity.risk === 'MEDIUM') return 0.55;
  return 1;
}

function firstPartyFactor(context: QualityGateContext): number {
  const { input, draft } = context;
  if (input.business_facts_applicable === false) return 1;
  if ((input.input_origin === 'semi_auto_manual' || input.input_origin === 'final_draft_payload')
    && input.business_facts_applicable !== true) return 1;
  if (input.business_facts.length === 0) return 0;

  const body = articleBody(draft);
  const coveredFacts = input.business_facts.filter((fact) => (
    includesNormalized(body, fact) || tokenCoverage(fact, body) >= 0.35
  )).length;
  const factCoverage = coveredFacts / input.business_facts.length;
  const firstPartySources = (input.source_materials ?? []).filter((source) => (
    source.type === 'first_party' && Boolean(source.source_id)
  ));
  const citedSourceIds = new Set(draft.source_ids ?? []);
  const citationCoverage = firstPartySources.length === 0
    ? 1
    : firstPartySources.filter((source) => citedSourceIds.has(source.source_id as string)).length
      / firstPartySources.length;
  return (factCoverage * 0.75) + (citationCoverage * 0.25);
}

function readabilityFactor(context: QualityGateContext): number {
  const { draft, config } = context;
  const titleLength = normalizeText(draft.title).length;
  const titleFit = titleLength >= 8 && titleLength <= 80 ? 1 : 0;
  const summaryFit = normalizeText(draft.summary).length >= 8 ? 1 : 0;
  const sentences = splitNormalizedSentences(articleBody(draft));
  const averageSentenceLength = sentences.length === 0
    ? 0
    : sentences.reduce((sum, sentence) => sum + sentence.length, 0) / sentences.length;
  const sentenceFit = averageSentenceLength >= 8 && averageSentenceLength <= 120 ? 1 : 0.4;
  const structureFit = (
    countWithinRange(draft.headings.length, config.content.headings_min, config.content.headings_max)
    + countWithinRange(draft.faq.length, config.content.faq_min, config.content.faq_max)
  ) / 2;
  return (titleFit * 0.2) + (summaryFit * 0.2) + (sentenceFit * 0.3) + (structureFit * 0.3);
}

function evidenceTexts(input: ContentPolicyInput): string[] {
  return [
    ...input.business_facts,
    ...(input.source_materials ?? [])
      .filter((source) => source.type === 'first_party' || source.type === 'official')
      .map((source) => source.content),
  ];
}

function numbersIn(value: string): string[] {
  return normalizeText(value).match(/\d[\d,.]*/gu) ?? [];
}

function isSupportedClaim(claim: string, evidence: readonly string[]): boolean {
  const claimNumbers = numbersIn(claim);
  return evidence.some((item) => {
    const normalizedEvidence = normalizeText(item);
    const numbersMatch = claimNumbers.length === 0
      || claimNumbers.every((number) => normalizedEvidence.includes(number));
    return numbersMatch && (
      includesNormalized(item, claim)
      || includesNormalized(claim, item)
      || tokenCoverage(claim, item) >= (claimNumbers.length > 0 ? 0.35 : 0.65)
    );
  });
}

function unsupportedClaims(input: ContentPolicyInput, draft: ArticleDraft): string[] {
  const article = wholeArticle(draft);
  const evidence = evidenceTexts(input);
  const riskySentences = splitNormalizedSentences(article, 6).filter((sentence) => (
    (RISKY_CLAIM.test(sentence) || FIRSTHAND_CLAIM.test(sentence))
    && !EXPLICIT_NO_GUARANTEE.test(sentence)
  ));
  const unsupportedRiskySentences = riskySentences.filter((claim) => !isSupportedClaim(claim, evidence));
  const forbiddenClaims = (input.forbidden_claims ?? []).filter((claim) => (
    includesNormalized(article, claim)
  ));
  return [...new Set([...forbiddenClaims, ...unsupportedRiskySentences])];
}

function keywordStuffingDetected(context: QualityGateContext): boolean {
  const { input, draft, config } = context;
  const normalizedKeyword = normalizeText(input.primary_keyword);
  if (!normalizedKeyword) return false;

  const normalizedBody = normalizeText(articleBody(draft));
  const bodyOccurrences = normalizedBody.split(normalizedKeyword).length - 1;
  const bodyTokenCount = Math.max(1, tokenize(normalizedBody).length);
  const titleOccurrences = normalizeText(draft.title).split(normalizedKeyword).length - 1;
  return titleOccurrences > config.content.primary_keyword_in_title_max
    || (config.content.prohibit_keyword_stuffing
      && bodyOccurrences >= 4
      && bodyOccurrences / bodyTokenCount > 0.04);
}

function spamSafetyFactor(context: QualityGateContext, unsupported: readonly string[]): number {
  const article = wholeArticle(context.draft);
  const hasForbiddenClaim = (context.input.forbidden_claims ?? []).some((claim) => (
    includesNormalized(article, claim)
  ));
  const hasKeywordStuffing = keywordStuffingDetected(context);
  const ctaOccurrences = normalizeText(context.draft.cta).length > 0
    ? normalizeText(articleBody(context.draft)).split(normalizeText(context.draft.cta)).length - 1
    : 0;
  const tooManyCtas = ctaOccurrences + Number(Boolean(normalizeText(context.draft.cta)))
    > context.config.content.cta_max_count;
  return 1
    - (hasForbiddenClaim ? 0.4 : 0)
    - (unsupported.length > 0 ? 0.3 : 0)
    - (hasKeywordStuffing ? 0.2 : 0)
    - (tooManyCtas ? 0.1 : 0);
}

function inputFieldPresent(input: ContentPolicyInput, field: string): boolean {
  const value = (input as unknown as Record<string, unknown>)[field];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function configuredFatalErrors(
  context: QualityGateContext,
  unsupported: readonly string[],
): string[] {
  const candidates = [
    context.intent.keyword_intent_mismatch ? 'keyword_body_mismatch' : null,
    unsupported.length > 0 ? 'fabricated_fact' : null,
    hasSourceCopySignal(context.similarity) ? 'copied_or_lightly_paraphrased_source' : null,
    context.similarity.risk === 'HIGH' ? 'excessive_similarity' : null,
    context.config.inputs.required.some((field) => (
      field !== 'recent_posts'
      && (field !== 'business_facts' || context.input.business_facts_applicable !== false)
      && !inputFieldPresent(context.input, field)
    ))
      ? 'missing_required_input'
      : null,
  ].filter((error): error is string => error !== null);
  return [...new Set(candidates.filter((error) => (
    context.config.quality_gate.fatal_errors.includes(error)
  )))];
}

function resolveContext(
  inputOrContext: ContentPolicyInput | QualityGateContext,
  draft?: ArticleDraft,
  intent?: IntentAnalysis,
  similarity?: SimilarityReport,
  config?: ContentPolicyConfig,
): QualityGateContext {
  if ('input' in inputOrContext) return inputOrContext;
  if (!draft || !intent || !similarity || !config) {
    throw new Error('QUALITY_GATE_ARGUMENTS_INVALID');
  }
  return { input: inputOrContext, draft, intent, similarity, config };
}

export function evaluateQuality(context: QualityGateContext): QualityReport;
export function evaluateQuality(
  input: ContentPolicyInput,
  draft: ArticleDraft,
  intent: IntentAnalysis,
  similarity: SimilarityReport,
  config: ContentPolicyConfig,
): QualityReport;
export function evaluateQuality(
  inputOrContext: ContentPolicyInput | QualityGateContext,
  draft?: ArticleDraft,
  intent?: IntentAnalysis,
  similarity?: SimilarityReport,
  config?: ContentPolicyConfig,
): QualityReport {
  const context = resolveContext(inputOrContext, draft, intent, similarity, config);
  const weights = context.config.quality_gate.weights;
  const unsupported = unsupportedClaims(context.input, context.draft);
  const intentScore = weightedScore(weights.intent_match, intentFactor(context));
  const readerValueScore = weightedScore(weights.reader_value, readerValueFactor(context));
  const originalityScore = weightedScore(weights.originality, originalityFactor(context.similarity));
  const firstPartyScore = weightedScore(weights.first_party_information, firstPartyFactor(context));
  const readabilityScore = weightedScore(weights.readability_and_accuracy, readabilityFactor(context));
  const spamSafetyScore = weightedScore(weights.anti_spam_safety, spamSafetyFactor(context, unsupported));
  const totalScore = Math.round((
    intentScore
    + readerValueScore
    + originalityScore
    + firstPartyScore
    + readabilityScore
    + spamSafetyScore
  ) * 100) / 100;

  return {
    total_score: totalScore,
    intent_score: intentScore,
    reader_value_score: readerValueScore,
    originality_score: originalityScore,
    first_party_score: firstPartyScore,
    readability_score: readabilityScore,
    spam_safety_score: spamSafetyScore,
    unsupported_claims: unsupported,
    keyword_intent_mismatch: context.intent.keyword_intent_mismatch,
    fatal_errors: configuredFatalErrors(context, unsupported),
  };
}

export const runQualityGate = evaluateQuality;

export function passesQualityGate(report: QualityReport, config: ContentPolicyConfig): boolean {
  return report.fatal_errors.length === 0
    && report.total_score >= config.quality_gate.pass_score;
}

export function passesQualitySafetyGate(report: QualityReport): boolean {
  return report.fatal_errors.length === 0;
}
