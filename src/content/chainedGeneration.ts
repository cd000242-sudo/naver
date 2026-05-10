/**
 * SPEC-CONVERSION-001 L2-1.1 — 5단계 체인드 LLM 파이프라인 오케스트레이터
 *
 * 단일 LLM 콜로 모든 것을 처리하는 기존 단점 해소:
 *   1. classify    — 카테고리 분류 (categoryClassifier, 결정론·LLM 0)
 *   2. persona     — 작성자 페르소나 (personaBuilder, 결정론·LLM 0)
 *   3. draft       — 본문 초안 (draftWriter, LLM 1콜)              [placeholder]
 *   4. factGate    — 팩트 검증 (factGate + REVIEW-001 factChecker)  [placeholder]
 *   5. optimize    — 전환 최적화 퇴고 (conversionOptimizer, LLM 1콜) [placeholder]
 *
 * Feature flag: `CHAINED_GEN_V1` — 환경변수 또는 source 옵션. 기본 OFF.
 * OFF면 기존 generateStructuredContent 흐름 그대로 (silent 폴백 X — 사용자 사전 설정).
 *
 * 본 모듈은 골격만 제공. stage 3~5의 LLM 호출은 후속 task에서 채워짐.
 *
 * 메모리 원칙:
 *   - silent 폴백 금지: 각 stage 실패 시 명시 오류 + 호출자가 결정
 *   - 추정 효과 금지: A/B 결과 약속 안 함, 운영 메트릭으로만 검증
 *   - 파일 한도 250줄 준수
 */

import type { PersonaCategory, PersonaProfile } from './personaBuilder';
import { buildPersona, buildPersonaPromptBlock } from './personaBuilder';
import { classifyCategory } from './categoryClassifier';
import {
  classifyCache,
  personaCache,
  buildClassifyKey,
  buildPersonaKey,
} from './chainCache';

export interface ChainedSourceInput {
  readonly title?: string;
  readonly rawText?: string;
  readonly productHint?: string;
  readonly existingHint?: string;
  readonly userVoice?: readonly string[]; // REVIEW-001 P1 통합 후 활용
  readonly toneOverride?: PersonaProfile['tone'];
  readonly minChars?: number;
  readonly forceFlag?: boolean; // 테스트용 — feature flag 강제 ON
}

export interface ChainedStageMetric {
  readonly stage: 'classify' | 'persona' | 'draft' | 'factGate' | 'optimize';
  readonly elapsedMs: number;
  readonly success: boolean;
  readonly note?: string;
}

export interface ChainedGenerationResult {
  readonly enabled: boolean;
  readonly category: PersonaCategory;
  readonly persona: PersonaProfile;
  readonly draft?: string;
  readonly factGatePassed?: boolean;
  readonly optimizedDraft?: string;
  readonly metrics: readonly ChainedStageMetric[];
  readonly fallbackReason?: string;
}

const FEATURE_FLAG_ENV = 'CHAINED_GEN_V1';

export function isChainedGenEnabled(forceFlag?: boolean): boolean {
  if (forceFlag === true) return true;
  if (forceFlag === false) return false;
  const envVal = (process.env[FEATURE_FLAG_ENV] ?? '').toLowerCase().trim();
  return envVal === '1' || envVal === 'true' || envVal === 'on';
}

/**
 * 5단계 파이프라인 골격. stage 3~5는 placeholder.
 * 호출자(contentGenerator)가 본 함수를 isChainedGenEnabled() true 시점에만 호출.
 */
export async function runChainedGeneration(input: ChainedSourceInput): Promise<ChainedGenerationResult> {
  const enabled = isChainedGenEnabled(input.forceFlag);
  const metrics: ChainedStageMetric[] = [];

  if (!enabled) {
    // Feature flag OFF — 호출자에게 명시 반환, silent 폴백 X
    return {
      enabled: false,
      category: 'general',
      persona: buildPersona({ category: 'general' }),
      metrics,
      fallbackReason: `Feature flag ${FEATURE_FLAG_ENV} 미활성화 — 기존 단일 콜 사용`,
    };
  }

  // ── Stage 1: 카테고리 분류 (결정론, LLM 없음, 캐시 가능) ───
  const stage1Start = Date.now();
  const classifyInput = {
    title: input.title,
    rawText: input.rawText,
    productHint: input.productHint,
    existingHint: input.existingHint,
  };
  const classifyKey = buildClassifyKey(classifyInput);
  let classifyResult = classifyCache.get(classifyKey);
  let classifyCacheHit = false;
  if (classifyResult) {
    classifyCacheHit = true;
  } else {
    classifyResult = classifyCategory(classifyInput);
    classifyCache.set(classifyKey, classifyResult);
  }
  metrics.push({
    stage: 'classify',
    elapsedMs: Date.now() - stage1Start,
    success: true,
    note: `${classifyResult.category} (confidence ${classifyResult.confidence.toFixed(2)}, source ${classifyResult.source}${classifyCacheHit ? ', cached' : ''})`,
  });

  // ── Stage 2: 페르소나 빌더 (결정론, LLM 없음, 캐시 가능) ───
  const stage2Start = Date.now();
  const personaInput = {
    category: classifyResult.category,
    productHint: input.productHint,
    toneOverride: input.toneOverride,
    userVoice: input.userVoice,
  };
  const personaKey = buildPersonaKey(personaInput);
  let persona = personaCache.get(personaKey);
  let personaCacheHit = false;
  if (persona) {
    personaCacheHit = true;
  } else {
    persona = buildPersona(personaInput);
    personaCache.set(personaKey, persona);
  }
  metrics.push({
    stage: 'persona',
    elapsedMs: Date.now() - stage2Start,
    success: true,
    note: `${persona.name} / ${persona.tone}${personaCacheHit ? ' (cached)' : ''}`,
  });

  // ── Stage 3: 본문 초안 (LLM 1콜) — placeholder ───────────
  // 후속 task L2-1.4: src/content/draftWriter.ts 신설.
  // 구현 전이므로 본 stage는 'pending' 상태로 명시.
  const stage3Start = Date.now();
  const draft: string | undefined = undefined; // placeholder
  metrics.push({
    stage: 'draft',
    elapsedMs: Date.now() - stage3Start,
    success: false,
    note: 'placeholder — L2-1.4 draftWriter 미구현',
  });

  // ── Stage 4: 팩트 게이트 (REVIEW-001 factChecker 의존) — placeholder ──
  // 후속 task L2-1.5: src/content/factGate.ts 신설 + REVIEW-001 P3 의존.
  const stage4Start = Date.now();
  const factGatePassed: boolean | undefined = undefined; // placeholder
  metrics.push({
    stage: 'factGate',
    elapsedMs: Date.now() - stage4Start,
    success: false,
    note: 'placeholder — L2-1.5 factGate + REVIEW-001 P3 의존',
  });

  // ── Stage 5: 전환 최적화 퇴고 (LLM 1콜) — placeholder ───
  // 후속 task L2-1.6: src/content/conversionOptimizer.ts 신설.
  const stage5Start = Date.now();
  const optimizedDraft: string | undefined = undefined; // placeholder
  metrics.push({
    stage: 'optimize',
    elapsedMs: Date.now() - stage5Start,
    success: false,
    note: 'placeholder — L2-1.6 conversionOptimizer 미구현',
  });

  return {
    enabled: true,
    category: classifyResult.category,
    persona,
    draft,
    factGatePassed,
    optimizedDraft,
    metrics,
  };
}

/**
 * 호출자가 stage 3 LLM 프롬프트를 조립할 때 사용할 컨텍스트 블록.
 * stage 1·2 결과를 LLM에게 전달하기 위한 프롬프트 텍스트.
 */
export function buildStage3Context(result: ChainedGenerationResult, additionalContext?: string): string {
  const parts: string[] = [
    `## [Stage 1 — 카테고리 분류 결과]`,
    `- 카테고리: ${result.category}`,
    '',
    buildPersonaPromptBlock(result.persona),
  ];
  if (additionalContext) {
    parts.push('', '## [추가 컨텍스트]', additionalContext);
  }
  return parts.join('\n');
}

/**
 * Stage 1·2만 동기 실행 — finalize 같은 sync 컨텍스트에서 메트릭만 수집할 때.
 * Stage 3~5는 동기 호출 시 placeholder로 채워짐. LLM 호출 통합 후엔 async 사용.
 */
export function runChainedGenerationSync(input: ChainedSourceInput): ChainedGenerationResult {
  const enabled = isChainedGenEnabled(input.forceFlag);
  const metrics: ChainedStageMetric[] = [];

  if (!enabled) {
    return {
      enabled: false,
      category: 'general',
      persona: buildPersona({ category: 'general' }),
      metrics,
      fallbackReason: `Feature flag ${FEATURE_FLAG_ENV} 미활성화 — 기존 단일 콜 사용`,
    };
  }

  const stage1Start = Date.now();
  const classifyInputSync = {
    title: input.title, rawText: input.rawText,
    productHint: input.productHint, existingHint: input.existingHint,
  };
  const classifyKey = buildClassifyKey(classifyInputSync);
  let classifyResult = classifyCache.get(classifyKey);
  let classifyCacheHit = false;
  if (classifyResult) {
    classifyCacheHit = true;
  } else {
    classifyResult = classifyCategory(classifyInputSync);
    classifyCache.set(classifyKey, classifyResult);
  }
  metrics.push({
    stage: 'classify', elapsedMs: Date.now() - stage1Start, success: true,
    note: `${classifyResult.category} (${classifyResult.confidence.toFixed(2)}${classifyCacheHit ? ', cached' : ''})`,
  });

  const stage2Start = Date.now();
  const personaInputSync = {
    category: classifyResult.category, productHint: input.productHint,
    toneOverride: input.toneOverride, userVoice: input.userVoice,
  };
  const personaKey = buildPersonaKey(personaInputSync);
  let persona = personaCache.get(personaKey);
  let personaCacheHit = false;
  if (persona) {
    personaCacheHit = true;
  } else {
    persona = buildPersona(personaInputSync);
    personaCache.set(personaKey, persona);
  }
  metrics.push({
    stage: 'persona', elapsedMs: Date.now() - stage2Start, success: true,
    note: `${persona.name} / ${persona.tone}${personaCacheHit ? ' (cached)' : ''}`,
  });

  metrics.push({ stage: 'draft', elapsedMs: 0, success: false, note: 'placeholder (sync)' });
  metrics.push({ stage: 'factGate', elapsedMs: 0, success: false, note: 'placeholder (sync)' });
  metrics.push({ stage: 'optimize', elapsedMs: 0, success: false, note: 'placeholder (sync)' });

  return { enabled: true, category: classifyResult.category, persona, metrics };
}

/**
 * 메트릭 요약 — operationsDashboard에 노출하기 위한 형태.
 * 후속 task L2-1.10 (단계별 비용/지연 메트릭)에서 활용.
 */
export function summarizeMetrics(result: ChainedGenerationResult): {
  totalElapsedMs: number;
  successfulStages: number;
  totalStages: number;
} {
  const totalElapsedMs = result.metrics.reduce((sum, m) => sum + m.elapsedMs, 0);
  const successfulStages = result.metrics.filter((m) => m.success).length;
  return {
    totalElapsedMs,
    successfulStages,
    totalStages: result.metrics.length,
  };
}
