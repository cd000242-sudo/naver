/**
 * H2 question-ratio scanner (advisory).
 *
 * SPEC-AEO-EXPOSURE-2026 R1.
 *
 * 기존 faqHeadingScanner는 질문형 소제목의 "절대 개수"만 본다. 이 스캐너는 전체
 * 소제목 대비 질문형 "비율"을 계산한다(권장 60% 이상). 측정만 하고 강제/수정하지
 * 않는다. 발행 파이프라인 미연결.
 */

import type { CheckableContent } from '../../contentQualityChecker.js';

export interface H2QuestionRatioResult {
  totalHeadings: number;
  questionHeadingCount: number;
  /** questionHeadingCount / totalHeadings (0 when no headings). */
  questionRatio: number;
  meetsMinRatio: boolean;
  warnings: string[];
}

const MIN_RATIO = 0.6;

const QUESTION_PATTERNS: RegExp[] = [
  /\?$/,
  /(무엇|뭐|어디|누구|언제|어떻게|왜|얼마|몇)/,
  /(하는 법|하는 방법)$/,
  /(가능할까|될까|될까요|할까)$/,
  /(차이|차이점|비교)(는)?$/,
];

function isQuestionHeading(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return QUESTION_PATTERNS.some((p) => p.test(t));
}

export function scanH2QuestionRatio(
  content: CheckableContent,
  minRatio: number = MIN_RATIO,
): H2QuestionRatioResult {
  const headings = (content.headings ?? [])
    .map((h) => (h.title ?? '').trim())
    .filter((t) => t.length > 0);

  const totalHeadings = headings.length;
  const questionHeadingCount = headings.filter(isQuestionHeading).length;
  const questionRatio = totalHeadings > 0 ? questionHeadingCount / totalHeadings : 0;
  const meetsMinRatio = totalHeadings > 0 && questionRatio >= minRatio;

  // [2026-08-26] 문구를 "권장 미달"에서 "가설 기준 미달"로 바꿨다.
  // seo/base는 "실제 묻는 질문이 있을 때만" 질문형을 쓰라 하고, IB-3은 "1개까지만"으로
  // 막는다. 이 비율을 채우려면 없는 질문을 만들어야 하므로, 미달은 계약 위반이 아니라
  // AEO 가설(AI 탭 passage 매칭)과의 거리일 뿐이다. 미달을 결함으로 읽고 쫓지 않게 한다.
  const warnings: string[] = [];
  if (totalHeadings > 0 && !meetsMinRatio) {
    warnings.push(
      `질문형 소제목 비율 ${Math.round(questionRatio * 100)}% ` +
        `(AEO 가설 기준 ${Math.round(minRatio * 100)}% — 측정값이며 결함 아님. ` +
        `질문형은 실제 묻는 질문이 있을 때만 쓴다: seo/base)`,
    );
  }

  return { totalHeadings, questionHeadingCount, questionRatio, meetsMinRatio, warnings };
}
