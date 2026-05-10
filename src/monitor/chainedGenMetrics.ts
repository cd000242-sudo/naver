/**
 * SPEC-CONVERSION-001 L2-1.10 — 체인드 파이프라인 메트릭 수집
 *
 * 5단계 chained generation의 단계별 비용·지연·캐시 hit율을 수집해
 * operationsDashboard에 노출한다.
 *
 * 메모리 [추정 효과 금지]: 비용 절감율 약속 X — 실측 메트릭만 노출.
 * 메모리 [silent 폴백 금지]: 메트릭 미수집 시 0 그대로 노출 (가짜 값 X).
 *
 * 파일 한도 200줄 준수.
 */

import type { ChainedGenerationResult, ChainedStageMetric } from '../content/chainedGeneration';
import { getChainCacheStats, type AllChainCacheStats } from '../content/chainCache';

export type StageName = ChainedStageMetric['stage'];

export interface StageAggregate {
  readonly stage: StageName;
  readonly totalCalls: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly totalElapsedMs: number;
  readonly avgElapsedMs: number;
  readonly cachedHits: number; // note에 'cached' 포함된 호출 수
}

export interface ChainedGenSnapshot {
  readonly totalRuns: number;          // runChainedGeneration 호출 횟수 (enabled 무관)
  readonly enabledRuns: number;        // feature flag ON으로 실제 stage 실행된 횟수
  readonly byStage: Readonly<Record<StageName, StageAggregate>>;
  readonly cache: AllChainCacheStats;
  readonly totalPipelineMs: number;    // enabled run의 총 elapsedMs 합
  readonly avgPipelineMs: number;
  readonly lastRunAt: string | null;
}

const STAGE_NAMES: readonly StageName[] = ['classify', 'persona', 'draft', 'factGate', 'optimize'];

interface MutableStageAgg {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalElapsedMs: number;
  cachedHits: number;
}

function newStageAgg(): MutableStageAgg {
  return { totalCalls: 0, successCount: 0, failureCount: 0, totalElapsedMs: 0, cachedHits: 0 };
}

let totalRuns = 0;
let enabledRuns = 0;
let totalPipelineMs = 0;
let lastRunAt: string | null = null;
const stageAggregates = new Map<StageName, MutableStageAgg>(
  STAGE_NAMES.map((s) => [s, newStageAgg()] as const),
);

/**
 * runChainedGeneration의 결과를 메트릭에 기록.
 * 호출자(contentGenerator)가 매 호출 후 본 함수를 호출.
 *
 * silent 폴백 X: feature flag OFF여도 totalRuns는 증가시켜 호출 빈도 추적 가능.
 */
export function recordChainedGenRun(result: ChainedGenerationResult): void {
  totalRuns++;
  lastRunAt = new Date().toISOString();
  if (!result.enabled) return; // OFF 호출은 stage별 집계 X

  enabledRuns++;
  let pipelineMs = 0;
  for (const m of result.metrics) {
    const agg = stageAggregates.get(m.stage);
    if (!agg) continue;
    agg.totalCalls++;
    agg.totalElapsedMs += m.elapsedMs;
    pipelineMs += m.elapsedMs;
    if (m.success) agg.successCount++;
    else agg.failureCount++;
    if (m.note && /cached/i.test(m.note)) agg.cachedHits++;
  }
  totalPipelineMs += pipelineMs;
}

export function getChainedGenSnapshot(): ChainedGenSnapshot {
  const byStage = {} as Record<StageName, StageAggregate>;
  for (const stage of STAGE_NAMES) {
    const agg = stageAggregates.get(stage)!;
    byStage[stage] = {
      stage,
      totalCalls: agg.totalCalls,
      successCount: agg.successCount,
      failureCount: agg.failureCount,
      totalElapsedMs: agg.totalElapsedMs,
      avgElapsedMs: agg.totalCalls === 0 ? 0 : Math.round(agg.totalElapsedMs / agg.totalCalls),
      cachedHits: agg.cachedHits,
    };
  }
  return {
    totalRuns,
    enabledRuns,
    byStage,
    cache: getChainCacheStats(),
    totalPipelineMs,
    avgPipelineMs: enabledRuns === 0 ? 0 : Math.round(totalPipelineMs / enabledRuns),
    lastRunAt,
  };
}

export function resetChainedGenMetrics(): void {
  totalRuns = 0;
  enabledRuns = 0;
  totalPipelineMs = 0;
  lastRunAt = null;
  for (const stage of STAGE_NAMES) {
    stageAggregates.set(stage, newStageAgg());
  }
}

/**
 * 사람이 읽기 쉬운 한 줄 요약. operationsDashboard.getDashboardSummary에 추가용.
 */
export function getChainedGenSummary(): string {
  const s = getChainedGenSnapshot();
  if (s.totalRuns === 0) return '체인 파이프라인: 미사용 (호출 0회)';
  const cacheHitRate = (s.cache.classify.hitRate + s.cache.persona.hitRate) / 2;
  return [
    `체인: ${s.enabledRuns}/${s.totalRuns} 활성 호출`,
    `평균 파이프라인 ${s.avgPipelineMs}ms`,
    `캐시 hit ${(cacheHitRate * 100).toFixed(0)}%`,
  ].join(', ');
}
