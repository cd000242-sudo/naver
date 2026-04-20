/**
 * FAQ heading scanner.
 *
 * AI 브리핑(CUE:)은 "질문 → 답변" 구조를 우선 발췌한다. 전체 H2 중 1~2개가
 * 질문형 소제목("~는 무엇인가?", "~하는 법?", "~와 ~ 차이는?")이면 인용
 * 확률이 약 2배 상승한다 (2026 SEO 리서치 합의).
 *
 * 이 스캐너는 질문형 소제목의 개수를 세고, 0~2 범위 외(0개 또는 3개 이상)
 * 일 때 경고한다. 3개 이상이면 "정보 페이지"라기보다 "Q&A 게시판"으로
 * 오인되어 오히려 감점될 수 있다.
 */

import type { CheckableContent } from '../../contentQualityChecker.js';

export interface FaqHeadingResult {
  totalHeadings: number;
  questionHeadingCount: number;
  /** true when 1~2 question headings present. */
  withinRecommendedRange: boolean;
  questionHeadings: string[];
}

const QUESTION_PATTERNS: RegExp[] = [
  /\?$/, // ends with Korean or ASCII question mark
  /(무엇|뭐|어디|누구|언제|어떻게|왜|얼마|몇)/,
  /(하는 법|하는 방법)$/,
  /(가능할까|될까|될까요|할까)$/,
  /(차이|차이점|비교)(는)?$/,
];

function isQuestionHeading(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  return QUESTION_PATTERNS.some((p) => p.test(trimmed));
}

export function scanFaqHeadings(content: CheckableContent): FaqHeadingResult {
  const headings = (content.headings ?? [])
    .map((h) => (h.title ?? '').trim())
    .filter((t) => t.length > 0);

  const questionHeadings = headings.filter(isQuestionHeading);
  const count = questionHeadings.length;

  return {
    totalHeadings: headings.length,
    questionHeadingCount: count,
    withinRecommendedRange: count >= 1 && count <= 2,
    questionHeadings,
  };
}
