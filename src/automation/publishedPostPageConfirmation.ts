import { isConcreteNaverBlogPostUrl } from './publishOutcomeResolver.js';

export const PUBLISHED_POST_PAGE_SIGNAL_SELECTORS = [
  '#postViewArea',
  '.post-view',
  '.se-title-text',
  '.se-main-container',
  'article.se-components-wrap',
  '.area_sympathy',
  '[class*="sympathy"]',
  'a[class*="u_likeit"]',
  'meta[property="og:url"]',
  'meta[property="og:title"]',
] as const;

const BLOCKING_PHRASES = [
  '작성중인 글이 있습니다',
  '서비스를 찾을 수 없습니다',
  '유효하지 않은 요청',
  '존재하지 않는 게시물',
  '삭제되었거나',
  '비공개 게시물',
  '권한이 없습니다',
  '로그인이 필요합니다',
] as const;

const STRONG_SELECTORS = new Set<string>([
  '#postViewArea',
  '.post-view',
  '.se-title-text',
  'article.se-components-wrap',
  '.area_sympathy',
  '[class*="sympathy"]',
  'a[class*="u_likeit"]',
  'meta[property="og:url"]',
  'meta[property="og:title"]',
]);

export interface PublishedPostPageSnapshot {
  currentUrl: string;
  expectedUrl?: string | null;
  title?: string | null;
  bodyText?: string | null;
  selectorEvidence?: string[] | null;
}

export type PublishedPostPageConfirmation =
  | {
      ok: true;
      reason: 'POST_SCREEN_CONFIRMED' | 'POST_SCREEN_TEXT_FALLBACK';
      evidence: string[];
    }
  | {
      ok: false;
      code: 'PUBLISH_URL_NOT_CONCRETE' | 'PUBLISH_POST_SCREEN_BLOCKED' | 'PUBLISH_POST_SCREEN_NOT_READY';
      message: string;
      evidence: string[];
    };

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEvidence(value: string[] | null | undefined): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)));
}

export function resolvePublishedPostPageConfirmation(
  snapshot: PublishedPostPageSnapshot,
): PublishedPostPageConfirmation {
  const currentUrl = String(snapshot.currentUrl || '').trim();
  const expectedUrl = String(snapshot.expectedUrl || '').trim();
  const hasConcreteUrl = isConcreteNaverBlogPostUrl(currentUrl) || isConcreteNaverBlogPostUrl(expectedUrl);
  const evidence = normalizeEvidence(snapshot.selectorEvidence);
  const bodyText = normalizeText(snapshot.bodyText);
  const title = normalizeText(snapshot.title);
  const combinedText = `${title} ${bodyText}`.trim();

  if (!hasConcreteUrl) {
    return {
      ok: false,
      code: 'PUBLISH_URL_NOT_CONCRETE',
      message: `actual post URL was not confirmed (currentUrl=${currentUrl || '(none)'})`,
      evidence,
    };
  }

  const blockingPhrase = BLOCKING_PHRASES.find((phrase) => combinedText.includes(phrase));
  if (blockingPhrase) {
    return {
      ok: false,
      code: 'PUBLISH_POST_SCREEN_BLOCKED',
      message: `published URL opened a blocking/error screen (${blockingPhrase})`,
      evidence,
    };
  }

  const hasStrongSelector = evidence.some((selector) => STRONG_SELECTORS.has(selector));
  if (hasStrongSelector && bodyText.length >= 20) {
    return {
      ok: true,
      reason: 'POST_SCREEN_CONFIRMED',
      evidence,
    };
  }

  if (bodyText.length >= 80) {
    return {
      ok: true,
      reason: 'POST_SCREEN_TEXT_FALLBACK',
      evidence: evidence.length > 0 ? evidence : ['readable-body-text'],
    };
  }

  return {
    ok: false,
    code: 'PUBLISH_POST_SCREEN_NOT_READY',
    message: `published URL was detected but post screen was not readable yet (textLength=${bodyText.length}, evidence=${evidence.join(',') || 'none'})`,
    evidence,
  };
}
