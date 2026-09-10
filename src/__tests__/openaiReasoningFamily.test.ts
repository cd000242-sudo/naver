/**
 * [2026-09-10 사장님 제보] 다른 툴에서 이 오류가 났다:
 *   "OpenAI 엔진 호출 실패 (model=gpt-6-astra)
 *    HTTP 400 | Unsupported parameter: 'max_tokens' is not supported with this model.
 *    Use 'max_completion_tokens' instead."
 *
 * 우리 툴은 max_tokens 문제는 없다 — contentGenerator.ts:4524 가 이미
 * max_completion_tokens 를 쓴다. 그런데 **같은 계열의 문제**가 하나 남아 있었다.
 *
 * 추론(reasoning) 계열 판정이 `modelName.startsWith('gpt-5.6-')` 로 버전에 못 박혀 있다
 * (contentGenerator.ts:4528, modelRegistry.ts:190). gpt-6-astra 는 이 검사를 통과하지
 * 못해 else 로 떨어지고 temperature + top_p 가 실려 나간다. 추론 모델은 기본값이 아닌
 * temperature 를 max_tokens 와 똑같이 거부한다(openaiVisionAdapter.ts:183 주석에 실측 기록).
 *
 * 그리고 이 경로는 실제로 도달 가능하다 — modelRegistry.ts:187 이 `gpt-` 로 시작하는
 * **모든** 모델을 explicitModel 로 받아들인다.
 *
 * 계약: 계열 판정은 버전에 못 박지 않는다. 새 세대가 나올 때마다 앱을 고쳐야 하는 구조를
 * 만들지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { isOpenAiReasoningModel } from '../runtime/openaiReasoningFamily';

describe('isOpenAiReasoningModel — 세대가 올라가도 계속 맞는다', () => {
  it('현재 쓰는 5.6 계열', () => {
    for (const m of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
      expect(isOpenAiReasoningModel(m), m).toBe(true);
    }
  });

  it('새로 나온 6 계열 — 이것이 이번에 막힌 지점이다', () => {
    for (const m of ['gpt-6-astra', 'gpt-6', 'gpt-6.1-nova']) {
      expect(isOpenAiReasoningModel(m), m).toBe(true);
    }
  });

  it('아직 없는 세대도 미리 받아 둔다 — 앱을 다시 고치지 않게', () => {
    for (const m of ['gpt-7-x', 'gpt-8.2-y', 'gpt-9']) {
      expect(isOpenAiReasoningModel(m), m).toBe(true);
    }
  });

  it('구형 비추론 모델은 temperature 를 그대로 쓴다', () => {
    for (const m of ['gpt-4o', 'gpt-4.1-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']) {
      expect(isOpenAiReasoningModel(m), m).toBe(false);
    }
  });

  it('OpenAI 모델이 아니면 false', () => {
    for (const m of ['claude-fable-5', 'gemini-3.6-flash', '', undefined as never]) {
      expect(isOpenAiReasoningModel(m as string)).toBe(false);
    }
  });
});

describe('배선 핀 — 버전 하드코딩이 남아 있지 않다', () => {
  const live = (p: string, needle: string): number => {
    const fs = require('fs') as typeof import('fs');
    return fs.readFileSync(new URL(p, import.meta.url), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .filter((l) => l.includes(needle))
      .length;
  };

  it('contentGenerator 가 계열 판정 함수를 쓴다', () => {
    expect(live('../contentGenerator.ts', "startsWith('gpt-5.6-')")).toBe(0);
    expect(live('../contentGenerator.ts', 'isOpenAiReasoningModel(')).toBeGreaterThan(0);
  });

  it('modelRegistry 도 같은 함수를 쓴다', () => {
    expect(live('../runtime/modelRegistry.ts', "startsWith('gpt-5.6-')")).toBe(0);
    expect(live('../runtime/modelRegistry.ts', 'isOpenAiReasoningModel(')).toBeGreaterThan(0);
  });
});
