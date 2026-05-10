/**
 * SPEC-CONVERSION-001 L2-1.10 — chainedGenMetrics 단위 테스트.
 * 메트릭 누적·캐시 통합·요약 출력 검증.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordChainedGenRun,
  getChainedGenSnapshot,
  getChainedGenSummary,
  resetChainedGenMetrics,
} from '../monitor/chainedGenMetrics';
import { runChainedGeneration } from '../content/chainedGeneration';
import { clearAllChainCaches } from '../content/chainCache';
import { getDashboardSnapshot, getDashboardSummary, resetAllMetrics } from '../monitor/operationsDashboard';

describe('recordChainedGenRun — 누적 동작', () => {
  beforeEach(() => {
    resetChainedGenMetrics();
    clearAllChainCaches();
  });

  it('초기 스냅샷은 모두 0', () => {
    const s = getChainedGenSnapshot();
    expect(s.totalRuns).toBe(0);
    expect(s.enabledRuns).toBe(0);
    expect(s.byStage.classify.totalCalls).toBe(0);
    expect(s.byStage.optimize.totalCalls).toBe(0);
    expect(s.lastRunAt).toBeNull();
  });

  it('feature flag OFF 결과는 totalRuns만 증가, stage 미집계', async () => {
    const result = await runChainedGeneration({ forceFlag: false });
    recordChainedGenRun(result);
    const s = getChainedGenSnapshot();
    expect(s.totalRuns).toBe(1);
    expect(s.enabledRuns).toBe(0);
    expect(s.byStage.classify.totalCalls).toBe(0);
    expect(s.lastRunAt).not.toBeNull();
  });

  it('feature flag ON 결과는 stage별 집계 누적', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '맛집 후기' });
    recordChainedGenRun(r);
    const s = getChainedGenSnapshot();
    expect(s.totalRuns).toBe(1);
    expect(s.enabledRuns).toBe(1);
    expect(s.byStage.classify.totalCalls).toBe(1);
    expect(s.byStage.persona.totalCalls).toBe(1);
    expect(s.byStage.classify.successCount).toBe(1);
    expect(s.byStage.persona.successCount).toBe(1);
    // Stage 3·4·5는 placeholder라 success: false
    expect(s.byStage.draft.failureCount).toBe(1);
    expect(s.byStage.factGate.failureCount).toBe(1);
    expect(s.byStage.optimize.failureCount).toBe(1);
  });

  it('두 번째 호출에서 캐시 hit이 cachedHits에 반영됨', async () => {
    const input = { forceFlag: true, title: '동일 입력', productHint: '카페' };
    const r1 = await runChainedGeneration(input);
    recordChainedGenRun(r1);
    const r2 = await runChainedGeneration(input);
    recordChainedGenRun(r2);

    const s = getChainedGenSnapshot();
    expect(s.byStage.classify.totalCalls).toBe(2);
    expect(s.byStage.classify.cachedHits).toBe(1); // 두 번째 호출만 cached
    expect(s.byStage.persona.cachedHits).toBe(1);
  });

  it('avgPipelineMs는 enabledRuns 기준 평균', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await runChainedGeneration({ forceFlag: true, title: `주제${i}` });
      recordChainedGenRun(r);
    }
    const s = getChainedGenSnapshot();
    expect(s.enabledRuns).toBe(3);
    expect(s.totalPipelineMs).toBeGreaterThanOrEqual(0);
    expect(s.avgPipelineMs).toBeGreaterThanOrEqual(0);
  });
});

describe('getChainedGenSummary — 한 줄 요약', () => {
  beforeEach(() => {
    resetChainedGenMetrics();
    clearAllChainCaches();
  });

  it('호출 0회면 명시 표기', () => {
    expect(getChainedGenSummary()).toMatch(/미사용/);
  });

  it('호출 후 요약에 활성 비율 포함', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '주제' });
    recordChainedGenRun(r);
    const summary = getChainedGenSummary();
    expect(summary).toMatch(/체인:.*1\/1 활성/);
    expect(summary).toMatch(/평균 파이프라인 \d+ms/);
    expect(summary).toMatch(/캐시 hit.*%/);
  });
});

describe('operationsDashboard 통합', () => {
  beforeEach(() => {
    resetAllMetrics();
    resetChainedGenMetrics();
    clearAllChainCaches();
  });

  it('DashboardSnapshot에 chainedGen 필드 포함', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '주제' });
    recordChainedGenRun(r);
    const snap = getDashboardSnapshot();
    expect(snap.chainedGen).toBeDefined();
    expect(snap.chainedGen.totalRuns).toBe(1);
    expect(snap.chainedGen.byStage.classify.totalCalls).toBe(1);
  });

  it('getDashboardSummary 끝부분에 체인 요약 포함 (호출 0회)', () => {
    const summary = getDashboardSummary();
    expect(summary).toMatch(/체인 파이프라인: 미사용/);
  });

  it('getDashboardSummary 끝부분에 체인 요약 포함 (호출 N회)', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '주제' });
    recordChainedGenRun(r);
    const summary = getDashboardSummary();
    expect(summary).toMatch(/체인:.*활성 호출/);
  });
});

describe('resetChainedGenMetrics', () => {
  it('모든 카운터·집계 초기화', async () => {
    const r = await runChainedGeneration({ forceFlag: true, title: '주제' });
    recordChainedGenRun(r);
    resetChainedGenMetrics();
    const s = getChainedGenSnapshot();
    expect(s.totalRuns).toBe(0);
    expect(s.enabledRuns).toBe(0);
    expect(s.byStage.classify.totalCalls).toBe(0);
    expect(s.lastRunAt).toBeNull();
  });
});
