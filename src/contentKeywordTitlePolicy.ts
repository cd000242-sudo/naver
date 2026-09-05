import { collapseDuplicateLeadingYearTitle } from './contentTitleYearGuard';

export interface KeywordTitleSourceLike {
  useKeywordAsTitle?: boolean;
  keywordForTitle?: string;
  title?: string;
  metadata?: {
    keywords?: unknown;
  };
  keywords?: unknown;
}

function normalizeTitleCandidate(value: unknown): string {
  return collapseDuplicateLeadingYearTitle(
    String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  );
}

function firstKeywordFrom(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeTitleCandidate(item);
      if (normalized) return normalized;
    }
  }
  return normalizeTitleCandidate(value);
}

export function resolveKeywordAsTitleValue(source: KeywordTitleSourceLike): string {
  if (!source?.useKeywordAsTitle) return '';

  const candidates = [
    source.keywordForTitle,
    source.title,
    firstKeywordFrom(source.metadata?.keywords),
    firstKeywordFrom(source.keywords),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTitleCandidate(candidate);
    if (normalized) return normalized;
  }

  return '';
}

export function applyKeywordAsTitleLock<T extends {
  title?: string;
  selectedTitle?: string;
  titleAlternatives?: string[];
  titleCandidates?: Array<{ text: string; score?: number; reasoning?: string }>;
  keywordAsTitleLocked?: boolean;
  keywordAsTitleValue?: string;
}>(content: T, title: string): T {
  const exactTitle = normalizeTitleCandidate(title);
  if (!content || !exactTitle) return content;

  return {
    ...content,
    title: exactTitle,
    selectedTitle: exactTitle,
    keywordAsTitleLocked: true,
    keywordAsTitleValue: exactTitle,
    titleAlternatives: [exactTitle],
    titleCandidates: [{ text: exactTitle, score: 100, reasoning: '사용자 지정 키워드 제목(verbatim)' }],
  };
}

/**
 * [2026-09-05] The user-confirmed title carried by a generated content object, or ''.
 *
 * The generation-side lock (applyKeywordAsTitleLock / applyManualTitleOverride) runs inside
 * contentGenerator, but the content-policy rewrite runs *after* it in main.ts and used to copy
 * result.article.title straight over selectedTitle — silently undoing the lock. ("한 번 입은 옷…"
 * incident: the confirmed title came back as a rewritten question.) Every post-lock stage that
 * wants to replace the title must go through this resolver first.
 */
export function resolveLockedTitle(content: {
  keywordAsTitleLocked?: boolean;
  keywordAsTitleValue?: string;
  manualTitleLocked?: boolean;
  manualTitleValue?: string;
} | null | undefined): string {
  if (!content) return '';
  if (content.keywordAsTitleLocked === true) {
    const value = String(content.keywordAsTitleValue || '').trim();
    if (value) return value;
  }
  if (content.manualTitleLocked === true) {
    const value = String(content.manualTitleValue || '').trim();
    if (value) return value;
  }
  return '';
}
