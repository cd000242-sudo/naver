/**
 * Definition-first-sentence scanner (AI 브리핑 / CUE: 대응).
 *
 * 2026년 네이버 통합검색은 상단에 하이퍼클로바X 기반 AI 요약을 노출한다.
 * AI는 "질문에 대한 명확한 답변이 첫 문장에 있는" 글을 우선 발췌한다.
 * 각 H2 섹션의 첫 문장이 정의문 패턴("A는 B이다/예요") 또는 결론
 * 선언형("~의 핵심은 ~")이면 인용 확률이 크게 올라간다.
 *
 * 이 스캐너는 각 H2의 첫 문장을 추출해 정의문 여부만 판정한다.
 * 수정은 하지 않는다 (AuthGR 역지문 회피).
 */

import type { CheckableContent } from '../../contentQualityChecker.js';

export interface DefinitionCheckResult {
  totalHeadings: number;
  definitionHitCount: number;
  hitRatio: number;
  missedHeadings: string[];
}

/**
 * Match any of:
 *   - "A는 B이다" / "A는 B예요" / "A는 B입니다"
 *   - "A의 핵심은 B" / "A의 정답은 B"
 *   - "결론부터 말하면 ~"
 *   - 첫 문장이 30자 이내의 짧은 팩트 선언 (숫자 또는 명사 종결)
 */
const DEFINITION_PATTERNS: RegExp[] = [
  /^[^.!?\n]{1,60}(은|는)\s[^.!?\n]+(이다|이에요|예요|입니다|다)\./,
  /^[^.!?\n]{1,60}(의\s)?(핵심|정답|포인트|결론)(은|이)\s/,
  /^결론(부터)?\s*말(하면|씀|해보면)/,
  /^[^.!?\n]{1,30}(입니다|이에요|예요)[\s.]/,
];

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : trimmed.slice(0, 80);
}

function isDefinitionSentence(sentence: string): boolean {
  return DEFINITION_PATTERNS.some((p) => p.test(sentence));
}

export function scanDefinitionFirstSentences(
  content: CheckableContent,
): DefinitionCheckResult {
  const headings = content.headings ?? [];
  const missedHeadings: string[] = [];
  let hits = 0;

  for (const h of headings) {
    const body = String(h.body || h.content || '').trim();
    if (!body) continue;
    const sentence = firstSentence(body);
    if (isDefinitionSentence(sentence)) {
      hits++;
    } else if (h.title) {
      missedHeadings.push(h.title);
    }
  }

  const total = headings.length;
  return {
    totalHeadings: total,
    definitionHitCount: hits,
    hitRatio: total > 0 ? hits / total : 0,
    missedHeadings,
  };
}
