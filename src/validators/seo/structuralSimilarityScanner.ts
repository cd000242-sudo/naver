/**
 * Structural similarity (anti-homogenization) scanner.
 *
 * SPEC-AEO-EXPOSURE-2026 R0.
 *
 * 자동화 발행 도구의 최대 노출 리스크는 "글마다 형식이 똑같아지는 것"이다.
 * 모든 글이 같은 골격(소제목 개수 / 질문형 비율 / 문단 길이 분포 / 도입 패턴)을
 * 가지면 검색엔진에 자가표절·양산(어뷰징) 시그니처로 읽혀 노출이 깎인다.
 *
 * 이 스캐너는 글의 "구조 골격"을 수치 특징으로 추출하고, 같은 계정의 최근 글들과
 * 비교해 동형성(homogeneity) 점수를 낸다. 임계 초과 시 경고만 한다 — 수정은
 * 하지 않으며, 발행 파이프라인에 연결되지 않는다 (advisory, pure function).
 *
 * 강제(hard gate)와 무관하므로 글 균질화를 키우는 역효과 위험이 없다.
 */

import type { CheckableContent } from '../../contentQualityChecker.js';

export interface StructuralSkeleton {
  /** Number of H2-level headings. */
  headingCount: number;
  /** Ratio of question-style headings (0..1). */
  questionHeadingRatio: number;
  /** Mean character length of heading bodies. */
  avgBodyLen: number;
  /** Coefficient of variation (stddev/mean) of body lengths — structural burstiness. */
  bodyLenCv: number;
  /** Coarse classification of the opening: definition | question | emotional | other. */
  introPatternKey: 'definition' | 'question' | 'emotional' | 'other';
}

export interface StructuralSimilarityResult {
  skeleton: StructuralSkeleton;
  /** Highest similarity (0..1) against any history item. */
  maxSimilarity: number;
  /** Mean similarity (0..1) across history items. */
  meanSimilarity: number;
  comparedCount: number;
  /** true when maxSimilarity >= threshold. */
  isHomogeneous: boolean;
  warnings: string[];
}

export interface StructuralSimilarityOptions {
  /** Homogeneity threshold (default 0.85). */
  threshold?: number;
}

const DEFAULT_THRESHOLD = 0.85;

// Feature weights (sum = 1.0). introPatternKey weighted highest because the opening
// shape is the strongest template fingerprint.
const WEIGHTS = {
  headingCount: 0.2,
  questionHeadingRatio: 0.2,
  avgBodyLen: 0.15,
  bodyLenCv: 0.15,
  introPatternKey: 0.3,
} as const;

// Normalization references for numeric closeness.
const HEADING_COUNT_REF = 10;
const BODY_LEN_REF = 400;
const CV_REF = 1;

const QUESTION_HEADING_PATTERNS: RegExp[] = [
  /\?$/,
  /(무엇|뭐|어디|누구|언제|어떻게|왜|얼마|몇)/,
  /(하는 법|하는 방법|받는 방법|신청 방법)?\s*은\?$/,
  /(가능할까|될까|될까요|할까)$/,
  /(차이|차이점|비교)(는)?$/,
];

const EMOTIONAL_OPENING = /(솔직히|저도|처음엔|처음에는|궁금|헷갈|사실은|사실\s|놀랐)/;
const DEFINITION_OPENING = /(는|은)\s.+(이에요|입니다|이다|예요|랍니다|입니다만|이라고)/;

function isQuestionHeading(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return QUESTION_HEADING_PATTERNS.some((p) => p.test(t));
}

function firstSentence(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  const cut = t.split(/[.!?。\n]/).find((s) => s.trim().length > 0) ?? '';
  return cut.trim().slice(0, 80);
}

function classifyIntro(content: CheckableContent): StructuralSkeleton['introPatternKey'] {
  const source =
    (content.introduction && content.introduction.trim()) ||
    (content.headings?.[0]?.body ?? content.headings?.[0]?.content ?? '');
  const opening = firstSentence(source);
  if (!opening) return 'other';
  if (EMOTIONAL_OPENING.test(opening)) return 'emotional';
  if (/\?$/.test(opening) || /(무엇|어떻게|왜|얼마)/.test(opening)) return 'question';
  if (DEFINITION_OPENING.test(opening)) return 'definition';
  return 'other';
}

export function buildSkeleton(content: CheckableContent): StructuralSkeleton {
  const headings = (content.headings ?? []).map((h) => ({
    title: (h.title ?? '').trim(),
    body: (h.body ?? h.content ?? '').trim(),
  }));

  const headingCount = headings.length;
  const titledHeadings = headings.filter((h) => h.title.length > 0);
  const questionHeadingRatio =
    titledHeadings.length > 0
      ? titledHeadings.filter((h) => isQuestionHeading(h.title)).length / titledHeadings.length
      : 0;

  const lengths = headings.map((h) => h.body.length);
  const avgBodyLen =
    lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  let bodyLenCv = 0;
  if (avgBodyLen > 0 && lengths.length > 1) {
    const variance =
      lengths.reduce((acc, l) => acc + (l - avgBodyLen) ** 2, 0) / lengths.length;
    bodyLenCv = Math.sqrt(variance) / avgBodyLen;
  }

  return {
    headingCount,
    questionHeadingRatio,
    avgBodyLen,
    bodyLenCv,
    introPatternKey: classifyIntro(content),
  };
}

function numericCloseness(a: number, b: number, ref: number): number {
  return 1 - Math.min(1, Math.abs(a - b) / ref);
}

export function skeletonSimilarity(a: StructuralSkeleton, b: StructuralSkeleton): number {
  const headingCount = numericCloseness(a.headingCount, b.headingCount, HEADING_COUNT_REF);
  const questionRatio = 1 - Math.min(1, Math.abs(a.questionHeadingRatio - b.questionHeadingRatio));
  const avgBodyLen = numericCloseness(a.avgBodyLen, b.avgBodyLen, BODY_LEN_REF);
  const bodyLenCv = numericCloseness(a.bodyLenCv, b.bodyLenCv, CV_REF);
  const introPattern = a.introPatternKey === b.introPatternKey ? 1 : 0;

  return (
    WEIGHTS.headingCount * headingCount +
    WEIGHTS.questionHeadingRatio * questionRatio +
    WEIGHTS.avgBodyLen * avgBodyLen +
    WEIGHTS.bodyLenCv * bodyLenCv +
    WEIGHTS.introPatternKey * introPattern
  );
}

export function scanStructuralSimilarity(
  current: CheckableContent,
  history: CheckableContent[],
  options: StructuralSimilarityOptions = {},
): StructuralSimilarityResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const skeleton = buildSkeleton(current);

  const scores = (history ?? []).map((h) => skeletonSimilarity(skeleton, buildSkeleton(h)));
  const comparedCount = scores.length;
  const maxSimilarity = comparedCount > 0 ? Math.max(...scores) : 0;
  const meanSimilarity =
    comparedCount > 0 ? scores.reduce((a, b) => a + b, 0) / comparedCount : 0;

  const isHomogeneous = comparedCount > 0 && maxSimilarity >= threshold;
  const warnings: string[] = [];
  if (isHomogeneous) {
    warnings.push(
      `직전 글들과 구조 골격이 ${Math.round(maxSimilarity * 100)}% 유사합니다(임계 ${Math.round(
        threshold * 100,
      )}%). 소제목 구성/도입 방식/문단 리듬을 바꿔 양산·자가표절 시그니처를 피하세요`,
    );
  }

  return { skeleton, maxSimilarity, meanSimilarity, comparedCount, isHomogeneous, warnings };
}
