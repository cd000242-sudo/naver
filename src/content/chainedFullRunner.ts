/**
 * SPEC-CONVERSION-001 — 전체 5단계 + 편집자 통합 러너
 *
 * runChainedDraft (Stage 1·2·3) + factGate (Stage 4) + conversionOptimizer (Stage 5)
 * + applyEditorLayer (L4-1)을 한 함수로 묶는다.
 *
 * 호출자는 LLM provider만 주입하면 *전체 5단계 + 편집자 퇴고*를 한 번에 실행.
 * 각 stage의 flag·실패는 결과 객체로 명시 노출 — silent 폴백 X.
 *
 * Stage 4(factGate) 동작:
 *   - sourceText가 있으면 검증 → 실패 시 retry hint를 호출자에게 노출 (재생성은 호출자 책임)
 *   - sourceText 없으면 검증 스킵
 *
 * 메모리 [silent 폴백 금지]: 각 stage의 결과·실패 사유 모두 보존.
 * 메모리 [추정 효과 금지]: 활성화 시 효과 약속 X.
 *
 * 파일 한도 250줄 준수.
 */

import {
  runChainedDraft,
  type ChainedDraftRunnerInput,
  type ChainedDraftRunnerResult,
} from './chainedDraftRunner';
import {
  evaluateFactGate,
  buildFactGateRetryInstruction,
  type FactGateResult,
} from './factGate';
import {
  optimizeForConversion,
  type ConversionOptimizerInput,
  type OptimizedResult,
  type SocialProofData,
} from './conversionOptimizer';
import {
  applyEditorLayer,
  type EditorLayerResult,
} from './editorLayer';
import type { LLMProvider, LLMCompleteOptions } from './draftWriter';

export interface ChainedFullRunnerInput extends ChainedDraftRunnerInput {
  /** Stage 4 검증을 위한 원문 텍스트. 없으면 키워드 모드(experience 검증만). */
  readonly sourceText?: string;
  /** Stage 5 사회적 증거 (review 수·평점 등). */
  readonly socialProof?: SocialProofData;
  /** Stage 5 LLM 옵션 (Stage 3와 다른 모델 쓰고 싶을 때). 미주입 시 llmOptions 재사용. */
  readonly optimizerLLMOptions?: LLMCompleteOptions;
  /** 편집자 LLM 옵션. 미주입 시 llmOptions 재사용. */
  readonly editorLLMOptions?: LLMCompleteOptions;
  /** 편집자 활성 강제. 미지정 시 EDITOR_LAYER_V1 env 따름. */
  readonly editorForceFlag?: boolean;
  /** 편집자 변경률 임계 (기본 0.1). */
  readonly editorMaxChangeRatio?: number;
}

export interface ChainedFullRunnerResult {
  readonly draft: ChainedDraftRunnerResult;
  readonly factGate: FactGateResult;
  readonly factGateRetryInstruction: string;       // 검증 실패 시 retry 안내문 (통과 시 빈 문자열)
  readonly optimized: OptimizedResult | null;      // factGate 실패 시 null
  readonly edited: EditorLayerResult | null;        // optimizer 실패·미실행 시 null
  readonly finalContent: string;                    // 가장 마지막 단계의 본문 (편집 미적용·미실행이면 optimized·draft fallback)
  readonly stagesCompleted: readonly ('draft' | 'factGate' | 'optimize' | 'editor')[];
  readonly fallbackReason?: string;                 // 어느 단계에서 멈췄는지
}

export async function runChainedFull(
  input: ChainedFullRunnerInput,
): Promise<ChainedFullRunnerResult> {
  const stagesCompleted: ('draft' | 'factGate' | 'optimize' | 'editor')[] = [];

  // Stage 1·2·3
  const draft = await runChainedDraft(input);
  stagesCompleted.push('draft');

  // Stage 4 — factGate
  const gate = evaluateFactGate({
    draft: draft.draft.draft,
    sourceText: input.sourceText,
  });
  stagesCompleted.push('factGate');
  const retryInstruction = buildFactGateRetryInstruction(gate);

  if (!gate.passed) {
    return {
      draft,
      factGate: gate,
      factGateRetryInstruction: retryInstruction,
      optimized: null,
      edited: null,
      finalContent: draft.draft.draft,   // 편집 미적용, 초안 그대로 반환
      stagesCompleted,
      fallbackReason: `STAGE4_FACT_GATE_FAILED: ${gate.reason ?? '검증 실패'}`,
    };
  }

  // Stage 5 — conversionOptimizer
  let optimized: OptimizedResult;
  try {
    const optInput: ConversionOptimizerInput = {
      draft: draft.draft.draft,
      persona: draft.chainResult.persona,
      topic: input.topic,
      socialProof: input.socialProof,
      llmProvider: input.llmProvider,
      llmOptions: input.optimizerLLMOptions ?? input.llmOptions,
    };
    optimized = await optimizeForConversion(optInput);
    stagesCompleted.push('optimize');
  } catch (err) {
    return {
      draft,
      factGate: gate,
      factGateRetryInstruction: retryInstruction,
      optimized: null,
      edited: null,
      finalContent: draft.draft.draft,
      stagesCompleted,
      fallbackReason: `STAGE5_OPTIMIZE_FAILED: ${(err as Error)?.message ?? 'unknown'}`,
    };
  }

  // L4-1 — editorLayer (옵션)
  let edited: EditorLayerResult | null = null;
  try {
    edited = await applyEditorLayer({
      optimizedDraft: optimized.optimized,
      persona: draft.chainResult.persona,
      llmProvider: input.llmProvider,
      llmOptions: input.editorLLMOptions ?? input.llmOptions,
      forceFlag: input.editorForceFlag,
      maxChangeRatio: input.editorMaxChangeRatio,
    });
    if (edited.applied) stagesCompleted.push('editor');
  } catch (err) {
    // editor는 보조 단계 — throw 잡고 명시 reason
    return {
      draft,
      factGate: gate,
      factGateRetryInstruction: retryInstruction,
      optimized,
      edited: null,
      finalContent: optimized.optimized,
      stagesCompleted,
      fallbackReason: `EDITOR_LAYER_THREW: ${(err as Error)?.message ?? 'unknown'}`,
    };
  }

  // 최종 콘텐츠: edited.applied=true면 edited, 아니면 optimized
  const finalContent = edited && edited.applied ? edited.editedDraft : optimized.optimized;

  return {
    draft,
    factGate: gate,
    factGateRetryInstruction: retryInstruction,
    optimized,
    edited,
    finalContent,
    stagesCompleted,
  };
}

/**
 * 한 줄 요약 — 운영 로그용.
 */
export function summarizeFullRun(r: ChainedFullRunnerResult): string {
  const parts: string[] = [
    `chainedFull: ${r.stagesCompleted.join('→')}`,
    `${r.finalContent.length}자`,
  ];
  if (r.fallbackReason) parts.push(`fallback: ${r.fallbackReason}`);
  if (r.edited?.applied) parts.push(`editor +${(r.edited.changeRatio * 100).toFixed(1)}%`);
  return parts.join(' | ');
}
