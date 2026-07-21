import { ContentPolicyAuditStore } from './auditStore.js';
import { ensureTrackedPublishedPost } from '../analytics/publishedPostTracker.js';
import { extractNaverBlogPostIdentity } from '../automation/publishOutcomeResolver.js';
import { resolveScheduledPublishAt } from '../scheduler/appScheduleQueue.js';
import { runContentPolicyPipeline } from './orchestrator.js';
import {
  approveRecentPostManualReview,
  isOnlyRecentPostManualReviewReasons,
  recentPostManualReviewReasons,
} from './manualReview.js';
import { loadContentPolicy } from './policyLoader.js';
import { PublicationStateStore } from './publicationStateStore.js';
import { evaluatePublishGuard, partitionPublishGuardReasons } from './publishGuard.js';
import {
  acceptContentPolicyAdvisories,
  repairDeclaredForbiddenClaims,
} from './claimRepair.js';
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
  scheduleDate?: string;
  scheduleTime?: string;
  scheduleType?: 'app-schedule' | 'naver-server';
  contentMode?: string;
  postId?: string;
  generator?: string;
  geminiModel?: string;
  businessInfo?: Record<string, unknown>;
  contentPolicyContext?: ContentPolicyPayloadContext;
  _semiAutoMode?: boolean;
  _publishFlow?: PublishFlow;
  _contentPolicyManualReviewApproved?: boolean;
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
  advisoryReasons: string[];
  manualReviewRequired: boolean;
  manualReviewReasons: string[];
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
    manual_review: result.manual_review
      ? {
        ...result.manual_review,
        reasons: [...result.manual_review.reasons],
      }
      : undefined,
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
  if (stored.ok && stored.posts.length > 0) return stored;
  if (context?.recentPostsResult?.ok) {
    return {
      ...context.recentPostsResult,
      posts: context.recentPostsResult.posts.map((post) => ({
        ...post,
        headings: [...post.headings],
      })),
    };
  }
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
  if (result.rewrite_count > 0) {
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
    title: result.rewrite_count > 0 ? result.article.title : payload.title,
    content: result.rewrite_count > 0 ? result.article.body_markdown : payload.content,
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
  const knownArticleId = stringValue(payload.postId);
  const excludeOwnScheduledReservation = payload.publishMode === 'schedule'
    || payload._publishFlow === 'app_scheduler';
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
      ? recentPostsResult.posts
        .filter((post) => !excludeOwnScheduledReservation
          || !knownArticleId
          || post.article_id !== knownArticleId)
        .map((post) => ({ ...post, headings: [...post.headings] }))
      : undefined,
    account_id: reconciledInput.account_id || stringValue(payload.accountId || payload.naverId) || undefined,
    blog_id: reconciledInput.blog_id || stringValue(payload.naverId) || undefined,
  };
  const declaredClaimRepair = repairDeclaredForbiddenClaims(draft, effectiveInput);
  let policyResult = await runContentPolicyPipeline({
    input: effectiveInput,
    draft: declaredClaimRepair.draft,
    config,
    recentPostsResult,
    modelVersion: stringValue(payload.geminiModel || payload.generator) || 'existing-draft-adapter',
  });
  if (payload._contentPolicyManualReviewApproved === true) {
    policyResult = approveRecentPostManualReview(policyResult, now.toISOString());
  }
  const advisory = acceptContentPolicyAdvisories(
    policyResult,
    effectiveInput,
    declaredClaimRepair.advisoryReasons,
    declaredClaimRepair.rewriteCount,
  );
  policyResult = advisory.policyResult;
  const policyAdvisoryReasons = [...new Set([
    ...advisory.advisoryReasons,
    ...policyResult.block_reasons,
    ...(policyResult.manual_review?.reasons || []),
  ])];
  const articleId = stringValue(payload.postId) || `policy-${policyResult.input_hash.slice(0, 20)}`;

  let guardReasons: string[] = [];
  let guardAdvisoryReasons: string[] = [];
  try {
    const state = await stateStore.load();
    const stateAdvisoryReasons = state.last_advisory_reason
      ? [`ADVISORY_BACKGROUND_POLICY:${state.last_advisory_reason}`]
      : [];
    const scheduledAt = payload.publishMode === 'schedule'
      ? resolveScheduledPublishAt(payload.scheduleDate, payload.scheduleTime)
      : null;
    if (payload.publishMode === 'schedule' && !scheduledAt) {
      guardReasons = ['BLOCK_INVALID_SCHEDULE_DATE'];
      policyResult = blockForStorageFailure(policyResult, ...guardReasons);
    } else {
      const guard = evaluatePublishGuard({
      policyResult,
      state,
      accountId: effectiveInput.account_id || 'default-account',
      now: scheduledAt?.date || now,
      config,
      env: options.env,
      enforceCadence: payload.publishMode !== 'draft',
      currentArticleId: articleId,
      excludeCurrentArticle: excludeOwnScheduledReservation,
      });
      const guardDisposition = partitionPublishGuardReasons(guard.reasons);
      guardReasons = [...guardDisposition.blockingReasons];
      guardAdvisoryReasons = [
        ...stateAdvisoryReasons,
        ...guardDisposition.advisoryReasons,
      ];
      if (guardReasons.length > 0) {
        policyResult = blockForStorageFailure(policyResult, ...guardReasons);
      }
    }
  } catch {
    guardReasons = ['BLOCK_PUBLICATION_STATE_UNAVAILABLE'];
    policyResult = blockForStorageFailure(policyResult, guardReasons[0]);
  }

  try {
    await auditStore.append(auditRecord(articleId, effectiveInput, policyResult, now.toISOString()));
  } catch {
    policyResult = blockForStorageFailure(policyResult, 'BLOCK_AUDIT_LOG_UNAVAILABLE');
  }

  const preparedPayload = applyResultToPayload(payload, policyResult, effectiveInput);
  const finalReasons = [...new Set([...guardReasons])];
  const finalAdvisoryReasons = [...new Set([
    ...policyAdvisoryReasons,
    ...guardAdvisoryReasons,
  ])];
  return {
    allowed: guardReasons.length === 0,
    reasons: finalReasons,
    advisoryReasons: finalAdvisoryReasons,
    manualReviewRequired: policyResult.publication.manual_review_required
      || isOnlyRecentPostManualReviewReasons(policyAdvisoryReasons),
    manualReviewReasons: recentPostManualReviewReasons(finalReasons),
    articleId,
    policyResult,
    payload: preparedPayload,
  };
}

export interface ContentPolicyRecordResult {
  advisoryReasons: string[];
}

async function persistPolicyRecordAdvisories(
  stateStore: PublicationStateStore,
  reasons: readonly string[],
): Promise<void> {
  if (reasons.length === 0) return;
  const reason = [...new Set(reasons)].join(',');
  try {
    await stateStore.recordAdvisory(reason);
  } catch (error) {
    console.warn(`[ContentPolicy] Failed to persist post-publish advisory: ${(error as Error).message}`);
  }
}

export async function recordContentPolicyPublication(input: {
  userDataPath: string;
  articleId: string;
  accountId: string;
  payload: ContentPolicyPayload;
  policyResult: ContentPolicyResult;
  publishedUrl?: string;
  publishedAt?: Date;
}): Promise<ContentPolicyRecordResult> {
  const publishedAt = input.publishedAt || new Date();
  const draft = draftFromPayload(input.payload);
  const publishedUrl = stringValue(input.publishedUrl);
  const identity = extractNaverBlogPostIdentity(publishedUrl);
  const advisoryReasons: string[] = [];
  const quality = input.policyResult.quality_report;
  if (identity) {
    const tracked = ensureTrackedPublishedPost(input.userDataPath, {
      publishedAt: publishedAt.toISOString(),
      keyword: input.payload.contentPolicyContext?.input.primary_keyword || draft.title,
      mode: stringValue(input.payload.contentMode) || 'seo',
      blogId: identity.blogId,
      logNo: identity.logNo,
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
    if (!tracked.ok) advisoryReasons.push('POLICY_EXPOSURE_QUEUE_WRITE_FAILED');
  } else {
    advisoryReasons.push('POLICY_EXPOSURE_TARGET_INVALID');
  }

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
  // The cadence/day-cap ledger is the enforcement record. Persist it first and
  // keep this write fail-closed so a real Naver publish cannot become invisible
  // to the next unattended run.
  await stateStore.recordPublication({
    article_id: input.articleId,
    account_id: input.accountId,
    published_at: publishedAt.toISOString(),
    template_id: input.policyResult.publication.template_id,
    structure_type: input.policyResult.uniqueness_plan.structure_type,
    topic_angle: input.policyResult.uniqueness_plan.topic_angle,
    exposure_status: 'PENDING_INDEX',
  });
  // [v2.11.136] 유사도 저장 실패는 중복발행과 무관하다(enforcement 원장은 위
  // recordPublication이 이미 fail-closed로 담당). prepare 경로는 이미 fail-open
  // 인데 이 record만 throw해 BlogExecutor의 integrity pauseAll을 유발하던 비대칭을
  // 해소한다 — 실패는 advisory로 강등하고 발행 흐름은 유지한다.
  try {
    await repository.record(recentPost);
  } catch (recentPostError) {
    console.warn(`[PolicyService] ⚠️ 유사도 저장소 기록 실패 → advisory 강등(발행 계속): ${(recentPostError as Error).message}`);
    await stateStore.recordAdvisory('POLICY_RECENT_POSTS_WRITE_FAILED').catch(() => undefined);
  }
  try {
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
  } catch (error) {
    advisoryReasons.push('POLICY_AUDIT_LOG_WRITE_FAILED');
    console.warn(`[ContentPolicy] Audit record failed after core ledger write: ${(error as Error).message}`);
  }

  const uniqueAdvisories = [...new Set(advisoryReasons)];
  await persistPolicyRecordAdvisories(stateStore, uniqueAdvisories);
  return { advisoryReasons: uniqueAdvisories };
}

export async function recordContentPolicyReservation(input: {
  userDataPath: string;
  articleId: string;
  accountId: string;
  payload: ContentPolicyPayload;
  policyResult: ContentPolicyResult;
  scheduledAt: Date;
}): Promise<ContentPolicyRecordResult> {
  if (!(input.scheduledAt instanceof Date) || !Number.isFinite(input.scheduledAt.getTime())) {
    throw new Error('POLICY_RESERVATION_DATE_INVALID');
  }
  const draft = draftFromPayload(input.payload);
  const repository = new RecentPostsRepository(input.userDataPath);
  const stateStore = new PublicationStateStore(input.userDataPath);
  const auditStore = new ContentPolicyAuditStore(input.userDataPath);
  const scheduledAt = input.scheduledAt.toISOString();

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
    published_at: scheduledAt,
    exposure_status: 'PENDING_INDEX',
    template_id: input.policyResult.publication.template_id,
  };
  const advisoryReasons: string[] = [];

  // As with immediate publishing, the enforcement ledger is the only critical
  // local write. Similarity/audit stores remain observable but advisory.
  await stateStore.recordPublication({
    article_id: input.articleId,
    account_id: input.accountId,
    published_at: scheduledAt,
    template_id: input.policyResult.publication.template_id,
    structure_type: input.policyResult.uniqueness_plan.structure_type,
    topic_angle: input.policyResult.uniqueness_plan.topic_angle,
    exposure_status: 'PENDING_INDEX',
  });
  await repository.record(recentPost);
  try {
    await auditStore.append({
      ...auditRecord(
        input.articleId,
        input.payload.contentPolicyContext?.input || fallbackInput(input.payload, draft),
        input.policyResult,
        new Date().toISOString(),
      ),
      publish_time: scheduledAt,
      exposure_status: 'PENDING_INDEX',
      exposure_checks: [],
    });
  } catch (error) {
    advisoryReasons.push('POLICY_AUDIT_LOG_WRITE_FAILED');
    console.warn(`[ContentPolicy] Scheduled audit record failed after core ledger write: ${(error as Error).message}`);
  }

  const uniqueAdvisories = [...new Set(advisoryReasons)];
  await persistPolicyRecordAdvisories(stateStore, uniqueAdvisories);
  return { advisoryReasons: uniqueAdvisories };
}
