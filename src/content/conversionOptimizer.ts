/**
 * SPEC-CONVERSION-001 L2-1.6 — Stage 5: 전환 최적화 퇴고
 *
 * 5단계 체인드 파이프라인의 마지막 stage.
 * Stage 3·4를 통과한 본문 초안을 받아 *구매 전환률 높이는 퇴고*를 수행한다.
 *
 * 퇴고 영역 (5종):
 *   1. 도입부 후크 강화 — 첫 100자 안에 독자 멈춤 패턴
 *   2. 사회적 증거 자연 삽입 — "리뷰 N건" 같은 데이터 기반 (있을 때만)
 *   3. 결정 마찰 제거 — "고민됐는데 ___ 였어요" 패턴
 *   4. CTA 최적화 — 결론 마지막 1~2문장
 *   5. 페르소나 톤 일관성 재검증 (마지막 문장까지)
 *
 * 메모리 [silent 폴백 금지]: 사용자 사전 설정된 엔진/모델만 사용. CTA 강압·과장 금지.
 * 메모리 [추정 효과 금지]: "전환율 +N%" 약속 X — 운영 메트릭으로만 calibrate.
 */

import type { LLMProvider, LLMCompleteOptions } from './draftWriter';
import type { PersonaProfile } from './personaBuilder';
import { loadChainPrompt } from './chainPromptLoader';

export interface ConversionOptimizerInput {
  readonly draft: string;
  readonly persona: PersonaProfile;
  readonly topic: string;
  readonly socialProof?: SocialProofData;
  readonly llmProvider: LLMProvider;
  readonly llmOptions?: LLMCompleteOptions;
}

export interface SocialProofData {
  readonly reviewCount?: number;
  readonly avgRating?: number;
  readonly purchaseCount?: number;
  readonly trustQuotes?: readonly string[]; // 실제 댓글·후기 인용 (REVIEW-001 P1)
}

export interface OptimizedResult {
  readonly optimized: string;
  readonly charCount: number;
  readonly hookFirst100: string;
  readonly ctaLine: string;
  readonly elapsedMs: number;
  readonly appliedFixes: readonly string[];
}

const MAX_DRAFT_CHARS = 8000;
const MIN_DRAFT_CHARS = 800;
const DEFAULT_TEMPERATURE = 0.6;

export function buildOptimizerPrompt(input: Omit<ConversionOptimizerInput, 'llmProvider' | 'llmOptions'>): string {
  const { draft, persona, topic, socialProof } = input;

  const personaBlock = [
    '## [작성자 페르소나 — 일관성 유지 필수]',
    `- 톤: ${persona.tone}`,
    `- 자주 쓰는 어휘: ${persona.vocabularyHints.slice(0, 6).join(', ')}`,
    `- 절대 쓰지 않는 표현: ${persona.forbiddenPhrases.join(', ')}`,
  ].join('\n');

  const proofBlock = buildSocialProofBlock(socialProof);

  return loadChainPrompt('stage5_optimize', {
    PERSONA_BLOCK: personaBlock,
    TOPIC: topic,
    PROOF_BLOCK: proofBlock,
    DRAFT: draft,
  });
}

function buildSocialProofBlock(proof?: SocialProofData): string {
  if (!proof) {
    return '## [실제 데이터]\n(데이터 없음 — 사회적 증거 추가 금지, 환각 차단)';
  }
  const lines: string[] = ['## [실제 데이터 — 본문에 자연스럽게 1~2회 인용 가능]'];
  if (proof.reviewCount !== undefined) lines.push(`- 리뷰 수: ${proof.reviewCount.toLocaleString()}건`);
  if (proof.avgRating !== undefined) lines.push(`- 평균 평점: ${proof.avgRating.toFixed(1)}점/5점`);
  if (proof.purchaseCount !== undefined) lines.push(`- 구매 수: ${proof.purchaseCount.toLocaleString()}건`);
  if (proof.trustQuotes && proof.trustQuotes.length > 0) {
    lines.push('- 실제 후기 인용 (수정 X, 그대로 사용):');
    for (const q of proof.trustQuotes.slice(0, 5)) {
      lines.push(`  • "${q}"`);
    }
  }
  return lines.join('\n');
}

export async function optimizeForConversion(input: ConversionOptimizerInput): Promise<OptimizedResult> {
  if (!input.draft || input.draft.length < MIN_DRAFT_CHARS) {
    throw new Error(`OPT_DRAFT_TOO_SHORT: 초안 ${input.draft?.length ?? 0}자 (최소 ${MIN_DRAFT_CHARS}자)`);
  }
  if (input.draft.length > MAX_DRAFT_CHARS) {
    throw new Error(`OPT_DRAFT_TOO_LONG: 초안 ${input.draft.length}자 (최대 ${MAX_DRAFT_CHARS}자)`);
  }
  if (!input.llmProvider || typeof input.llmProvider.complete !== 'function') {
    throw new Error('OPT_LLM_PROVIDER_INVALID: 유효한 LLMProvider 미주입');
  }

  const prompt = buildOptimizerPrompt({
    draft: input.draft,
    persona: input.persona,
    topic: input.topic,
    socialProof: input.socialProof,
  });

  const start = Date.now();
  let optimized = '';
  try {
    optimized = await input.llmProvider.complete(prompt, {
      temperature: DEFAULT_TEMPERATURE,
      ...(input.llmOptions ?? {}),
    });
  } catch (err) {
    throw new Error(`OPT_LLM_FAILED: ${(err as Error)?.message ?? '알 수 없는 LLM 오류'}`);
  }
  const elapsed = Date.now() - start;

  optimized = optimized.trim().replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '');
  if (!optimized || optimized.length < MIN_DRAFT_CHARS) {
    throw new Error(`OPT_RESULT_TOO_SHORT: 퇴고 결과 ${optimized.length}자 — LLM 응답 비정상`);
  }

  const appliedFixes = detectAppliedFixes(input.draft, optimized, input.persona);
  const hookFirst100 = optimized.replace(/^#+\s*[^\n]+\n/g, '').trim().slice(0, 100);
  const ctaLine = extractLastSubstantialLine(optimized);

  return {
    optimized,
    charCount: optimized.length,
    hookFirst100,
    ctaLine,
    elapsedMs: elapsed,
    appliedFixes,
  };
}

function detectAppliedFixes(originalDraft: string, optimized: string, persona: PersonaProfile): string[] {
  const fixes: string[] = [];
  // 1. 도입부 후크 변경 감지
  if (originalDraft.slice(0, 100) !== optimized.slice(0, 100)) {
    fixes.push('hook-rewrite');
  }
  // 2. 결정 마찰 제거 패턴
  if (/고민됐는데|처음엔 의심|주저했지만/.test(optimized) && !/고민됐는데|처음엔 의심|주저했지만/.test(originalDraft)) {
    fixes.push('decision-friction-removed');
  }
  // 3. CTA 강압 금지 검증
  if (/무조건|지금 당장|반드시 사세요/.test(optimized)) {
    fixes.push('cta-warning-aggressive');
  }
  // 4. 금칙어 잔존 검증
  for (const banned of persona.forbiddenPhrases) {
    if (optimized.includes(banned)) {
      fixes.push(`forbidden-phrase-remained:${banned}`);
      break;
    }
  }
  return fixes;
}

function extractLastSubstantialLine(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 10 && !l.startsWith('#'));
  return lines[lines.length - 1] ?? '';
}
