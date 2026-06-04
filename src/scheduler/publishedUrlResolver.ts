import { isConcreteNaverBlogPostUrl, isNaverBlogUrl, isNaverEditorUrl } from '../automation/publishOutcomeResolver.js';

export interface AutomationPublishResult {
  success?: boolean;
  url?: string | null;
}

function normalizeUrlCandidate(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isSameUrl(left: string, right: string): boolean {
  return stripTrailingSlash(left).toLowerCase() === stripTrailingSlash(right).toLowerCase();
}

export function resolvePublishedUrl(
  runResult: AutomationPublishResult | null | undefined,
  getPublishedUrl: () => string | null | undefined,
  fallbackBlogHomeUrl: string,
): string {
  const candidates = [
    runResult?.url,
    getPublishedUrl(),
    fallbackBlogHomeUrl,
  ].map(normalizeUrlCandidate).filter((value): value is string => Boolean(value));

  const concretePostUrl = candidates.find((candidate) =>
    isConcreteNaverBlogPostUrl(candidate) && !isSameUrl(candidate, fallbackBlogHomeUrl)
  );
  if (concretePostUrl) {
    return concretePostUrl;
  }

  const meaningfulBlogUrl = candidates.find((candidate) =>
    isNaverBlogUrl(candidate) &&
    !isNaverEditorUrl(candidate) &&
    !isSameUrl(candidate, fallbackBlogHomeUrl)
  );
  if (meaningfulBlogUrl) {
    return meaningfulBlogUrl;
  }

  return fallbackBlogHomeUrl;
}
