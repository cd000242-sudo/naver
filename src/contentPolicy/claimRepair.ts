import { normalizeText } from './textMetrics.js';
import type { ArticleDraft, ContentPolicyInput, ContentPolicyResult } from './types.js';

const SENTENCE_CHUNKS = /[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu;

function matchesUnsupportedClaim(value: string, normalizedClaims: readonly string[]): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return normalizedClaims.some((claim) => (
    normalized === claim
    || normalized.includes(claim)
    || (normalized.length >= Math.max(8, claim.length * 0.8) && claim.includes(normalized))
  ));
}

export function removeUnsupportedClaimSentences(
  value: string,
  unsupportedClaims: readonly string[],
): string {
  if (!value || unsupportedClaims.length === 0) return value;
  const normalizedClaims = unsupportedClaims.map(normalizeText).filter(Boolean);
  if (normalizedClaims.length === 0) return value;

  return value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '';
      const chunks = line.match(SENTENCE_CHUNKS) ?? [line];
      return chunks
        .filter((chunk) => !matchesUnsupportedClaim(chunk, normalizedClaims))
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .join(' ');
    })
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function fallbackIntroduction(input: ContentPolicyInput): string {
  const topic = input.primary_keyword
    .split(/[｜|\n\r]/u)
    .map((part) => part.trim())
    .find(Boolean)
    ?.slice(0, 60) || '이 주제';
  return `${topic} 정보를 확인할 때는 실제 조건과 공식 안내를 함께 살펴보는 것이 좋습니다. 아래에서 필요한 기준을 순서대로 정리합니다.`;
}

function fallbackHeadingTitle(index: number): string {
  const titles = [
    '핵심 내용부터 살펴보기',
    '적용 조건 확인하기',
    '확인 방법과 준비 과정',
    '주의할 점과 대안',
    '마지막으로 점검할 내용',
  ];
  return titles[index] || `추가로 살펴볼 내용 ${index - titles.length + 1}`;
}

export function repairUnsupportedClaims(
  draft: ArticleDraft,
  input: ContentPolicyInput,
  unsupportedClaims: readonly string[],
): ArticleDraft {
  if (unsupportedClaims.length === 0) {
    return {
      ...draft,
      headings: draft.headings.map((heading) => ({ ...heading })),
      faq: draft.faq.map((item) => ({ ...item })),
      source_ids: draft.source_ids ? [...draft.source_ids] : undefined,
    };
  }

  const fallbackIntro = fallbackIntroduction(input);
  const introduction = removeUnsupportedClaimSentences(draft.introduction, unsupportedClaims) || fallbackIntro;
  const headings = draft.headings.map((heading, index) => ({
    title: removeUnsupportedClaimSentences(heading.title, unsupportedClaims)
      || fallbackHeadingTitle(index),
    content: removeUnsupportedClaimSentences(heading.content, unsupportedClaims)
      || '세부 조건은 제공된 자료와 공식 판매 페이지에서 다시 확인해 주세요.',
  }));
  const bodyMarkdown = removeUnsupportedClaimSentences(draft.body_markdown, unsupportedClaims)
    || [introduction, ...headings.flatMap((heading) => [`## ${heading.title}`, heading.content])].join('\n\n');

  return {
    ...draft,
    title: removeUnsupportedClaimSentences(draft.title, unsupportedClaims)
      || `${input.primary_keyword} 확인 가이드`,
    summary: removeUnsupportedClaimSentences(draft.summary, unsupportedClaims)
      || '확인된 정보와 공식 안내를 기준으로 핵심 내용을 정리합니다.',
    introduction,
    headings,
    body_markdown: bodyMarkdown,
    faq: draft.faq.map((item) => ({
      question: removeUnsupportedClaimSentences(item.question, unsupportedClaims) || item.question,
      answer: removeUnsupportedClaimSentences(item.answer, unsupportedClaims)
        || '공식 안내에서 최신 조건을 확인해 주세요.',
    })),
    cta: removeUnsupportedClaimSentences(draft.cta, unsupportedClaims),
    source_ids: draft.source_ids ? [...draft.source_ids] : undefined,
  };
}

/**
 * A content-policy result reaches this adapter only after a draft exists.  The
 * customer-facing product treats editorial/policy diagnostics as visible
 * warnings, not an automatic publishing veto.  This deliberately uses a
 * small explicit hard-stop allowlist instead of an advisory allowlist: newly
 * introduced quality codes must not silently become a paid-generation or
 * publishing regression.
 *
 * Operational controls (paused account, invalid schedule, cadence, storage
 * state) are evaluated separately by publishGuard/policyService and never
 * pass through this content-only adapter.
 */
const HARD_CONTENT_PUBLICATION_REASONS = new Set([
  // There is nothing technically publishable.  This is not a quality choice.
  'BLOCK_EMPTY_DRAFT',
]);

function isHardContentPublicationReason(reason: string): boolean {
  return HARD_CONTENT_PUBLICATION_REASONS.has(reason);
}

function sameDraft(left: ArticleDraft, right: ArticleDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function draftFromPolicyResult(result: ContentPolicyResult): ArticleDraft {
  return {
    title: result.article.title,
    summary: result.article.summary,
    introduction: result.article.introduction || '',
    headings: (result.article.headings || []).map((heading) => ({ ...heading })),
    body_markdown: result.article.body_markdown,
    faq: result.article.faq.map((item) => ({ ...item })),
    cta: result.article.cta,
  };
}

export interface DeclaredClaimRepairResult {
  draft: ArticleDraft;
  advisoryReasons: string[];
  rewriteCount: number;
}

export function repairDeclaredForbiddenClaims(
  draft: ArticleDraft,
  input: ContentPolicyInput,
): DeclaredClaimRepairResult {
  const declaredClaims = (input.forbidden_claims || []).map((claim) => claim.trim()).filter(Boolean);
  const searchableDraft = normalizeText([
    draft.title,
    draft.summary,
    draft.introduction,
    draft.body_markdown,
    ...draft.headings.flatMap((heading) => [heading.title, heading.content]),
    ...draft.faq.flatMap((item) => [item.question, item.answer]),
    draft.cta,
  ].join('\n'));
  const matchingClaims = declaredClaims.filter((claim) => (
    searchableDraft.includes(normalizeText(claim))
  ));
  const repaired = repairUnsupportedClaims(draft, input, matchingClaims);
  const changed = !sameDraft(draft, repaired);
  return {
    draft: repaired,
    advisoryReasons: changed ? ['BLOCK_FORBIDDEN_CLAIM'] : [],
    rewriteCount: changed ? 1 : 0,
  };
}

export interface AdvisoryContentPolicyResult {
  policyResult: ContentPolicyResult;
  advisoryReasons: string[];
}

/**
 * Converts content-quality findings into diagnostics after deterministic repair.
 * Empty/unusable drafts remain blocked; operational publish guards run later and
 * remain fail-closed.
 */
export function acceptContentPolicyAdvisories(
  result: ContentPolicyResult,
  input: ContentPolicyInput,
  initialAdvisoryReasons: readonly string[] = [],
  initialRewriteCount = 0,
): AdvisoryContentPolicyResult {
  const resultDraft = draftFromPolicyResult(result);
  const repairedDraft = repairUnsupportedClaims(
    resultDraft,
    input,
    result.quality_report.unsupported_claims,
  );
  const repairedUnsupportedClaim = !sameDraft(resultDraft, repairedDraft);
  const hardReasons = result.block_reasons.filter(isHardContentPublicationReason);
  const contentAdvisories = result.block_reasons.filter((reason) => !isHardContentPublicationReason(reason));
  const advisoryReasons = [...new Set([
    ...initialAdvisoryReasons,
    ...contentAdvisories,
    ...(repairedUnsupportedClaim ? ['BLOCK_UNSUPPORTED_CLAIM'] : []),
  ])];
  const accepted = hardReasons.length === 0;
  const rewriteCount = result.rewrite_count
    + initialRewriteCount
    + (repairedUnsupportedClaim && result.rewrite_count === 0 ? 1 : 0);

  return {
    advisoryReasons,
    policyResult: {
      ...result,
      decision: accepted ? 'PASS' : 'BLOCK',
      block_reasons: accepted ? [] : [...hardReasons],
      manual_review: accepted && result.manual_review
        ? { ...result.manual_review, required: false, reasons: [] }
        : result.manual_review
          ? { ...result.manual_review, reasons: [...result.manual_review.reasons] }
          : undefined,
      article: {
        title: repairedDraft.title,
        summary: repairedDraft.summary,
        introduction: repairedDraft.introduction,
        headings: repairedDraft.headings.map((heading) => ({ ...heading })),
        body_markdown: repairedDraft.body_markdown,
        faq: repairedDraft.faq.map((item) => ({ ...item })),
        cta: repairedDraft.cta,
      },
      publication: {
        ...result.publication,
        allowed: accepted,
        manual_review_required: !accepted && result.publication.manual_review_required,
      },
      rewrite_count: rewriteCount,
      stage_trace: result.stage_trace.map((item) => ({
        ...item,
        status: accepted && item.status === 'BLOCK' ? 'REWRITE' : item.status,
        reasons: [...item.reasons],
      })),
    },
  };
}
