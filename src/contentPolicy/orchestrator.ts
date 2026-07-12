import { createHash } from 'crypto';
import { generateDraft } from './draftGenerator.js';
import { validatePolicyInput } from './inputValidator.js';
import { generateOutline } from './outlineGenerator.js';
import { evaluateQuality, passesQualityGate } from './qualityGate.js';
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

function internalRewrite(
  draft: ArticleDraft,
  input: ContentPolicyInput,
  plan: UniquenessPlan,
  reasons: readonly string[],
  attempt: number,
): ArticleDraft {
  const original = cloneDraft(draft);
  const directFact = input.business_facts[attempt % Math.max(1, input.business_facts.length)] || '';
  const directIntro = directFact
    ? `${input.primary_keyword}에서 먼저 확인할 핵심은 ${directFact}`
    : `${input.primary_keyword}에 대한 핵심 판단 기준부터 확인합니다.`;
  let body = original.body_markdown;
  if (original.introduction && body.includes(original.introduction)) {
    body = body.replace(original.introduction, directIntro);
  } else {
    body = `${directIntro}\n\n${body}`.trim();
  }

  let headings = original.headings;
  if (reasons.some((reason) => reason.includes('HEADING') || reason.includes('STRUCTURE')) && headings.length > 1) {
    const offset = attempt % headings.length;
    headings = [...headings.slice(offset), ...headings.slice(0, offset)];
    body = [directIntro, ...headings.flatMap((heading) => [`## ${heading.title}`, heading.content])].join('\n\n');
  }

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
  return {
    decision: 'BLOCK',
    block_reasons: uniqueReasons,
    intent: input.intent,
    uniqueness_plan: input.plan,
    article: {
      title: input.draft.title,
      summary: input.draft.summary,
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
  stageTrace.push(trace('InputValidator', inputReasons.length === 0 ? 'PASS' : 'BLOCK', inputReasons));

  const intent = analyzeSearchIntent(input, draft);
  stageTrace.push(trace(
    'SearchIntentAnalyzer',
    intent.keyword_intent_mismatch ? 'BLOCK' : 'PASS',
    intent.mismatch_reasons,
  ));
  const plan = buildUniquenessPlan(input, intent, options.config);
  stageTrace.push(trace('TopicDiversifier', 'PASS', plan.difference_from_recent_posts));

  if (inputReasons.length > 0) {
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
      reasons: ['BLOCK_KEYWORD_BODY_MISMATCH'],
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
      reasons: ['BLOCK_COPIED_SOURCE'],
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
      : internalRewrite(workingDraft, input, plan, reasons, rewriteCount);
    currentIntent = analyzeSearchIntent(input, workingDraft);
    similarity = await analyzeSimilarity(input, workingDraft, options.config);
    quality = evaluateQuality(input, workingDraft, currentIntent, similarity, options.config);
    reasons = rewriteReasons(similarity, quality, options.config);
    if (currentIntent.keyword_intent_mismatch || hasSourceCopySignal(similarity)) break;
  }

  const passed = !currentIntent.keyword_intent_mismatch
    && !hasSourceCopySignal(similarity)
    && similarity.risk === 'LOW'
    && passesQualityGate(quality, options.config);
  stageTrace.push(trace('SimilarityGuard', passed ? 'PASS' : 'BLOCK', similarity.matched_patterns));
  stageTrace.push(trace('QualityGate', passed ? 'PASS' : 'BLOCK', quality.fatal_errors));

  if (!passed) {
    const blockReasons = [
      ...(currentIntent.keyword_intent_mismatch ? ['BLOCK_KEYWORD_BODY_MISMATCH'] : []),
      ...(hasSourceCopySignal(similarity) ? ['BLOCK_COPIED_SOURCE'] : []),
      ...(similarity.risk !== 'LOW' ? ['BLOCK_EXCESSIVE_SIMILARITY'] : []),
      ...quality.fatal_errors.map((reason) => `BLOCK_${reason.toUpperCase()}`),
      ...(quality.total_score < options.config.quality_gate.pass_score ? ['BLOCK_QUALITY_SCORE'] : []),
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
