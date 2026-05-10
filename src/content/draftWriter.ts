/**
 * SPEC-CONVERSION-001 L2-1.4 — Stage 3: 본문 초안 생성 어댑터
 *
 * 5단계 체인드 파이프라인의 Stage 3.
 * Stage 1·2 결과(buildStage3Context)와 사용자 주제를 받아 LLM에 본문 초안을 요청.
 *
 * 설계 원칙:
 *   - Dependency Injection: LLMProvider 인터페이스를 호출자가 주입 (테스트 용이)
 *   - 본 모듈은 LLM provider 구현 X — Gemini/Claude/OpenAI는 호출자(contentGenerator) 책임
 *   - 메모리 [silent 폴백 금지]: LLM 실패 시 명시 throw, 호출자가 재시도/모달/취소 결정
 *   - 파일 한도 200줄 준수
 */

import type { ChainedGenerationResult } from './chainedGeneration';
import { buildStage3Context } from './chainedGeneration';
import { loadChainPrompt } from './chainPromptLoader';

export interface LLMProvider {
  complete(prompt: string, options?: LLMCompleteOptions): Promise<string>;
}

export interface LLMCompleteOptions {
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly model?: string;
}

export interface DraftWriterInput {
  readonly chainResult: ChainedGenerationResult;
  readonly topic: string;
  readonly minChars: number;
  readonly maxChars?: number;
  readonly additionalContext?: string;
  readonly llmProvider: LLMProvider;
  readonly llmOptions?: LLMCompleteOptions;
}

export interface DraftResult {
  readonly draft: string;
  readonly charCount: number;
  readonly promptUsed: string;
  readonly elapsedMs: number;
}

const MIN_CHARS_FLOOR = 800;
const MAX_CHARS_CEIL = 6000;
const DEFAULT_TEMPERATURE = 0.7;

export function buildDraftPrompt(input: Omit<DraftWriterInput, 'llmProvider' | 'llmOptions'>): string {
  const ctxBlock = buildStage3Context(input.chainResult, input.additionalContext);
  const minChars = Math.max(MIN_CHARS_FLOOR, Math.min(MAX_CHARS_CEIL, input.minChars));
  const maxChars = input.maxChars
    ? Math.max(minChars, Math.min(MAX_CHARS_CEIL, input.maxChars))
    : Math.min(MAX_CHARS_CEIL, minChars + 1000);

  return loadChainPrompt('stage3_draft', {
    STAGE12_CONTEXT: ctxBlock,
    TOPIC: input.topic,
    MIN_CHARS: String(minChars),
    MAX_CHARS: String(maxChars),
  });
}

export async function writeDraft(input: DraftWriterInput): Promise<DraftResult> {
  if (!input.chainResult.enabled) {
    throw new Error('DRAFT_CHAIN_DISABLED: chainedGeneration이 비활성화 상태입니다. feature flag CHAINED_GEN_V1을 확인하세요.');
  }
  if (!input.topic || !input.topic.trim()) {
    throw new Error('DRAFT_TOPIC_EMPTY: 주제(topic)가 비어 있습니다.');
  }
  if (!input.llmProvider || typeof input.llmProvider.complete !== 'function') {
    throw new Error('DRAFT_LLM_PROVIDER_INVALID: 유효한 LLMProvider가 주입되지 않았습니다.');
  }

  const prompt = buildDraftPrompt({
    chainResult: input.chainResult,
    topic: input.topic,
    minChars: input.minChars,
    maxChars: input.maxChars,
    additionalContext: input.additionalContext,
  });

  const start = Date.now();
  let draftText = '';
  try {
    draftText = await input.llmProvider.complete(prompt, {
      temperature: DEFAULT_TEMPERATURE,
      ...(input.llmOptions ?? {}),
    });
  } catch (err) {
    // silent 폴백 X — 호출자에게 명시 throw
    throw new Error(`DRAFT_LLM_FAILED: ${(err as Error)?.message ?? '알 수 없는 LLM 오류'}`);
  }
  const elapsed = Date.now() - start;

  const sanitizedDraft = sanitizeDraftOutput(draftText);
  if (!sanitizedDraft || sanitizedDraft.length < MIN_CHARS_FLOOR) {
    throw new Error(`DRAFT_TOO_SHORT: 초안 ${sanitizedDraft.length}자 (최소 ${MIN_CHARS_FLOOR}자) — LLM 응답이 비정상`);
  }

  return {
    draft: sanitizedDraft,
    charCount: sanitizedDraft.length,
    promptUsed: prompt,
    elapsedMs: elapsed,
  };
}

/**
 * LLM이 가끔 메타 설명·코드블록·과한 빈 줄을 섞어 반환하는 경우 정제.
 * 본 모듈은 *최소* 정제만 — 본격 후처리는 conversionOptimizer (Stage 5).
 */
function sanitizeDraftOutput(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  // 코드블록 (```...```) 제거
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '');
  // 과한 빈 줄 (3+ 연속 \n) 정리
  s = s.replace(/\n{3,}/g, '\n\n');
  // 메타 머리말 ("초안:", "결과:", "===" 등)
  s = s.replace(/^(초안|결과|답변|output)[:：]\s*/i, '');
  return s.trim();
}
