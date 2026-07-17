import { runContentPolicyPipeline } from './orchestrator.js';
import {
  acceptContentPolicyAdvisories,
  repairDeclaredForbiddenClaims,
} from './claimRepair.js';
import type {
  ArticleDraft,
  ContentPolicyConfig,
  ContentPolicyInput,
  ContentPolicyResult,
  RecentPostsLoadResult,
} from './types.js';

export interface GeneratedContentGuardOptions<T extends Record<string, any>> {
  structuredContent: T;
  input: ContentPolicyInput;
  config: ContentPolicyConfig;
  recentPostsResult: RecentPostsLoadResult;
  modelVersion?: string;
}

export interface GeneratedContentGuardResult<T extends Record<string, any>> {
  allowed: boolean;
  manualReviewRequired: boolean;
  reasons: string[];
  advisoryReasons: string[];
  content: T;
  policyResult: ContentPolicyResult;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toDraft(content: Record<string, any>): ArticleDraft {
  const headings = Array.isArray(content.headings)
    ? content.headings.map((heading: unknown) => {
      const record = heading && typeof heading === 'object' ? heading as Record<string, unknown> : {};
      return {
        title: text(record.title || record.heading),
        content: text(record.content || record.body || record.summary),
      };
    }).filter((heading: { title: string; content: string }) => heading.title || heading.content)
    : [];
  const introduction = text(content.introduction);
  const conclusion = text(content.conclusion);
  const assembledBody = [
    introduction,
    ...headings.flatMap((heading: { title: string; content: string }) => [
      heading.title ? `## ${heading.title}` : '',
      heading.content,
    ]),
    conclusion,
  ].filter(Boolean).join('\n\n');
  const faq = Array.isArray(content.faq)
    ? content.faq.map((item: unknown) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { question: text(record.question), answer: text(record.answer) };
    }).filter((item: { question: string; answer: string }) => item.question || item.answer)
    : [];

  return {
    title: text(content.selectedTitle || content.title),
    summary: text(content.summary),
    introduction: introduction || assembledBody.split(/\n\s*\n/u).find(Boolean) || '',
    headings,
    body_markdown: text(content.bodyPlain || content.content) || assembledBody,
    faq,
    cta: text(content.cta),
    source_ids: Array.isArray(content.source_ids)
      ? content.source_ids.map(text).filter(Boolean)
      : undefined,
  };
}

function applyResult<T extends Record<string, any>>(
  content: T,
  result: ContentPolicyResult,
  advisoryReasons: readonly string[],
): T {
  const next: Record<string, any> = {
    ...content,
    contentPolicy: result,
  };
  if (advisoryReasons.length > 0) {
    const currentQuality = content.quality && typeof content.quality === 'object'
      ? content.quality
      : {};
    const currentWarnings = Array.isArray(currentQuality.warnings)
      ? currentQuality.warnings.map(String)
      : [];
    next.quality = {
      ...currentQuality,
      warnings: [...new Set([
        ...currentWarnings,
        ...advisoryReasons.map((reason) => `[콘텐츠 정책 경고] ${reason}`),
      ])],
    };
  }
  if (result.rewrite_count > 0) {
    next.selectedTitle = result.article.title;
    next.summary = result.article.summary;
    next.introduction = result.article.introduction;
    next.headings = result.article.headings?.map((heading) => ({ ...heading })) || next.headings;
    next.bodyPlain = result.article.body_markdown;
    next.content = result.article.body_markdown;
    next.faq = result.article.faq.map((item) => ({ ...item }));
    next.cta = result.article.cta;
  }
  return next as T;
}

export async function guardGeneratedContent<T extends Record<string, any>>(
  options: GeneratedContentGuardOptions<T>,
): Promise<GeneratedContentGuardResult<T>> {
  const declaredClaimRepair = repairDeclaredForbiddenClaims(
    toDraft(options.structuredContent),
    options.input,
  );
  const evaluatedPolicyResult = await runContentPolicyPipeline({
    input: options.input,
    draft: declaredClaimRepair.draft,
    config: options.config,
    recentPostsResult: options.recentPostsResult,
    modelVersion: options.modelVersion || 'generated-content-post-guard',
  });
  const advisory = acceptContentPolicyAdvisories(
    evaluatedPolicyResult,
    options.input,
    declaredClaimRepair.advisoryReasons,
    declaredClaimRepair.rewriteCount,
  );
  const policyResult = advisory.policyResult;
  const advisoryReasons = [...new Set([
    ...advisory.advisoryReasons,
    ...policyResult.block_reasons,
    ...(policyResult.manual_review?.reasons || []),
  ])];
  const hardReasons = [...policyResult.block_reasons];

  return {
    // Content quality diagnostics have already been converted to advisories by
    // acceptContentPolicyAdvisories.  The remaining reasons are structural
    // impossibilities only (currently an empty draft), so keep this boundary
    // explicit instead of accidentally allowing image/publish work to proceed.
    allowed: hardReasons.length === 0,
    manualReviewRequired: policyResult.publication.manual_review_required,
    reasons: hardReasons,
    advisoryReasons,
    content: applyResult(options.structuredContent, policyResult, advisoryReasons),
    policyResult,
  };
}
