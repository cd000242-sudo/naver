/**
 * Unified SERP Probe — 끝판왕 Phase 3.12 (v2.10.195)
 *
 * 정적(검색 API) + 동적(통합탭 HTML) 두 layer를 *통합 호출*하여
 * 가장 풍부한 SERP baseline을 사용자에게 제공.
 *
 * 호출 흐름:
 *   1. probeSerp() — 검색 API + PostView fetch (정적)
 *      → 상위 N개 글 본문 + qualityEvaluator 신호 측정
 *   2. probeDynamicSerp() — 통합탭 HTML 파싱 (동적)
 *      → AI 스마트블록 노출 / 인플루언서 비율 / 실제 노출 순위
 *   3. 두 결과 통합 → 통합 baseline + 진입 난이도 지표
 *
 * fail-safe: 동적 호출 실패해도 정적 결과만으로 baseline 산출 (정상 흐름 유지).
 *
 * 추가 baseline 신호:
 *   - hasSmartblock — AI 스마트블록 노출 여부 (네이버가 AI로 골라 띄우는 영역)
 *   - influencerRatio — 인플루언서 비율 (키워드 진입 난이도)
 *   - difficultyTier — 키워드 진입 난이도 등급 (easy/medium/hard/expert)
 */

import { probeSerp, type SerpProbeReport, type SerpProbeOptions } from './serpProbe';
import { probeDynamicSerp, type DynamicSerpReport } from './dynamicSerpProbe';
import type { Mode } from '../content/qualityEvaluator';

export interface UnifiedSerpReport {
  readonly staticReport: SerpProbeReport;
  readonly dynamicReport: DynamicSerpReport | null;
  readonly probedAt: string;
  readonly difficulty: {
    readonly tier: 'easy' | 'medium' | 'hard' | 'expert';
    readonly reasoning: string;
    readonly influencerRatio: number;       // 0~1
    readonly hasSmartblock: boolean;
    readonly avgSerpFinalScore: number;
  };
}

export interface UnifiedSerpProbeOptions extends SerpProbeOptions {
  readonly skipDynamic?: boolean;          // true 시 동적 호출 건너뜀
  readonly dynamicTimeout?: number;        // 동적 HTML fetch 타임아웃 (기본 8000ms)
}

/**
 * 키워드 진입 난이도 산출 (실측 신호 기반).
 *   - 인플루언서 비율 + 스마트블록 노출 + 상위 노출 평균 점수로 종합 판정
 */
function classifyDifficulty(
  influencerRatio: number,
  hasSmartblock: boolean,
  avgFinalScore: number,
): UnifiedSerpReport['difficulty']['tier'] {
  // 인플루언서 비율 70%+ → expert (인플루언서 키워드)
  if (influencerRatio >= 0.7) return 'expert';

  // 스마트블록 + 평균 점수 80+ → hard
  if (hasSmartblock && avgFinalScore >= 80) return 'hard';

  // 인플루언서 40%+ 또는 평균 점수 75+ → hard
  if (influencerRatio >= 0.4 || avgFinalScore >= 75) return 'hard';

  // 인플루언서 20%+ 또는 평균 65+ → medium
  if (influencerRatio >= 0.2 || avgFinalScore >= 65) return 'medium';

  // 그 외 → easy
  return 'easy';
}

function buildReasoning(
  tier: UnifiedSerpReport['difficulty']['tier'],
  influencerRatio: number,
  hasSmartblock: boolean,
  avgFinalScore: number,
): string {
  const signals: string[] = [];
  signals.push(`평균 점수 ${avgFinalScore}`);
  signals.push(`인플루언서 ${Math.round(influencerRatio * 100)}%`);
  if (hasSmartblock) signals.push('AI 스마트블록 노출');

  const tierLabel: Record<string, string> = {
    easy: '🟢 진입 쉬움 — 평범한 글로도 노출 가능',
    medium: '🟡 진입 중간 — 평균 이상 품질 필요',
    hard: '🟠 진입 어려움 — 상위 노출에 강한 신호 필요',
    expert: '🔴 인플루언서 영역 — 일반 블로그 노출 한계',
  };
  return `${tierLabel[tier]} (${signals.join(', ')})`;
}

/**
 * 정적 + 동적 SERP 통합 분석.
 */
export async function probeUnifiedSerp(
  keyword: string,
  clientId: string,
  clientSecret: string,
  options: UnifiedSerpProbeOptions = {},
): Promise<UnifiedSerpReport> {
  const probedAt = new Date().toISOString();

  // 1. 정적 SERP (필수)
  const staticReport = await probeSerp(keyword, clientId, clientSecret, options);

  // 2. 동적 SERP (옵션) — 실패해도 정적 결과만으로 진행
  let dynamicReport: DynamicSerpReport | null = null;
  if (!options.skipDynamic) {
    try {
      dynamicReport = await probeDynamicSerp(keyword, {
        maxCards: options.display ?? 10,
        timeout: options.dynamicTimeout ?? 8000,
      });
      if (!dynamicReport.fetchSuccess) {
        // fetch 실패는 silent — 정적 결과로만 진행
        dynamicReport = null;
      }
    } catch {
      dynamicReport = null;
    }
  }

  // 3. 통합 난이도 산출
  const avgScore = staticReport.baseline?.avgFinalScore ?? 0;
  const totalCards = dynamicReport?.totalCards ?? 0;
  const influencerRatio = totalCards > 0
    ? (dynamicReport?.influencerCount ?? 0) / totalCards
    : 0;
  const hasSmartblock = dynamicReport?.hasSmartblock ?? false;

  const tier = classifyDifficulty(influencerRatio, hasSmartblock, avgScore);
  const reasoning = buildReasoning(tier, influencerRatio, hasSmartblock, avgScore);

  return {
    staticReport,
    dynamicReport,
    probedAt,
    difficulty: {
      tier,
      reasoning,
      influencerRatio,
      hasSmartblock,
      avgSerpFinalScore: avgScore,
    },
  };
}

/**
 * mode를 SerpProbeOptions['mode']로 안전하게 변환.
 */
export function toSerpMode(mode: string | undefined): Mode {
  if (mode === 'homefeed' || mode === 'affiliate' || mode === 'business' || mode === 'custom' || mode === 'mate') {
    return mode;
  }
  return 'seo';
}
