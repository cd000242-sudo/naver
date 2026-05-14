/**
 * Calibration — 끝판왕 Phase 3.18.3 (v2.10.198)
 *
 * [노출 글] vs [비노출 글]의 evaluator 신호를 *실측 비교*하여
 * evaluator 임계값 권장 보정을 제안.
 *
 * 핵심 가치:
 *   - 기존 임계값(60/80 등)은 모두 *추정* (architect 권장 + 통념)
 *   - 본 모듈은 *우리 글이 실제로 노출됐는지* 데이터로 임계 산출
 *   - 추정 → 실측 검증된 임계로 전환의 핵심
 *
 * 출력:
 *   - 노출 글 평균 점수 / 비노출 글 평균 점수
 *   - 두 그룹의 신호별 평균 차이 (실측 결정 신호)
 *   - 권장 임계값 (노출 글 하위 25% 점수)
 *
 * 안전:
 *   - 최소 10건 + 노출 ≥3건 + 비노출 ≥3건 필요 (false-positive 방지)
 *   - 임계 보정은 *제안만* — 자동 적용 안 함 (사용자 컨펌 후 수동 반영)
 */

import { splitExposureGroups, type PublishedPost } from './publishedPostTracker';

export interface CalibrationResult {
  readonly canCalibrate: boolean;
  readonly exposedCount: number;
  readonly notExposedCount: number;
  readonly unknownCount: number;
  readonly exposed: {
    readonly avgFinalScore: number;
    readonly avgModeScore: number;
    readonly avgSafetyScore: number;
    readonly avgHumanlikeScore: number;
    readonly minFinalScore: number;       // 노출 글 중 가장 낮은 점수 (권장 임계 후보)
    readonly p25FinalScore: number;       // 하위 25% 점수
  };
  readonly notExposed: {
    readonly avgFinalScore: number;
    readonly avgModeScore: number;
    readonly avgSafetyScore: number;
    readonly avgHumanlikeScore: number;
  };
  readonly signalGap: {
    readonly modeScore: number;            // exposed - notExposed
    readonly safetyScore: number;
    readonly humanlikeScore: number;
    readonly finalScore: number;
  };
  readonly recommendedThreshold: number | null;  // 노출 글 p25 — 권장 통과 임계
  readonly reason: string;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

export function computeCalibration(posts: PublishedPost[]): CalibrationResult {
  const empty: CalibrationResult = {
    canCalibrate: false,
    exposedCount: 0,
    notExposedCount: 0,
    unknownCount: 0,
    exposed: { avgFinalScore: 0, avgModeScore: 0, avgSafetyScore: 0, avgHumanlikeScore: 0, minFinalScore: 0, p25FinalScore: 0 },
    notExposed: { avgFinalScore: 0, avgModeScore: 0, avgSafetyScore: 0, avgHumanlikeScore: 0 },
    signalGap: { modeScore: 0, safetyScore: 0, humanlikeScore: 0, finalScore: 0 },
    recommendedThreshold: null,
    reason: '',
  };

  if (posts.length < 10) {
    return { ...empty, reason: `발행 글 ${posts.length}건 (calibration 위해 최소 10건 필요)` };
  }

  const { exposed, notExposed, unknownCheck } = splitExposureGroups(posts);

  if (exposed.length < 3 || notExposed.length < 3) {
    return {
      ...empty,
      exposedCount: exposed.length,
      notExposedCount: notExposed.length,
      unknownCount: unknownCheck.length,
      reason: `노출 ${exposed.length}건 / 비노출 ${notExposed.length}건 (각 최소 3건 필요)`,
    };
  }

  const exposedScores = exposed.map(p => p.evaluator.finalScore);
  const exposedSorted = [...exposedScores].sort((a, b) => a - b);
  const minExposed = exposedSorted[0];
  const p25Exposed = percentile(exposedSorted, 0.25);

  const exposedStats = {
    avgFinalScore: avg(exposedScores),
    avgModeScore: avg(exposed.map(p => p.evaluator.modeScore)),
    avgSafetyScore: avg(exposed.map(p => p.evaluator.safetyScore)),
    avgHumanlikeScore: avg(exposed.map(p => p.evaluator.humanlikeScore)),
    minFinalScore: minExposed,
    p25FinalScore: p25Exposed,
  };

  const notExposedStats = {
    avgFinalScore: avg(notExposed.map(p => p.evaluator.finalScore)),
    avgModeScore: avg(notExposed.map(p => p.evaluator.modeScore)),
    avgSafetyScore: avg(notExposed.map(p => p.evaluator.safetyScore)),
    avgHumanlikeScore: avg(notExposed.map(p => p.evaluator.humanlikeScore)),
  };

  const signalGap = {
    finalScore: exposedStats.avgFinalScore - notExposedStats.avgFinalScore,
    modeScore: exposedStats.avgModeScore - notExposedStats.avgModeScore,
    safetyScore: exposedStats.avgSafetyScore - notExposedStats.avgSafetyScore,
    humanlikeScore: exposedStats.avgHumanlikeScore - notExposedStats.avgHumanlikeScore,
  };

  // 권장 임계: 노출 글 하위 25%까지 통과 (실측 안전 마진)
  const recommendedThreshold = p25Exposed;

  return {
    canCalibrate: true,
    exposedCount: exposed.length,
    notExposedCount: notExposed.length,
    unknownCount: unknownCheck.length,
    exposed: exposedStats,
    notExposed: notExposedStats,
    signalGap,
    recommendedThreshold,
    reason: '',
  };
}
