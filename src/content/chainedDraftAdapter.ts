/**
 * SPEC-CONVERSION-001 — chainedDraftRunner 운영 어댑터
 *
 * contentGenerator의 affiliate 흐름이 *Stage 3 LLM 호출*을 chainedDraftRunner로
 * 위임하기 위한 얇은 진입점. 별도 flag(CHAINED_DRAFT_V1) ON일 때만 활성.
 *
 * Why 별도 flag:
 *   - CHAINED_GEN_V1은 *Stage 1·2 메트릭 수집*만 켜는 flag (현재 활성)
 *   - CHAINED_DRAFT_V1은 *Stage 3 LLM 진입*까지 가는 flag (비용 ×3~5)
 *   - 사용자가 메트릭만 보고 본문 LLM은 그대로 둘 수 있도록 분리
 *
 * 본 모듈은 *진입 분기*만 책임. 실제 5단계 흐름은 chainedDraftRunner.
 *
 * 메모리 [silent 폴백 금지]: flag OFF면 명시 null 반환 — 호출자가 분기.
 * 메모리 [추정 효과 금지]: 활성화 시 효과 약속 X.
 *
 * 파일 한도 100줄 준수.
 */

import {
  runChainedDraft,
  type ChainedDraftRunnerInput,
  type ChainedDraftRunnerResult,
} from './chainedDraftRunner';

const ENTRY_FLAG_ENV = 'CHAINED_DRAFT_V1';

export function isChainedDraftEntryEnabled(forceFlag?: boolean): boolean {
  if (forceFlag === true) return true;
  if (forceFlag === false) return false;
  const v = (process.env[ENTRY_FLAG_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on';
}

export interface ChainedDraftEntryInput extends ChainedDraftRunnerInput {
  /** 본 입력은 chainedDraftRunner 입력과 동일. forceEntryFlag로 진입 강제 가능 (테스트용). */
  readonly forceEntryFlag?: boolean;
}

export interface ChainedDraftEntryResult {
  readonly entryEnabled: boolean;
  readonly result: ChainedDraftRunnerResult | null;
  readonly fallbackReason?: string;
}

/**
 * Stage 3 LLM 진입 어댑터. 호출자(contentGenerator)는 본 함수를 옵트인 호출.
 * 결과가 null이면 호출자는 기존 단일 LLM 콜 흐름 그대로 사용.
 */
export async function maybeRunChainedDraft(
  input: ChainedDraftEntryInput,
): Promise<ChainedDraftEntryResult> {
  if (!isChainedDraftEntryEnabled(input.forceEntryFlag)) {
    return {
      entryEnabled: false,
      result: null,
      fallbackReason: `Feature flag ${ENTRY_FLAG_ENV} 미활성화 — 기존 흐름 유지`,
    };
  }

  try {
    const r = await runChainedDraft(input);
    return { entryEnabled: true, result: r };
  } catch (err) {
    // chainedDraftRunner는 CHAINED_GEN_V1 OFF·LLM 실패 시 throw — 호출자에게 명시 reason
    return {
      entryEnabled: true,
      result: null,
      fallbackReason: `CHAINED_DRAFT_FAILED: ${(err as Error)?.message ?? 'unknown'}`,
    };
  }
}
