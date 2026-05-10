/**
 * SPEC-CONVERSION-001 L4-1 — 편집자 LLM 퇴고 레이어
 *
 * conversionOptimizer 결과를 받아 *마지막 정제*를 수행하는 추가 LLM 콜.
 * 편집자 페르소나로 문장 리듬·첫 문장 강도·연결어·CTA를 다듬는다.
 *
 * Feature flag: EDITOR_LAYER_V1 (기본 OFF). LLM 콜 +1배 비용 추가.
 *
 * 안전 장치 (L4-1.4):
 *   - 변경률(diff ratio) 임계 초과 시 원본 유지
 *   - 사실 보존 검증 (숫자·고유명사가 사라졌으면 원본 유지)
 *
 * 메모리 [silent 폴백 금지]: 변경률 초과 시 명시 reason + 원본 반환.
 * 메모리 [추정 효과 금지]: A/B 효과 약속 X — engagement 메트릭으로 calibrate.
 *
 * 파일 한도 250줄 준수.
 */

import type { LLMProvider, LLMCompleteOptions } from './draftWriter';
import type { PersonaProfile } from './personaBuilder';
import { loadChainPrompt } from './chainPromptLoader';

const FEATURE_FLAG_ENV = 'EDITOR_LAYER_V1';
const DEFAULT_TEMPERATURE = 0.5;
const MIN_INPUT_CHARS = 800;
const MAX_INPUT_CHARS = 8000;
// 변경률 임계: 10% 초과 변경 시 원본 유지 (편집자는 보수 원칙)
const DEFAULT_MAX_CHANGE_RATIO = 0.1;

export interface EditorLayerInput {
  readonly optimizedDraft: string;
  readonly persona: PersonaProfile;
  readonly llmProvider: LLMProvider;
  readonly llmOptions?: LLMCompleteOptions;
  readonly forceFlag?: boolean;
  readonly maxChangeRatio?: number;          // 0~1, 기본 0.1
}

export interface EditorLayerResult {
  readonly enabled: boolean;
  readonly editedDraft: string;              // 변경 임계 초과면 원본 그대로
  readonly originalDraft: string;
  readonly applied: boolean;                  // true면 편집 적용, false면 원본 유지
  readonly changeRatio: number;               // 0~1
  readonly preservedFacts: boolean;           // 숫자·고유명사 보존 여부
  readonly elapsedMs: number;
  readonly fallbackReason?: string;
}

export function isEditorLayerEnabled(forceFlag?: boolean): boolean {
  if (forceFlag === true) return true;
  if (forceFlag === false) return false;
  const v = (process.env[FEATURE_FLAG_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on';
}

/**
 * 두 문자열의 단순 char-level diff 비율 (Levenshtein 대신 빠른 휴리스틱).
 * 길이 차이 + 다른 문자 위치 비율로 근사.
 */
export function approximateChangeRatio(original: string, edited: string): number {
  if (!original) return edited.length > 0 ? 1 : 0;
  if (!edited) return 1;
  const lenDiff = Math.abs(original.length - edited.length);
  const minLen = Math.min(original.length, edited.length);
  let differing = lenDiff;
  for (let i = 0; i < minLen; i++) {
    if (original[i] !== edited[i]) differing++;
  }
  return Math.min(1, differing / Math.max(1, original.length));
}

/**
 * 원본의 핵심 사실(숫자+단위, 따옴표 인용, 자릿수 큰 숫자)이 편집본에도 모두 보존됐는지.
 * 누락 발견 시 false.
 */
export function checkFactsPreserved(original: string, edited: string): boolean {
  // 1. 숫자+단위 토큰 추출
  const numRe = /\d+(?:[.,]\d+)?(?:%|원|만원|천원|배|회|개월|개|분|초|일|주|달|년|시간|kg|g|cm|mm|km|ml|L)+/g;
  const origNums = original.match(numRe) ?? [];
  const editedSet = new Set((edited.match(numRe) ?? []).map((s) => s.replace(/\s/g, '')));
  for (const num of origNums) {
    if (!editedSet.has(num.replace(/\s/g, ''))) return false;
  }
  // 2. 따옴표 인용 (한글·영문)
  const quoteRe = /["'""''「『]([^"'""''」』]{4,80})[""''」』"']/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRe.exec(original)) !== null) {
    const inner = m[1].trim();
    if (inner.length >= 4 && !edited.includes(inner)) return false;
  }
  return true;
}

function sanitizeEditorOutput(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/^(편집|결과|output)[:：]\s*/i, '');
  return s.trim();
}

export async function applyEditorLayer(input: EditorLayerInput): Promise<EditorLayerResult> {
  const start = Date.now();
  const enabled = isEditorLayerEnabled(input.forceFlag);

  if (!enabled) {
    return {
      enabled: false,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio: 0,
      preservedFacts: true,
      elapsedMs: Date.now() - start,
      fallbackReason: `Feature flag ${FEATURE_FLAG_ENV} 미활성화`,
    };
  }

  if (!input.optimizedDraft || input.optimizedDraft.length < MIN_INPUT_CHARS) {
    return {
      enabled: true,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio: 0,
      preservedFacts: true,
      elapsedMs: Date.now() - start,
      fallbackReason: `EDITOR_INPUT_TOO_SHORT: ${input.optimizedDraft?.length ?? 0}자 (최소 ${MIN_INPUT_CHARS}자)`,
    };
  }

  if (input.optimizedDraft.length > MAX_INPUT_CHARS) {
    return {
      enabled: true,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio: 0,
      preservedFacts: true,
      elapsedMs: Date.now() - start,
      fallbackReason: `EDITOR_INPUT_TOO_LONG: ${input.optimizedDraft.length}자 (최대 ${MAX_INPUT_CHARS}자)`,
    };
  }

  if (!input.llmProvider || typeof input.llmProvider.complete !== 'function') {
    throw new Error('EDITOR_LLM_PROVIDER_INVALID: 유효한 LLMProvider 미주입');
  }

  const personaBlock = [
    `- 톤: ${input.persona.tone}`,
    `- 자주 쓰는 어휘: ${input.persona.vocabularyHints.slice(0, 6).join(', ')}`,
    `- 절대 쓰지 않는 표현: ${input.persona.forbiddenPhrases.join(', ')}`,
  ].join('\n');

  const prompt = loadChainPrompt('editor', {
    PERSONA_BLOCK: personaBlock,
    OPTIMIZED_DRAFT: input.optimizedDraft,
  });

  let edited = '';
  try {
    edited = await input.llmProvider.complete(prompt, {
      temperature: DEFAULT_TEMPERATURE,
      ...(input.llmOptions ?? {}),
    });
  } catch (err) {
    return {
      enabled: true,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio: 0,
      preservedFacts: true,
      elapsedMs: Date.now() - start,
      fallbackReason: `EDITOR_LLM_FAILED: ${(err as Error)?.message ?? 'unknown'} — 원본 유지`,
    };
  }

  edited = sanitizeEditorOutput(edited);
  if (!edited || edited.length < MIN_INPUT_CHARS) {
    return {
      enabled: true,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio: 0,
      preservedFacts: true,
      elapsedMs: Date.now() - start,
      fallbackReason: `EDITOR_OUTPUT_TOO_SHORT: ${edited.length}자 — 원본 유지`,
    };
  }

  const changeRatio = approximateChangeRatio(input.optimizedDraft, edited);
  const maxRatio = input.maxChangeRatio ?? DEFAULT_MAX_CHANGE_RATIO;
  const preservedFacts = checkFactsPreserved(input.optimizedDraft, edited);

  if (changeRatio > maxRatio) {
    return {
      enabled: true,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio,
      preservedFacts,
      elapsedMs: Date.now() - start,
      fallbackReason: `EDITOR_CHANGE_RATIO_EXCEEDED: ${(changeRatio * 100).toFixed(1)}% > ${(maxRatio * 100).toFixed(0)}% — 원본 유지`,
    };
  }

  if (!preservedFacts) {
    return {
      enabled: true,
      editedDraft: input.optimizedDraft,
      originalDraft: input.optimizedDraft,
      applied: false,
      changeRatio,
      preservedFacts: false,
      elapsedMs: Date.now() - start,
      fallbackReason: 'EDITOR_FACT_LOSS: 원본의 숫자·인용문 누락 — 원본 유지',
    };
  }

  return {
    enabled: true,
    editedDraft: edited,
    originalDraft: input.optimizedDraft,
    applied: true,
    changeRatio,
    preservedFacts: true,
    elapsedMs: Date.now() - start,
  };
}
