import { removeEmojis, normalizeTitleWhitespace } from './contentTextHelpers';
import { stripOrdinalHeadingPrefix } from './contentTitleHelpers';

type HeadingLike = {
  title?: string;
  content?: unknown;
  body?: unknown;
  summary?: unknown;
};

type HeadingOptimizationContent = {
  headings?: HeadingLike[];
  bodyPlain?: string;
};

type HeadingOptimizationSource = {
  contentMode?: string;
  articleType?: unknown;
  metadata?: { keywords?: unknown[] } | Record<string, unknown>;
  categoryHint?: string;
};

export function normalizeHeadingKeyForOptimization(title: string): string {
  return String(title || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–—:|·•.,!?()[\]{}"']/g, '')
    .toLowerCase()
    .trim();
}

export function dedupeRepeatedPhrasesInHeadingTitle(rawTitle: string): string {
  let title = normalizeTitleWhitespace(removeEmojis(String(rawTitle || '').trim()));
  if (!title) return '';

  const tokensWithoutAdjacentDupes: string[] = [];
  for (const token of title.split(/\s+/).map((word) => word.trim()).filter(Boolean)) {
    const previous = tokensWithoutAdjacentDupes[tokensWithoutAdjacentDupes.length - 1] || '';
    if (previous === token) continue;
    tokensWithoutAdjacentDupes.push(token);
  }

  title = tokensWithoutAdjacentDupes.join(' ').trim();
  if (!title) return '';

  const tokens = title.split(/\s+/).map((word) => word.trim()).filter(Boolean);
  if (tokens.length >= 4) {
    for (let index = 1; index < tokens.length; index++) {
      const suffixTokens = tokens.slice(index);
      if (suffixTokens.length < 2) continue;
      const prefix = tokens.slice(0, index).join(' ');
      const suffix = suffixTokens.join(' ');
      if (prefix.includes(suffix)) {
        return tokens.slice(0, index).join(' ').trim();
      }
    }
  }

  return title;
}

function strengthenThinHeadingTitle(title: string): string {
  return normalizeTitleWhitespace(String(title || '').trim());
}

export function optimizeSeoHeadingTitle(rawTitle: string): string {
  let title = normalizeTitleWhitespace(removeEmojis(String(rawTitle || '').trim()));
  title = stripOrdinalHeadingPrefix(title);
  if (!title) return '';

  title = title.replace(/^(?:[#•\-–—*]\s*)?(?:제\s*\d+\s*장\s*|STEP\s*\d+\s*|Step\s*\d+\s*|[①-⑳]\s*|\d{1,2}[).]\s*)/i, '').trim();
  title = title.replace(/^[\s\-–—:|·•,]+/, '').trim();
  title = dedupeRepeatedPhrasesInHeadingTitle(title);

  return strengthenThinHeadingTitle(title);
}

export function optimizeHomefeedHeadingTitle(rawTitle: string): string {
  let title = normalizeTitleWhitespace(removeEmojis(String(rawTitle || '').trim()));
  title = stripOrdinalHeadingPrefix(title);
  if (!title) return '';

  title = title.replace(/^(?:[#•\-–—*]\s*)?(?:제\s*\d+\s*장\s*|EP\.?\s*\d+\s*|[①-⑳]\s*|\d{1,2}[).]\s*)/i, '').trim();
  title = title.replace(/^[\s\-–—:|·•,]+/, '').trim();
  title = title.replace(/(소개|설명|정리|요약)\s*$/g, '').trim();
  title = dedupeRepeatedPhrasesInHeadingTitle(title);

  return strengthenThinHeadingTitle(title);
}

export function optimizeHeadingsForMode(content: HeadingOptimizationContent, source: HeadingOptimizationSource): void {
  if (!content || !Array.isArray(content.headings) || content.headings.length === 0) return;

  const mode = source.contentMode;
  if (mode !== 'seo' && mode !== 'homefeed' && mode !== 'mate') return;

  const seen = new Set<string>();

  content.headings = content.headings.map((heading, index) => {
    const title = String(heading.title || '').trim();

    if (!title) {
      const fallback = `소제목 ${index + 1}`;
      const key = normalizeHeadingKeyForOptimization(fallback);
      if (seen.has(key)) return { ...heading, title: `${fallback} (${index + 1})` };
      seen.add(key);
      return { ...heading, title: fallback };
    }

    const optimized = mode === 'homefeed'
      ? optimizeHomefeedHeadingTitle(title)
      : optimizeSeoHeadingTitle(title);

    const key = normalizeHeadingKeyForOptimization(optimized || title);
    const uniqueTitle = key && seen.has(key) ? `${optimized || title} (${index + 1})` : (optimized || title);
    if (key) seen.add(key);

    return { ...heading, title: uniqueTitle };
  });
}

export function syncHeadingsWithBodyPlain(_content: HeadingOptimizationContent): void {
  console.log('[syncHeadingsWithBodyPlain] 비활성화됨 - AI 생성 고유 소제목 유지');
}
