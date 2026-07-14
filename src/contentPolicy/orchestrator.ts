import { createHash } from 'crypto';
import { generateDraft } from './draftGenerator.js';
import { repairUnsupportedClaims } from './claimRepair.js';
import { validatePolicyInput } from './inputValidator.js';
import { generateOutline } from './outlineGenerator.js';
import {
  isRecentPostManualReviewReason,
  recentPostManualReviewReasons,
} from './manualReview.js';
import {
  evaluateQuality,
  passesQualityGate,
  passesQualitySafetyGate,
} from './qualityGate.js';
import { analyzeSearchIntent } from './searchIntentAnalyzer.js';
import { analyzeSimilarity, hasSourceCopySignal } from './similarityGuard.js';
import { buildUniquenessPlan } from './topicDiversifier.js';
import type {
  ArticleDraft,
  ContentPolicyConfig,
  ContentPolicyInput,
  ContentPolicyResult,
  IntentAnalysis,
  PolicyStageTrace,
  QualityReport,
  RecentPostsLoadResult,
  SimilarityReport,
  UniquenessPlan,
} from './types.js';

const DEFAULT_PROMPT_VERSION = 'content-policy-v1';
const DEFAULT_MODEL_VERSION = 'existing-draft-adapter';

export interface ContentPolicyPipelineOptions {
  input: ContentPolicyInput;
  draft: ArticleDraft;
  config: ContentPolicyConfig;
  recentPostsResult?: RecentPostsLoadResult;
  promptVersion?: string;
  modelVersion?: string;
  rewriteDraft?: (context: {
    draft: ArticleDraft;
    input: ContentPolicyInput;
    intent: IntentAnalysis;
    uniquenessPlan: UniquenessPlan;
    similarity: SimilarityReport;
    quality: QualityReport;
    reasons: string[];
    attempt: number;
  }) => Promise<ArticleDraft> | ArticleDraft;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stableValue(nested)]));
}

export function hashPolicyInput(input: ContentPolicyInput): string {
  return createHash('sha256').update(JSON.stringify(stableValue(input))).digest('hex');
}

function emptySimilarity(comparedPostCount: number): SimilarityReport {
  return {
    risk: 'HIGH',
    most_similar_article_id: null,
    title_jaccard: 0,
    intro_ngram_cosine: 0,
    body_embedding_cosine: 0,
    heading_overlap: 0,
    exact_sentence_reuse_ratio: 0,
    matched_patterns: [],
    embedding_model: 'not-run',
    compared_post_count: comparedPostCount,
  };
}

function emptyQuality(intent: IntentAnalysis, fatalErrors: string[]): QualityReport {
  return {
    total_score: 0,
    intent_score: 0,
    reader_value_score: 0,
    originality_score: 0,
    first_party_score: 0,
    readability_score: 0,
    spam_safety_score: 0,
    unsupported_claims: [],
    keyword_intent_mismatch: intent.keyword_intent_mismatch,
    fatal_errors: [...fatalErrors],
  };
}

function trace(
  stage: PolicyStageTrace['stage'],
  status: PolicyStageTrace['status'],
  reasons: readonly string[] = [],
): PolicyStageTrace {
  return { stage, status, reasons: [...reasons] };
}

function cloneDraft(draft: ArticleDraft): ArticleDraft {
  return {
    ...draft,
    headings: draft.headings.map((heading) => ({ ...heading })),
    faq: draft.faq.map((item) => ({ ...item })),
    source_ids: draft.source_ids ? [...draft.source_ids] : undefined,
  };
}

function compactTopic(primaryKeyword: string): string {
  const firstSegment = primaryKeyword
    .split(/[｜|\n\r]/u)
    .map((part) => part.trim())
    .find(Boolean) || '이 주제';
  if (firstSegment.length <= 60) return firstSegment;
  const shortened = firstSegment.slice(0, 60).replace(/\s+\S*$/u, '').trim();
  return shortened || firstSegment.slice(0, 60).trim();
}

function rewriteIntroductionForSimilarity(input: ContentPolicyInput, attempt: number): string {
  const topic = compactTopic(input.primary_keyword);
  const variants = [
    `${topic} 정보를 찾고 있다면 눈에 띄는 문구보다 실제 사용 조건과 확인해야 할 기준을 함께 살펴보는 편이 좋습니다. 필요한 부분부터 차근차근 정리해 보겠습니다.`,
    `${topic} 관련 선택을 앞두고 있다면 내 상황에 맞는 조건인지부터 확인해 보세요. 핵심 기준과 주의할 점을 순서대로 살펴보겠습니다.`,
  ];
  return variants[(Math.max(1, attempt) - 1) % variants.length];
}

function internalRewrite(
  draft: ArticleDraft,
  input: ContentPolicyInput,
  plan: UniquenessPlan,
  reasons: readonly string[],
  attempt: number,
  quality: QualityReport,
): ArticleDraft {
  const original = repairUnsupportedClaims(draft, input, quality.unsupported_claims);
  const hasNonClaimReason = reasons.some((reason) => (
    reason !== 'FABRICATED_FACT'
    && !reason.startsWith('UNSUPPORTED_CLAIM:')
  ));
  if (quality.unsupported_claims.length > 0 && !hasNonClaimReason) {
    return original;
  }
  const shouldRewriteIntroduction = reasons.some((reason) => (
    reason === 'INTRO_NGRAM_COSINE_EXCEEDED'
    || reason === 'REPEATED_OPENING_PATTERN'
  ));
  const originalIntroduction = original.introduction.trim();
  const directIntro = shouldRewriteIntroduction || !originalIntroduction
    ? rewriteIntroductionForSimilarity(input, attempt)
    : originalIntroduction;
  let body = original.body_markdown;
  if (directIntro !== originalIntroduction && original.introduction && body.includes(original.introduction)) {
    body = body.replace(original.introduction, directIntro);
  } else if (!originalIntroduction && !body.startsWith(directIntro)) {
    body = `${directIntro}\n\n${body}`.trim();
  }

  // Heading overlap is not a license to rotate sections. Reordering titles
  // without rewriting their content caused published articles to appear
  // scrambled. A real rewriteDraft callback may rewrite wording, but this
  // deterministic fallback always preserves semantic order.
  const headings = original.headings.map((heading) => ({ ...heading }));

  return {
    ...original,
    introduction: directIntro,
    headings,
    body_markdown: body,
    summary: original.summary || plan.difference_from_recent_posts[0] || directIntro,
  };
}

function buildBlockedResult(input: {
  policyInput: ContentPolicyInput;
  draft: ArticleDraft;
  config: ContentPolicyConfig;
  intent: IntentAnalysis;
  plan: UniquenessPlan;
  similarity: SimilarityReport;
  quality: QualityReport;
  reasons: string[];
  rewriteCount: number;
  stageTrace: PolicyStageTrace[];
  promptVersion: string;
  modelVersion: string;
}): ContentPolicyResult {
  const uniqueReasons = [...new Set(input.reasons)];
  const manualReviewReasons = recentPostManualReviewReasons(uniqueReasons);
  return {
    decision: 'BLOCK',
    block_reasons: uniqueReasons,
    manual_review: manualReviewReasons.length > 0
      ? { required: true, reasons: manualReviewReasons, approved: false }
      : undefined,
    intent: input.intent,
    uniqueness_plan: input.plan,
    article: {
      title: input.draft.title,
      summary: input.draft.summary,
      introduction: input.draft.introduction,
      headings: input.draft.headings.map((heading) => ({ ...heading })),
      body_markdown: input.draft.body_markdown,
      faq: input.draft.faq.map((item) => ({ ...item })),
      cta: input.draft.cta,
    },
    quality_report: input.quality,
    similarity_report: input.similarity,
    publication: {
      allowed: false,
      template_id: input.policyInput.template_id || input.plan.structure_type,
      monitor_required: true,
      manual_review_required: true,
    },
    rewrite_count: input.rewriteCount,
    policy_version: String(input.config.version),
    prompt_version: input.promptVersion,
    model_version: input.modelVersion,
    input_hash: hashPolicyInput(input.policyInput),
    stage_trace: input.stageTrace,
  };
}

function rewriteReasons(similarity: SimilarityReport, quality: QualityReport, config: ContentPolicyConfig): string[] {
  const reasons = [...similarity.matched_patterns];
  if (quality.total_score < config.quality_gate.pass_score) reasons.push('QUALITY_SCORE_BELOW_THRESHOLD');
  if (quality.fatal_errors.includes('fabricated_fact')) reasons.push('FABRICATED_FACT');
  reasons.push(...quality.unsupported_claims.map((claim) => `UNSUPPORTED_CLAIM:${claim}`));
  return [...new Set(reasons)];
}

export async function runContentPolicyPipeline(
  options: ContentPolicyPipelineOptions,
): Promise<ContentPolicyResult> {
  const promptVersion = options.promptVersion || DEFAULT_PROMPT_VERSION;
  const modelVersion = options.modelVersion || DEFAULT_MODEL_VERSION;
  const effectivePosts = options.input.recent_posts
    ?? (options.recentPostsResult?.ok ? options.recentPostsResult.posts : undefined);
  const input: ContentPolicyInput = {
    ...options.input,
    recent_posts: effectivePosts ? effectivePosts.map((post) => ({ ...post, headings: [...post.headings] })) : undefined,
  };
  const draft = cloneDraft(options.draft);
  const stageTrace: PolicyStageTrace[] = [];
  const availabilityReasons: string[] = [];

  if (!effectivePosts && options.recentPostsResult && !options.recentPostsResult.ok) {
    availabilityReasons.push('BLOCK_RECENT_POSTS_UNAVAILABLE');
  } else if (!effectivePosts) {
    availabilityReasons.push('BLOCK_RECENT_POSTS_UNAVAILABLE');
  } else if (effectivePosts.length < options.config.similarity.compare_recent_posts_min) {
    availabilityReasons.push('BLOCK_INSUFFICIENT_RECENT_POSTS');
  }

  const validation = validatePolicyInput(input, draft, options.config);
  const inputReasons = [...new Set([...availabilityReasons, ...validation.blockReasons])];
  const blockingInputReasons = inputReasons.filter((reason) => !isRecentPostManualReviewReason(reason));
  const manualReviewReasons = recentPostManualReviewReasons(inputReasons);
  stageTrace.push(trace('InputValidator', inputReasons.length === 0 ? 'PASS' : 'BLOCK', inputReasons));

  const intent = analyzeSearchIntent(input, draft);
  stageTrace.push(trace(
    'SearchIntentAnalyzer',
    intent.keyword_intent_mismatch ? 'BLOCK' : 'PASS',
    intent.mismatch_reasons,
  ));
  const plan = buildUniquenessPlan(input, intent, options.config);
  stageTrace.push(trace('TopicDiversifier', 'PASS', plan.difference_from_recent_posts));

  if (blockingInputReasons.length > 0) {
    stageTrace.push(trace('OutlineGenerator', 'SKIP', ['INPUT_BLOCKED']));
    stageTrace.push(trace('DraftGenerator', 'SKIP', ['INPUT_BLOCKED']));
    stageTrace.push(trace('SimilarityGuard', 'SKIP', ['INPUT_BLOCKED']));
    stageTrace.push(trace('QualityGate', 'SKIP', ['INPUT_BLOCKED']));
    stageTrace.push(trace('PublishGuard', 'BLOCK', inputReasons));
    stageTrace.push(trace('ExposureMonitor', 'SKIP', ['NOT_PUBLISHED']));
    return buildBlockedResult({
      policyInput: input,
      draft,
      config: options.config,
      intent,
      plan,
      similarity: emptySimilarity(effectivePosts?.length || 0),
      quality: emptyQuality(intent, ['missing_required_input']),
      reasons: inputReasons,
      rewriteCount: 0,
      stageTrace,
      promptVersion,
      modelVersion,
    });
  }

  const outline = generateOutline(input, intent, plan, options.config);
  stageTrace.push(trace('OutlineGenerator', 'PASS'));
  generateDraft(input, outline, options.config);
  stageTrace.push(trace('DraftGenerator', 'PASS', ['EXISTING_GENERATOR_ADAPTER']));

  let workingDraft = draft;
  let rewriteCount = 0;
  let currentIntent = intent;
  let similarity = await analyzeSimilarity(input, workingDraft, options.config);
  let quality = evaluateQuality(input, workingDraft, currentIntent, similarity, options.config);

  if (currentIntent.keyword_intent_mismatch) {
    stageTrace.push(trace('SimilarityGuard', similarity.risk === 'LOW' ? 'PASS' : 'REWRITE', similarity.matched_patterns));
    stageTrace.push(trace('QualityGate', 'BLOCK', ['BLOCK_KEYWORD_BODY_MISMATCH']));
    stageTrace.push(trace('PublishGuard', 'BLOCK', ['BLOCK_KEYWORD_BODY_MISMATCH']));
    stageTrace.push(trace('ExposureMonitor', 'SKIP', ['NOT_PUBLISHED']));
    return buildBlockedResult({
      policyInput: input,
      draft: workingDraft,
      config: options.config,
      intent: currentIntent,
      plan,
      similarity,
      quality,
      reasons: [...manualReviewReasons, 'BLOCK_KEYWORD_BODY_MISMATCH'],
      rewriteCount,
      stageTrace,
      promptVersion,
      modelVersion,
    });
  }

  if (hasSourceCopySignal(similarity)) {
    stageTrace.push(trace('SimilarityGuard', 'BLOCK', similarity.matched_patterns));
    stageTrace.push(trace('QualityGate', 'BLOCK', ['copied_or_lightly_paraphrased_source']));
    stageTrace.push(trace('PublishGuard', 'BLOCK', ['BLOCK_COPIED_SOURCE']));
    stageTrace.push(trace('ExposureMonitor', 'SKIP', ['NOT_PUBLISHED']));
    return buildBlockedResult({
      policyInput: input,
      draft: workingDraft,
      config: options.config,
      intent: currentIntent,
      plan,
      similarity,
      quality,
      reasons: [...manualReviewReasons, 'BLOCK_COPIED_SOURCE'],
      rewriteCount,
      stageTrace,
      promptVersion,
      modelVersion,
    });
  }

  let reasons = rewriteReasons(similarity, quality, options.config);
  while ((similarity.risk !== 'LOW' || !passesQualityGate(quality, options.config))
    && rewriteCount < options.config.similarity.rewrite_limit) {
    rewriteCount += 1;
    workingDraft = options.rewriteDraft
      ? await options.rewriteDraft({
        draft: cloneDraft(workingDraft),
        input,
        intent: currentIntent,
        uniquenessPlan: plan,
        similarity,
        quality,
        reasons,
        attempt: rewriteCount,
      })
      : internalRewrite(workingDraft, input, plan, reasons, rewriteCount, quality);
    currentIntent = analyzeSearchIntent(input, workingDraft);
    similarity = await analyzeSimilarity(input, workingDraft, options.config);
    quality = evaluateQuality(input, workingDraft, currentIntent, similarity, options.config);
    reasons = rewriteReasons(similarity, quality, options.config);
    if (currentIntent.keyword_intent_mismatch || hasSourceCopySignal(similarity)) break;
  }

  const similarityPassed = !hasSourceCopySignal(similarity) && similarity.risk === 'LOW';
  const qualitySafetyPassed = passesQualitySafetyGate(quality);
  const qualityBelowTarget = quality.total_score < options.config.quality_gate.pass_score;
  const passed = !currentIntent.keyword_intent_mismatch
    && similarityPassed
    && qualitySafetyPassed;
  stageTrace.push(trace(
    'SimilarityGuard',
    similarityPassed ? 'PASS' : 'BLOCK',
    similarity.matched_patterns,
  ));
  stageTrace.push(trace(
    'QualityGate',
    qualitySafetyPassed ? 'PASS' : 'BLOCK',
    qualitySafetyPassed && qualityBelowTarget
      ? ['QUALITY_SCORE_BELOW_TARGET_ACCEPTED']
      : quality.fatal_errors,
  ));

  if (!passed) {
    const blockReasons = [
      ...manualReviewReasons,
      ...(currentIntent.keyword_intent_mismatch ? ['BLOCK_KEYWORD_BODY_MISMATCH'] : []),
      ...(hasSourceCopySignal(similarity) ? ['BLOCK_COPIED_SOURCE'] : []),
      ...(similarity.risk !== 'LOW' ? ['BLOCK_EXCESSIVE_SIMILARITY'] : []),
      ...quality.fatal_errors.map((reason) => `BLOCK_${reason.toUpperCase()}`),
    ];
    stageTrace.push(trace('PublishGuard', 'BLOCK', blockReasons));
    stageTrace.push(trace('ExposureMonitor', 'SKIP', ['NOT_PUBLISHED']));
    return buildBlockedResult({
      policyInput: input,
      draft: workingDraft,
      config: options.config,
      intent: currentIntent,
      plan,
      similarity,
      quality,
      reasons: blockReasons,
      rewriteCount,
      stageTrace,
      promptVersion,
      modelVersion,
    });
  }

  if (manualReviewReasons.length > 0) {
    stageTrace.push(trace('PublishGuard', 'BLOCK', manualReviewReasons));
    stageTrace.push(trace('ExposureMonitor', 'SKIP', ['MANUAL_REVIEW_REQUIRED']));
    return buildBlockedResult({
      policyInput: input,
      draft: workingDraft,
      config: options.config,
      intent: currentIntent,
      plan,
      similarity,
      quality,
      reasons: manualReviewReasons,
      rewriteCount,
      stageTrace,
      promptVersion,
      modelVersion,
    });
  }

  stageTrace.push(trace('PublishGuard', 'PASS'));
  stageTrace.push(trace('ExposureMonitor', 'SKIP', ['PENDING_PUBLICATION']));
  return {
    decision: 'PASS',
    block_reasons: [],
    intent: currentIntent,
    uniqueness_plan: plan,
    article: {
      title: workingDraft.title,
      summary: workingDraft.summary,
      introduction: workingDraft.introduction,
      headings: workingDraft.headings.map((heading) => ({ ...heading })),
      body_markdown: workingDraft.body_markdown,
      faq: workingDraft.faq.map((item) => ({ ...item })),
      cta: workingDraft.cta,
    },
    quality_report: quality,
    similarity_report: similarity,
    publication: {
      allowed: true,
      template_id: input.template_id || plan.structure_type,
      monitor_required: true,
      manual_review_required: false,
    },
    rewrite_count: rewriteCount,
    policy_version: String(options.config.version),
    prompt_version: promptVersion,
    model_version: modelVersion,
    input_hash: hashPolicyInput(input),
    stage_trace: stageTrace,
  };
}
