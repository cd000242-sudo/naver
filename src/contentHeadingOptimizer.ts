import { removeEmojis, normalizeTitleWhitespace } from './contentTextHelpers';
import { applyHeadingRenames, collectHeadingRenames } from './content/headingRenameSync.js';
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

/**
 * 소제목 보정 결과를 본문에 반영한다.
 *
 * [2026-09-01] 이 함수는 로그 한 줄만 찍는 빈 껍데기였다. 그런데 호출부가 셋이고,
 * 그 앞에서 소제목을 실제로 바꾸는 곳이 둘이다(optimizeHeadingsForMode ·
 * applyHeadingKeywordPatch). 발행은 headings[] 가 아니라 bodyPlain 을 타이핑하므로,
 * 두 보정이 독자에게 한 번도 도달하지 않았다. SEO 메인키워드 앞배치도 같이 사문화였다.
 *
 * 옛 휴리스틱 동기화를 되살리지는 않는다 — "AI 생성 고유 소제목 유지" 를 위해
 * 의도적으로 껐던 것이고, 그 판단은 지금도 맞다. 대신 우리가 직접 바꾼 것만
 * 리터럴로 반영한다. 바꾸기 전후 문자열을 알고 있으므로 추측이 필요 없다.
 *
 * 호출 규약: 소제목을 바꾸기 직전에 snapshotHeadingTitles 로 제목을 찍어 두고,
 * 바꾼 뒤 그 스냅샷과 함께 부른다. 스냅샷이 없으면 아무것도 하지 않는다(기존 동작).
 */
export function syncHeadingsWithBodyPlain(
  content: HeadingOptimizationContent,
  beforeTitles?: readonly string[],
): void {
  try {
    if (!content || !Array.isArray(beforeTitles) || beforeTitles.length === 0) return;
    const after = snapshotHeadingTitles(content);
    const renames = collectHeadingRenames(beforeTitles, after);
    if (renames.length === 0) return;

    const target = content as unknown as { bodyPlain?: string; bodyHtml?: string };
    if (typeof target.bodyPlain === 'string' && target.bodyPlain) {
      target.bodyPlain = applyHeadingRenames(target.bodyPlain, renames);
    }
    if (typeof target.bodyHtml === 'string' && target.bodyHtml) {
      target.bodyHtml = applyHeadingRenames(target.bodyHtml, renames);
    }
    console.log(`[syncHeadingsWithBodyPlain] ✅ 소제목 ${renames.length}건을 본문에 반영: `
      + renames.map((r) => `"${r.from}" → "${r.to}"`).join(', '));
  } catch (error) {
    console.warn('[syncHeadingsWithBodyPlain] 본문 반영 실패 — 소제목만 바뀐 상태로 진행합니다:', error);
  }
}

/** 소제목을 바꾸기 직전 제목을 찍어 둔다. */
export function snapshotHeadingTitles(content: HeadingOptimizationContent): string[] {
  const headings = (content as unknown as { headings?: Array<{ title?: unknown }> })?.headings;
  if (!Array.isArray(headings)) return [];
  return headings.map((h) => String(h?.title ?? '').trim());
}
