/**
 * SPEC-CONVERSION-001 L2-1.11 — 체인드 파이프라인 E2E 통합 테스트.
 *
 * 시나리오 3건:
 *   1. 정상 흐름 — classify → persona → draft → factGate(pass) → optimize
 *   2. 팩트 게이트 실패 → retry 안내 → draft 재호출
 *   3. Feature flag OFF — 단계 비실행 + 명시 사유 + 대시보드 미카운트
 *
 * 모든 LLM 호출은 Mock provider로 결정론 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runChainedGeneration } from '../content/chainedGeneration';
import { writeDraft, type LLMProvider } from '../content/draftWriter';
import { evaluateFactGate, buildFactGateRetryInstruction } from '../content/factGate';
import { optimizeForConversion } from '../content/conversionOptimizer';
import {
  recordChainedGenRun,
  getChainedGenSnapshot,
  resetChainedGenMetrics,
} from '../monitor/chainedGenMetrics';
import { clearAllChainCaches } from '../content/chainCache';

// 주의: factGate가 "직접 [한글]", "써보니", "테스트해보니" 등 경험 패턴을 unverified로 잡으므로
// 본 테스트 fixture는 의도적으로 그런 패턴을 배제한다.
const longDraft = (label: string) =>
  `# ${label}\n\n` +
  `오늘은 강남 김치찌개 맛집에 들렀어요. 분위기는 깔끔하고 메뉴 구성도 무난했답니다. `.repeat(20);

function fakeProvider(text: string): LLMProvider {
  return { complete: vi.fn(async () => text) };
}

describe('E2E 시나리오 1: 정상 흐름 (5단계 모두 성공)', () => {
  beforeEach(() => {
    resetChainedGenMetrics();
    clearAllChainCaches();
  });

  it('classify → persona → draft → factGate pass → optimize → 메트릭 기록', async () => {
    // Stage 1·2 — 결정론
    const chainResult = await runChainedGeneration({
      forceFlag: true,
      title: '강남 김치찌개 맛집',
      productHint: '한식 맛집',
    });
    expect(chainResult.enabled).toBe(true);
    expect(chainResult.category).toBe('food');
    expect(chainResult.persona.tone).toBe('casual');

    // Stage 3 — Mock LLM으로 본문 생성
    const draftText = longDraft('강남 김치찌개 후기');
    const draftProvider = fakeProvider(draftText);
    const draft = await writeDraft({
      chainResult,
      topic: '강남 김치찌개 맛집 후기',
      minChars: 1000,
      llmProvider: draftProvider,
    });
    expect(draft.draft.length).toBeGreaterThan(800);
    expect(draftProvider.complete).toHaveBeenCalledTimes(1);

    // Stage 4 — 키워드 모드(sourceText 없음)에서 검증 통과
    const gate = evaluateFactGate({ draft: draft.draft });
    expect(gate.passed).toBe(true);

    // Stage 5 — 전환 최적화 퇴고
    const optimizedText = longDraft('강남 김치찌개 후기 — 퇴고 완료');
    const optimizeProvider = fakeProvider(optimizedText);
    const optimized = await optimizeForConversion({
      draft: draft.draft,
      persona: chainResult.persona,
      topic: '강남 김치찌개 맛집 후기',
      llmProvider: optimizeProvider,
    });
    expect(optimized.charCount).toBeGreaterThan(800);
    expect(optimizeProvider.complete).toHaveBeenCalledTimes(1);

    // 메트릭 기록 (호출자 책임)
    recordChainedGenRun(chainResult);
    const snap = getChainedGenSnapshot();
    expect(snap.enabledRuns).toBe(1);
    expect(snap.byStage.classify.successCount).toBe(1);
    expect(snap.byStage.persona.successCount).toBe(1);
  });
});

describe('E2E 시나리오 2: 팩트 게이트 실패 → 재시도', () => {
  beforeEach(() => {
    resetChainedGenMetrics();
    clearAllChainCaches();
  });

  it('sourceText 모드에서 미검증 표현 발견 → retry 안내 → 재생성', async () => {
    const chainResult = await runChainedGeneration({
      forceFlag: true,
      title: '뷰티 크림 후기',
      productHint: '히알루론산 크림',
    });

    // Stage 3 — 원문에 없는 수치 포함된 초안
    const sourceText = '히알루론산 크림. 가격 20,000원. 용량 50ml.';
    const fabricatedDraft =
      '# 후기\n\n' +
      '히알루론산 5,000ppm 함유로 2주간 사용하니 피부가 완전히 달라졌어요. '.repeat(20);
    const provider1 = fakeProvider(fabricatedDraft);
    const draft = await writeDraft({
      chainResult,
      topic: '히알루론산 크림 후기',
      minChars: 1000,
      llmProvider: provider1,
    });

    // Stage 4 — 미검증 환각 표현 탐지 (sourceText 모드)
    const gate = evaluateFactGate({ draft: draft.draft, sourceText });
    expect(gate.passed).toBe(false);
    expect(gate.unverifiedClaims.length).toBeGreaterThan(0);

    // retry 안내 생성
    const retryInstruction = buildFactGateRetryInstruction(gate);
    expect(retryInstruction).toContain('팩트 게이트 검증 실패');
    expect(retryInstruction).toMatch(/검증율 \d+%/);

    // 재시도 — retry 안내를 additionalContext에 주입해 재생성
    // 안전 텍스트: 환각 수치(5,000ppm·2주간) 제거 + 경험·기간 표현 배제
    const safeDraft =
      '# 후기\n\n' +
      '바르고 나면 피부가 부드러워진 느낌이 들어요. 가격은 적당한 편이에요. '.repeat(20);
    const provider2 = fakeProvider(safeDraft);
    const draft2 = await writeDraft({
      chainResult,
      topic: '히알루론산 크림 후기',
      minChars: 1000,
      additionalContext: retryInstruction,
      llmProvider: provider2,
    });

    // 재생성 결과는 환각 수치 미포함
    const gate2 = evaluateFactGate({ draft: draft2.draft, sourceText });
    expect(gate2.passed).toBe(true);
    expect(provider1.complete).toHaveBeenCalledTimes(1);
    expect(provider2.complete).toHaveBeenCalledTimes(1);
  });
});

describe('E2E 시나리오 3: Feature flag OFF (silent 폴백 X)', () => {
  beforeEach(() => {
    resetChainedGenMetrics();
    clearAllChainCaches();
  });

  it('forceFlag=false → enabled=false + 명시 fallbackReason + draft 호출 차단', async () => {
    const chainResult = await runChainedGeneration({ forceFlag: false, title: '주제' });
    expect(chainResult.enabled).toBe(false);
    expect(chainResult.fallbackReason).toMatch(/CHAINED_GEN_V1 미활성화/);
    // metrics는 비활성 상태
    expect(chainResult.metrics).toHaveLength(0);

    // Stage 3 호출 시도하면 명시 throw (silent 폴백 X)
    const provider = fakeProvider('a'.repeat(2000));
    await expect(
      writeDraft({
        chainResult,
        topic: '주제',
        minChars: 1000,
        llmProvider: provider,
      }),
    ).rejects.toThrow(/DRAFT_CHAIN_DISABLED/);

    // 호출자가 메트릭 기록해도 enabledRuns는 증가 안 함
    recordChainedGenRun(chainResult);
    const snap = getChainedGenSnapshot();
    expect(snap.totalRuns).toBe(1);
    expect(snap.enabledRuns).toBe(0);
    expect(snap.byStage.classify.totalCalls).toBe(0);
    expect(snap.byStage.draft.totalCalls).toBe(0);
  });
});
