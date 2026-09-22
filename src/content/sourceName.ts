// src/content/sourceName.ts
//
// [P1 relevance v2] Resolves a human-readable publisher/organization name and
// bare domain for a source document. Never invents a name — falls back to
// null (the renderer shows "(미확인)") instead of guessing from an
// unfamiliar domain. Domain -> name mapping is a small explicit table
// (publisherDomains.ts); no per-keyword or per-product rules.

import { extractHostname, type SourceKind } from './sourceDocument.js';
import { PUBLISHER_DOMAINS } from './publisherDomains.js';

export interface ResolveSourceNameInput {
  url: string;
  originalLink?: string;
  title?: string;
  sourceType?: SourceKind;
  /** A publisher name actually returned by an API (e.g. Naver news), when available. */
  apiPublisher?: string | null;
}

export interface ResolveSourceNameResult {
  sourceName: string | null;
  domain: string;
}

/** " - 연합뉴스" / " | 한국경제" / " · YTN" style trailing publisher tags on a news title. */
const TITLE_SUFFIX_RE = /[-|·│]\s*([가-힣A-Za-z0-9]{2,12})\s*$/;

/**
 * Only applied to news-typed items — a blog/cafe title ending in "- 티스토리"
 * is a CMS tag, not an outlet, so this heuristic would misfire there.
 */
function extractPublisherFromTitleSuffix(title: string | undefined, sourceType: SourceKind | undefined): string | null {
  if (sourceType !== 'news' || !title) return null;
  const match = TITLE_SUFFIX_RE.exec(title.trim());
  if (!match) return null;
  const candidate = match[1].trim();
  if (!candidate || /^\d+$/.test(candidate)) return null;
  return candidate;
}

/** Resolves {sourceName, domain}. sourceName is null when it cannot be determined without guessing. */
export function resolveSourceName(input: ResolveSourceNameInput): ResolveSourceNameResult {
  const url = input.originalLink || input.url || '';
  const domain = extractHostname(url).replace(/^www\./, '');

  if (input.apiPublisher && input.apiPublisher.trim()) {
    return { sourceName: input.apiPublisher.trim(), domain };
  }

  const fromTitle = extractPublisherFromTitleSuffix(input.title, input.sourceType);
  if (fromTitle) return { sourceName: fromTitle, domain };

  const known = domain ? PUBLISHER_DOMAINS[domain] : undefined;
  if (known) return { sourceName: known, domain };

  return { sourceName: null, domain };
}
