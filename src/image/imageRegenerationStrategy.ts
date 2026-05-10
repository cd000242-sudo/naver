/**
 * SPEC-CONVERSION-001 L3-3.4 — 이미지 불일치 시 재생성·교체 전략
 *
 * imageBodyAlignmentVerifier 결과가 aligned=false일 때 호출자가 사용할
 * 결정론 재생성 전략. 본 모듈은 *추천만* 수행. 실제 이미지 생성·교체는
 * 호출자(contentGenerator 또는 imageBatchGenerator)가 결정.
 *
 * 전략:
 *   1. 키워드 다시 셔플 (concrete 우선 + 추가 키워드 포함)
 *   2. headingHint 추가
 *   3. 시도 횟수 제한 (기본 3회)
 *   4. 최종 실패 시 폴백 (대체 이미지 또는 본문 키워드 그대로 alt 사용)
 *
 * 메모리 [silent 폴백 금지]: 시도 한도 초과 시 명시 reason.
 * 메모리 [추정 효과 금지]: 재생성 후 일치율 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import type { ExtractedKeyword } from '../content/keywordExtractor';
import type { ImageBodyAlignmentResult } from './imageBodyAlignmentVerifier';
import { verifyImageBodyAlignment } from './imageBodyAlignmentVerifier';
import { buildKeywordImagePrompt, type ImagePromptLang } from './keywordImagePromptBuilder';

export interface RegenerationStrategyInput {
  readonly bodyKeywords: readonly ExtractedKeyword[];
  readonly headingHint?: string;
  readonly initialAlignment: ImageBodyAlignmentResult;
  readonly maxAttempts?: number;
  readonly lang?: ImagePromptLang;
}

export interface RegenerationAttempt {
  readonly attempt: number;
  readonly prompt: string;
  readonly alignment: ImageBodyAlignmentResult;
  readonly strategy: 'shuffle-concrete' | 'add-heading' | 'expand-keywords' | 'lang-switch';
}

export interface RegenerationResult {
  readonly succeeded: boolean;
  readonly finalPrompt: string;
  readonly attempts: readonly RegenerationAttempt[];
  readonly fallbackReason?: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * 키워드를 셔플·확장하며 alignment 통과를 시도. 결정론(랜덤 X) — 같은 입력은 같은 결과.
 */
export function planRegeneration(input: RegenerationStrategyInput): RegenerationResult {
  if (input.initialAlignment.aligned) {
    return {
      succeeded: true,
      finalPrompt: '',
      attempts: [],
      fallbackReason: 'ALREADY_ALIGNED: 재생성 불필요',
    };
  }

  if (input.bodyKeywords.length === 0) {
    return {
      succeeded: false,
      finalPrompt: '',
      attempts: [],
      fallbackReason: 'BODY_KEYWORDS_EMPTY',
    };
  }

  const lang = input.lang ?? 'en';
  const maxAttempts = Math.max(1, Math.min(5, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const attempts: RegenerationAttempt[] = [];

  // 전략 1: concrete 우선 + 키워드 4개로 좁히기
  const attempt1 = buildKeywordImagePrompt({
    keywords: input.bodyKeywords,
    maxKeywords: 4,
    preferConcrete: true,
    lang,
  });
  if (attempt1.prompt) {
    const align1 = verifyImageBodyAlignment({
      bodyKeywords: input.bodyKeywords,
      imagePromptOrAlt: attempt1.prompt,
    });
    attempts.push({ attempt: 1, prompt: attempt1.prompt, alignment: align1, strategy: 'shuffle-concrete' });
    if (align1.aligned) {
      return { succeeded: true, finalPrompt: attempt1.prompt, attempts };
    }
  }

  // 전략 2: headingHint 추가 (있을 때만)
  if (attempts.length < maxAttempts && input.headingHint?.trim()) {
    const attempt2 = buildKeywordImagePrompt({
      keywords: input.bodyKeywords,
      maxKeywords: 4,
      preferConcrete: true,
      lang,
      headingHint: input.headingHint,
    });
    if (attempt2.prompt) {
      const align2 = verifyImageBodyAlignment({
        bodyKeywords: input.bodyKeywords,
        imagePromptOrAlt: attempt2.prompt,
      });
      attempts.push({ attempt: attempts.length + 1, prompt: attempt2.prompt, alignment: align2, strategy: 'add-heading' });
      if (align2.aligned) {
        return { succeeded: true, finalPrompt: attempt2.prompt, attempts };
      }
    }
  }

  // 전략 3: 키워드 더 넓게 (concrete + unknown + abstract 포함, top 6)
  if (attempts.length < maxAttempts) {
    const attempt3 = buildKeywordImagePrompt({
      keywords: input.bodyKeywords,
      maxKeywords: 6,
      preferConcrete: false,
      lang,
      headingHint: input.headingHint,
    });
    if (attempt3.prompt) {
      const align3 = verifyImageBodyAlignment({
        bodyKeywords: input.bodyKeywords,
        imagePromptOrAlt: attempt3.prompt,
      });
      attempts.push({ attempt: attempts.length + 1, prompt: attempt3.prompt, alignment: align3, strategy: 'expand-keywords' });
      if (align3.aligned) {
        return { succeeded: true, finalPrompt: attempt3.prompt, attempts };
      }
    }
  }

  // 전략 4: 언어 스위치 (영어 ↔ 한글)
  if (attempts.length < maxAttempts) {
    const altLang: ImagePromptLang = lang === 'en' ? 'ko' : 'en';
    const attempt4 = buildKeywordImagePrompt({
      keywords: input.bodyKeywords,
      maxKeywords: 4,
      preferConcrete: true,
      lang: altLang,
      headingHint: input.headingHint,
    });
    if (attempt4.prompt) {
      const align4 = verifyImageBodyAlignment({
        bodyKeywords: input.bodyKeywords,
        imagePromptOrAlt: attempt4.prompt,
      });
      attempts.push({ attempt: attempts.length + 1, prompt: attempt4.prompt, alignment: align4, strategy: 'lang-switch' });
      if (align4.aligned) {
        return { succeeded: true, finalPrompt: attempt4.prompt, attempts };
      }
    }
  }

  // 모든 전략 실패 — 가장 높은 overlap 가진 시도를 fallback으로 반환
  const best = attempts.reduce((acc, cur) =>
    cur.alignment.overlapRate > acc.alignment.overlapRate ? cur : acc,
    attempts[0],
  );
  return {
    succeeded: false,
    finalPrompt: best?.prompt ?? '',
    attempts,
    fallbackReason: `MAX_ATTEMPTS_EXCEEDED: ${attempts.length}/${maxAttempts} 시도, 최고 overlap ${(best?.alignment.overlapRate ?? 0) * 100 | 0}%`,
  };
}
