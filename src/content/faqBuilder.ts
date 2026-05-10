/**
 * SPEC-CONVERSION-001 L2-3.2 — FAQ 섹션 자동 생성
 *
 * REVIEW-001 P1의 userVoice(블로그 댓글·질문)를 받아 LLM에 FAQ 섹션을 요청.
 * P1 미완료 단계에서도 인터페이스 호환 — userVoice 미주입 시 명시 fallback.
 *
 * Feature flag: FAQ_BUILDER_V1 (기본 OFF). REVIEW-001 P1 완료 후 ON.
 *
 * 메모리 [silent 폴백 금지]: userVoice 0건은 빈 결과 + reason.
 * 메모리 [추정 효과 금지]: FAQ 적용 시 효과 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import type { LLMProvider, LLMCompleteOptions } from './draftWriter';
import type { PersonaProfile } from './personaBuilder';
import { loadChainPrompt } from './chainPromptLoader';

const FEATURE_FLAG_ENV = 'FAQ_BUILDER_V1';
const DEFAULT_TEMPERATURE = 0.5;
const MIN_USER_VOICE_ITEMS = 3;
const MIN_OUTPUT_CHARS = 100;
const MAX_USER_VOICE_FOR_PROMPT = 15;

export interface FaqBuilderInput {
  readonly userVoice: readonly string[];           // P1 댓글·질문
  readonly persona: PersonaProfile;
  readonly bodyFactsSummary: string;                // 본문에서 인용 가능한 사실 요약
  readonly llmProvider: LLMProvider;
  readonly llmOptions?: LLMCompleteOptions;
  readonly forceFlag?: boolean;
  readonly minUserVoiceItems?: number;
}

export interface FaqBuilderResult {
  readonly enabled: boolean;
  readonly faqMarkdown: string;                     // 빈 문자열이면 호출자가 본문에 추가 안 함
  readonly itemCount: number;                        // 사용한 userVoice 항목 수
  readonly elapsedMs: number;
  readonly fallbackReason?: string;
}

export function isFaqBuilderEnabled(forceFlag?: boolean): boolean {
  if (forceFlag === true) return true;
  if (forceFlag === false) return false;
  const v = (process.env[FEATURE_FLAG_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on';
}

function sanitizeUserVoice(items: readonly string[]): string[] {
  return items
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 200)
    // 개인정보 휴리스틱: 전화·이메일·@핸들 제거
    .map((s) => s
      .replace(/\d{2,4}-\d{3,4}-\d{4}/g, '')
      .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '')
      .replace(/@\S+/g, '')
      .trim(),
    )
    .filter((s) => s.length >= 3);
}

function buildUserVoiceBlock(items: readonly string[]): string {
  if (items.length === 0) return '(P1 userVoice 데이터 없음)';
  const lines: string[] = [];
  for (let i = 0; i < items.length; i++) {
    lines.push(`  ${i + 1}. ${items[i]}`);
  }
  return lines.join('\n');
}

function sanitizeFaqOutput(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/^(FAQ|결과|output)[:：]\s*/i, '');
  return s.trim();
}

export async function buildFaqSection(input: FaqBuilderInput): Promise<FaqBuilderResult> {
  const start = Date.now();
  const enabled = isFaqBuilderEnabled(input.forceFlag);

  if (!enabled) {
    return {
      enabled: false,
      faqMarkdown: '',
      itemCount: 0,
      elapsedMs: Date.now() - start,
      fallbackReason: `Feature flag ${FEATURE_FLAG_ENV} 미활성화 — FAQ 섹션 생략`,
    };
  }

  const minItems = Math.max(1, input.minUserVoiceItems ?? MIN_USER_VOICE_ITEMS);
  const cleaned = sanitizeUserVoice(input.userVoice);
  if (cleaned.length < minItems) {
    return {
      enabled: true,
      faqMarkdown: '',
      itemCount: cleaned.length,
      elapsedMs: Date.now() - start,
      fallbackReason: `FAQ_USER_VOICE_TOO_FEW: ${cleaned.length} < ${minItems}건 — FAQ 섹션 생략`,
    };
  }

  if (!input.llmProvider || typeof input.llmProvider.complete !== 'function') {
    throw new Error('FAQ_LLM_PROVIDER_INVALID: 유효한 LLMProvider 미주입');
  }

  const personaBlock = [
    `- 톤: ${input.persona.tone}`,
    `- 자주 쓰는 어휘: ${input.persona.vocabularyHints.slice(0, 6).join(', ')}`,
    `- 절대 쓰지 않는 표현: ${input.persona.forbiddenPhrases.join(', ')}`,
  ].join('\n');

  const limited = cleaned.slice(0, MAX_USER_VOICE_FOR_PROMPT);
  const prompt = loadChainPrompt('faq', {
    USER_VOICE_BLOCK: buildUserVoiceBlock(limited),
    PERSONA_BLOCK: personaBlock,
    BODY_FACTS_BLOCK: input.bodyFactsSummary || '(본문 사실 요약 미주입 — 일반 가이드 형태로 답변)',
  });

  let raw = '';
  try {
    raw = await input.llmProvider.complete(prompt, {
      temperature: DEFAULT_TEMPERATURE,
      ...(input.llmOptions ?? {}),
    });
  } catch (err) {
    return {
      enabled: true,
      faqMarkdown: '',
      itemCount: limited.length,
      elapsedMs: Date.now() - start,
      fallbackReason: `FAQ_LLM_FAILED: ${(err as Error)?.message ?? 'unknown'} — FAQ 섹션 생략`,
    };
  }

  const md = sanitizeFaqOutput(raw);
  if (md.length < MIN_OUTPUT_CHARS) {
    return {
      enabled: true,
      faqMarkdown: '',
      itemCount: limited.length,
      elapsedMs: Date.now() - start,
      fallbackReason: `FAQ_OUTPUT_TOO_SHORT: ${md.length}자 — FAQ 섹션 생략`,
    };
  }

  return {
    enabled: true,
    faqMarkdown: md,
    itemCount: limited.length,
    elapsedMs: Date.now() - start,
  };
}
