import { normalizeText } from './textMetrics.js';
import type { ArticleDraft, ContentPolicyInput } from './types.js';

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
  const fact = input.business_facts.map((item) => item.trim()).find(Boolean);
  return fact
    ? `${input.primary_keyword}에서 확인된 핵심 정보는 ${fact}`
    : `${input.primary_keyword}의 세부 조건은 공식 안내에서 최신 내용을 확인해 주세요.`;
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
      || `${input.primary_keyword} 확인 사항 ${index + 1}`,
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
