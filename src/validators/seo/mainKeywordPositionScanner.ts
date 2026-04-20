/**
 * Main-keyword position scanner.
 *
 * SEO 통합랭킹의 뉴럴 매칭 첫 단계는 키워드 매칭이다. 2026년 기준으로도
 * 제목 앞 3자 이내에 메인 키워드가 배치되어야 상위 노출 확률이 유의미
 * 하게 올라간다. 본문 첫 100자와 결론부에 다시 등장하면 "일관된 주제"
 * 신호가 강해진다.
 *
 * 이 스캐너는 메인 키워드가 제공된 경우에만 동작한다. 키워드 미지정 시
 * emptyInput=true로 반환하여 호출자가 스킵하도록 한다.
 */

import type { CheckableContent } from '../../contentQualityChecker.js';

export interface KeywordPositionResult {
  emptyInput: boolean;
  titleHasKeywordInFirst3Chars: boolean;
  introMentionsKeyword: boolean;
  conclusionMentionsKeyword: boolean;
  keywordDensity: number;
  /** Total keyword occurrences (case-insensitive, whole-word-ish). */
  occurrenceCount: number;
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const hay = normalizeForMatch(haystack);
  const n = normalizeForMatch(needle);
  if (!n) return 0;
  let count = 0;
  let from = 0;
  while (from < hay.length) {
    const idx = hay.indexOf(n, from);
    if (idx === -1) break;
    count++;
    from = idx + n.length;
  }
  return count;
}

export function scanMainKeywordPosition(
  content: CheckableContent & { title?: string },
  mainKeyword: string,
): KeywordPositionResult {
  const keyword = (mainKeyword || '').trim();
  if (!keyword) {
    return {
      emptyInput: true,
      titleHasKeywordInFirst3Chars: false,
      introMentionsKeyword: false,
      conclusionMentionsKeyword: false,
      keywordDensity: 0,
      occurrenceCount: 0,
    };
  }

  const title = (content.title ?? '').trim();
  const intro = (content.introduction ?? '').trim();
  const conclusion = (content.conclusion ?? '').trim();

  const titleLower = normalizeForMatch(title);
  const keywordLower = normalizeForMatch(keyword);
  const first3 = titleLower.slice(0, 3);
  const titleHit = first3 && keywordLower.slice(0, 3) === first3;

  const introHit = intro.length > 0 && countOccurrences(intro.slice(0, 100), keyword) > 0;
  const conclusionHit = conclusion.length > 0 && countOccurrences(conclusion, keyword) > 0;

  const fullText = [
    title,
    intro,
    ...(content.headings ?? []).map((h) => `${h.title ?? ''} ${h.body ?? h.content ?? ''}`),
    conclusion,
  ].join(' ');

  const totalOccurrences = countOccurrences(fullText, keyword);
  const words = normalizeForMatch(fullText).split(/\s+/).filter(Boolean).length;
  const density = words > 0 ? (totalOccurrences * keyword.length) / fullText.length : 0;

  return {
    emptyInput: false,
    titleHasKeywordInFirst3Chars: Boolean(titleHit),
    introMentionsKeyword: introHit,
    conclusionMentionsKeyword: conclusionHit,
    keywordDensity: density,
    occurrenceCount: totalOccurrences,
  };
}
