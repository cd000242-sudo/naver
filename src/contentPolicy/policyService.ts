import { ContentPolicyAuditStore } from './auditStore.js';
import { ensureTrackedPublishedPost } from '../analytics/publishedPostTracker.js';
import { runContentPolicyPipeline } from './orchestrator.js';
import { loadContentPolicy } from './policyLoader.js';
import { PublicationStateStore } from './publicationStateStore.js';
import { evaluatePublishGuard } from './publishGuard.js';
import { reconcilePublishPolicyInput } from './publishInputReconciler.js';
import { RecentPostsRepository } from './recentPostsRepository.js';
import type {
  ArticleDraft,
  AuditRecord,
  ContentPolicyInput,
  ContentPolicyResult,
  RecentPostRecord,
  RecentPostsLoadResult,
} from './types.js';

export interface ContentPolicyPayloadContext {
  input: ContentPolicyInput;
  recentPostsSnapshot?: RecentPostRecord[];
  recentPostsResult?: RecentPostsLoadResult;
}

export type PublishFlow =
  | 'direct'
  | 'legacy_form'
  | 'semi_auto'
  | 'full_auto'
  | 'continuous'
  | 'multi_account'
  | 'app_scheduler'
  | 'smart_scheduler';

export interface ContentPolicyPayload {
  naverId?: string;
  accountId?: string;
  title?: string;
  content?: string;
  ctaText?: string;
  keywords?: string | string[];
  structuredContent?: Record<string, any>;
  publishMode?: 'draft' | 'publish' | 'schedule';
  contentMode?: string;
  postId?: string;
  generator?: string;
  geminiModel?: string;
  businessInfo?: Record<string, unknown>;
  contentPolicyContext?: ContentPolicyPayloadContext;
  _semiAutoMode?: boolean;
  _publishFlow?: PublishFlow;
}

export interface PrepareContentPolicyOptions {
  userDataPath: string;
  env?: Readonly<Record<string, string | undefined>>;
  now?: Date;
  policyPath?: string;
}

export interface PreparedContentPolicyPublish<T extends ContentPolicyPayload = ContentPolicyPayload> {
  allowed: boolean;
  reasons: string[];
  articleId: string;
  policyResult: ContentPolicyResult;
  payload: T;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  return typeof value === 'string'
    ? value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
    : [];
}

function headingModels(value: unknown): Array<{ title: string; content: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((heading) => {
    if (typeof heading === 'string') return { title: heading.trim(), content: '' };
    const record = heading && typeof heading === 'object' ? heading as Record<string, unknown> : {};
    return {
      title: stringValue(record.title || record.heading),
      content: stringValue(record.content || record.body || record.summary),
    };
  }).filter((heading) => heading.title || heading.content);
}

function draftFromPayload(payload: ContentPolicyPayload): ArticleDraft {
  const structured = payload.structuredContent || {};
  const title = stringValue(structured.selectedTitle || structured.title || payload.title);
  const body = stringValue(structured.bodyPlain || structured.content || payload.content);
  const headings = headingModels(structured.headings);
  const introduction = stringValue(structured.introduction)
    || body.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean)
    || '';
  const faq = Array.isArray(structured.faq)
    ? structured.faq.map((item: unknown) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { question: stringValue(record.question), answer: stringValue(record.answer) };
    }).filter((item: { question: string; answer: string }) => item.question || item.answer)
    : [];
  return {
    title,
    summary: stringValue(structured.summary),
    introduction,
    headings,
    body_markdown: body,
    faq,
    cta: stringValue(structured.cta || payload.ctaText),
    source_ids: stringArray(structured.source_ids || structured.sourceIds),
  };
}

function fallbackInput(payload: ContentPolicyPayload, draft: ArticleDraft): ContentPolicyInput {
  const payloadKeywords = stringArray((payload as Record<string, unknown>).keywords);
  return {
    input_origin: 'final_draft_payload',
    business_facts_applicable: payload.contentMode === 'business' || payload.contentMode === 'affiliate',
    primary_keyword: payloadKeywords[0] || draft.title,
    target_reader: '최종 원고의 주제를 확인하는 독자',
    business_facts: ['발행 경계에서 최종 제목과 본문을 기준으로 원고를 다시 확인했다.'],
    recent_posts: undefined,
    related_questions: draft.faq.map((item) => item.question).filter(Boolean),
    template_id: stringValue(payload.structuredContent?.template_id || payload.structuredContent?.templateId)
      || 'legacy-unclassified',
    account_id: stringValue(payload.accountId || payload.naverId) || undefined,
    blog_id: stringValue(payload.naverId) || undefined,
  };
}

function auditRecord(
  articleId: string,
  input: ContentPolicyInput,
  result: ContentPolicyResult,
  createdAt: string,
): AuditRecord {
  return {
    article_id: articleId,
    primary_keyword: input.primary_keyword,
    primary_question: result.intent.primary_question,
    source_ids: (input.source_materials || [])
      .map((source) => source.source_id)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
    account_id: input.account_id,
    blog_id: input.blog_id,
    created_at: createdAt,
    input_hash: result.input_hash,
    selected_intent: [...result.intent.type],
    topic_angle: result.uniqueness_plan.topic_angle,
    structure_type: result.uniqueness_plan.structure_type,
    template_id: result.publication.template_id,
    similarity_scores: { ...result.similarity_report, matched_patterns: [...result.similarity_report.matched_patterns] },
    quality_score: result.quality_report.total_score,
    quality_scores: {
      ...result.quality_report,
      unsupported_claims: [...result.quality_report.unsupported_claims],
      fatal_errors: [...result.quality_report.fatal_errors],
    },
    unsupported_claims: [...result.quality_report.unsupported_claims],
    rewrite_count: result.rewrite_count,
    decision: result.decision,
    block_reasons: [...result.block_reasons],
    prompt_version: result.prompt_version,
    model_version: result.model_version,
    policy_version: result.policy_version,
  };
}

function blockForStorageFailure(result: ContentPolicyResult, ...reasons: string[]): ContentPolicyResult {
  const safeReasons = reasons.filter(Boolean);
  return {
    ...result,
    decision: 'BLOCK',
    block_reasons: [...new Set([...result.block_reasons, ...safeReasons])],
    publication: {
      ...result.publication,
      allowed: false,
      manual_review_required: true,
    },
    stage_trace: result.stage_trace.map((item) => item.stage === 'PublishGuard'
      ? { ...item, status: 'BLOCK', reasons: [...new Set([...item.reasons, ...safeReasons])] }
      : { ...item, reasons: [...item.reasons] }),
  };
}

async function resolveRecentPosts(
  repository: RecentPostsRepository,
  context: ContentPolicyPayloadContext | undefined,
): Promise<RecentPostsLoadResult> {
  const snapshot = context?.recentPostsSnapshot || [];
  if (snapshot.length > 0) {
    await repository.mergeSnapshot(snapshot);
  }
  const stored = await repository.loadRecentPosts(50);
  if (stored.ok) return stored;
  if (context?.recentPostsResult?.ok) return context.recentPostsResult;
  return stored;
}

function applyResultToPayload<T extends ContentPolicyPayload>(
  payload: T,
  result: ContentPolicyResult,
  effectiveInput: ContentPolicyInput,
): T {
  const structured: Record<string, any> = {
    ...(payload.structuredContent || {}),
    contentPolicy: result,
  };
  if (result.decision === 'PASS' && result.rewrite_count > 0) {
    structured.selectedTitle = result.article.title;
    structured.introduction = result.article.introduction;
    if (result.article.headings) {
      structured.headings = result.article.headings.map((heading) => ({ ...heading }));
    }
    structured.bodyPlain = result.article.body_markdown;
    structured.content = result.article.body_markdown;
    structured.summary = result.article.summary;
    structured.faq = result.article.faq.map((item) => ({ ...item }));
    structured.cta = result.article.cta;
  }
  return {
    ...payload,
    title: result.decision === 'PASS' && result.rewrite_count > 0 ? result.article.title : payload.title,
    content: result.decision === 'PASS' && result.rewrite_count > 0 ? result.article.body_markdown : payload.content,
    structuredContent: structured,
    contentPolicyContext: {
      ...(payload.contentPolicyContext || {}),
      input: {
        ...effectiveInput,
        business_facts: [...effectiveInput.business_facts],
        secondary_keywords: effectiveInput.secondary_keywords ? [...effectiveInput.secondary_keywords] : undefined,
        source_materials: effectiveInput.source_materials?.map((source) => ({ ...source })),
        related_questions: effectiveInput.related_questions ? [...effectiveInput.related_questions] : undefined,
        recent_posts: effectiveInput.recent_posts?.map((post) => ({ ...post, headings: [...post.headings] })),
      },
    },
  };
}

export async function prepareContentPolicyForPublish<T extends ContentPolicyPayload>(
  payload: T,
  options: PrepareContentPolicyOptions,
): Promise<PreparedContentPolicyPublish<T>> {
  const now = options.now || new Date();
  const repository = new RecentPostsRepository(options.userDataPath);
  const auditStore = new ContentPolicyAuditStore(options.userDataPath);
  const stateStore = new PublicationStateStore(options.userDataPath);
  const config = await loadContentPolicy(options.policyPath ? { policyPath: options.policyPath } : {});
  const draft = draftFromPayload(payload);
  const contextMissing = !payload.contentPolicyContext?.input;
  const baseInput = payload.contentPolicyContext?.input || fallbackInput(payload, draft);
  const reconciledInput = reconcilePublishPolicyInput(baseInput, draft, {
    semiAutoMode: payload._semiAutoMode === true,
    contextMissing,
  });

  let recentPostsResult: RecentPostsLoadResult;
  try {
    recentPostsResult = await resolveRecentPosts(repository, payload.contentPolicyContext);
  } catch (error) {
    recentPostsResult = {
      ok: false,
      code: 'RECENT_POSTS_CORRUPT',
      message: `Recent-post persistence failed: ${(error as Error).message}`,
    };
  }
  const effectiveInput: ContentPolicyInput = {
    ...reconciledInput,
    recent_posts: recentPostsResult.ok
      ? recentPostsResult.posts.map((post) => ({ ...post, headings: [...post.headings] }))
      : undefined,
    account_id: reconciledInput.account_id || stringValue(payload.accountId || payload.naverId) || undefined,
    blog_id: reconciledInput.blog_id || stringValue(payload.naverId) || undefined,
  };
  let policyResult = await runContentPolicyPipeline({
    input: effectiveInput,
    draft,
    config,
    recentPostsResult,
    modelVersion: stringValue(payload.geminiModel || payload.generator) || 'existing-draft-adapter',
  });
  const articleId = stringValue(payload.postId) || `policy-${policyResult.input_hash.slice(0, 20)}`;

  let guardReasons: string[] = [];
  if (policyResult.decision === 'PASS') {
    try {
      const state = await stateStore.load();
      const guard = evaluatePublishGuard({
        policyResult,
        state,
        accountId: effectiveInput.account_id || 'default-account',
        now,
        config,
        env: options.env,
        enforceCadence: payload.publishMode !== 'draft' && payload.publishMode !== 'schedule',
      });
      guardReasons = [...guard.reasons];
      if (!guard.allowed) policyResult = blockForStorageFailure(policyResult, ...guardReasons);
    } catch {
      guardReasons = ['BLOCK_PUBLICATION_STATE_UNAVAILABLE'];
      policyResult = blockForStorageFailure(policyResult, guardReasons[0]);
    }
  }

  try {
    await auditStore.append(auditRecord(articleId, effectiveInput, policyResult, now.toISOString()));
  } catch {
    policyResult = blockForStorageFailure(policyResult, 'BLOCK_AUDIT_LOG_UNAVAILABLE');
  }

  const preparedPayload = applyResultToPayload(payload, policyResult, effectiveInput);
  return {
    allowed: policyResult.decision === 'PASS' && policyResult.publication.allowed && guardReasons.length === 0,
    reasons: [...new Set([...policyResult.block_reasons, ...guardReasons])],
    articleId,
    policyResult,
    payload: preparedPayload,
  };
}

export async function recordContentPolicyPublication(input: {
  userDataPath: string;
  articleId: string;
  accountId: string;
  payload: ContentPolicyPayload;
  policyResult: ContentPolicyResult;
  publishedUrl?: string;
  publishedAt?: Date;
}): Promise<void> {
  const publishedAt = input.publishedAt || new Date();
  const draft = draftFromPayload(input.payload);
  const publishedUrl = stringValue(input.publishedUrl);
  const urlMatch = publishedUrl.match(/^https:\/\/blog\.naver\.com\/([^/?#]+)\/(\d+)(?:[/?#]|$)/i);
  if (!urlMatch) throw new Error('POLICY_EXPOSURE_TARGET_INVALID');
  const quality = input.policyResult.quality_report;
  const tracked = ensureTrackedPublishedPost(input.userDataPath, {
    publishedAt: publishedAt.toISOString(),
    keyword: input.payload.contentPolicyContext?.input.primary_keyword || draft.title,
    mode: stringValue(input.payload.contentMode) || 'seo',
    blogId: urlMatch[1],
    logNo: urlMatch[2],
    url: publishedUrl,
    title: draft.title,
    evaluator: {
      finalScore: quality.total_score,
      modeScore: Math.round((quality.intent_score / 30) * 60 + (quality.reader_value_score / 20) * 40),
      safetyScore: Math.round((quality.spam_safety_score / 5) * 100),
      humanlikeScore: Math.round((quality.readability_score / 10) * 100),
      decision: input.policyResult.decision.toLowerCase(),
      details: {
        originality: quality.originality_score,
        firstParty: quality.first_party_score,
        rewriteCount: input.policyResult.rewrite_count,
      },
    },
  });
  if (!tracked.ok) throw new Error('POLICY_EXPOSURE_QUEUE_WRITE_FAILED');

  const repository = new RecentPostsRepository(input.userDataPath);
  const stateStore = new PublicationStateStore(input.userDataPath);
  const auditStore = new ContentPolicyAuditStore(input.userDataPath);
  const recentPost: RecentPostRecord = {
    article_id: input.articleId,
    title: draft.title,
    intro: draft.introduction,
    headings: draft.headings.map((heading) => heading.title).filter(Boolean),
    body: draft.body_markdown,
    topic_angle: input.policyResult.uniqueness_plan.topic_angle,
    structure_type: input.policyResult.uniqueness_plan.structure_type,
    business_facts: [...(input.payload.contentPolicyContext?.input.business_facts || [])],
    related_questions: [...(input.payload.contentPolicyContext?.input.related_questions || [])],
    published_at: publishedAt.toISOString(),
    exposure_status: 'PENDING_INDEX',
    template_id: input.policyResult.publication.template_id,
    url: input.publishedUrl,
  };
  await repository.record(recentPost);
  await stateStore.recordPublication({
    article_id: input.articleId,
    account_id: input.accountId,
    published_at: publishedAt.toISOString(),
    template_id: input.policyResult.publication.template_id,
    structure_type: input.policyResult.uniqueness_plan.structure_type,
    topic_angle: input.policyResult.uniqueness_plan.topic_angle,
    exposure_status: 'PENDING_INDEX',
  });
  await auditStore.append({
    ...auditRecord(
      input.articleId,
      input.payload.contentPolicyContext?.input || fallbackInput(input.payload, draft),
      input.policyResult,
      publishedAt.toISOString(),
    ),
    publish_time: publishedAt.toISOString(),
    exposure_status: 'PENDING_INDEX',
    exposure_checks: [],
  });

}
