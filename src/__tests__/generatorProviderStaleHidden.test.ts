import { afterEach, describe, expect, it } from 'vitest';

import { UnifiedDOMCache } from '../renderer/modules/unifiedDOMCache';

/**
 * [2026-09-02 실측 3회] 낡은 hidden 값이 모델 라디오를 이겨 매번 생성이 터졌다.
 *
 *   [ContentGenerator] ❌ TEXT_MODEL_PROVIDER_MISMATCH:
 *       expected=claude, selected=openai-gpt41, actual=openai
 *
 * 라디오는 GPT(openai-gpt41)를 가리키는데 #unified-generator 에 남은 'claude' 가
 * provider 로 나갔다. main 은 모델을 primaryGeminiTextModel(=openai-gpt41)에서 읽으므로
 * 벤더가 어긋나 던진다. 자동 폴백 금지라 가드는 정직하게 멈춘다 —
 * 가드는 제 일을 했고 값이 틀렸다.
 *
 * 매번 자료 수집을 끝낸 뒤에 터졌다. 한 번은 크롤링 29,215자를 통째로 버렸다.
 *
 * 같은 파일 29~32행 주석이 에이전트 모드에서 이 stale 문제를 이미 고쳐 뒀다.
 * API 엔진 쪽만 안 고쳤을 뿐이다 — 한 곳만 고치고 나머지를 남긴 그 유형이다.
 *
 * 모델 라디오가 SSOT 다. 그 값이 실제로 호출할 모델을 정하므로 provider 도 거기서 나온다.
 */

function stubDom(radioValue: string | null, hiddenValue: string, hidden: { value: string }) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector: (selector: string) =>
        selector.includes('primaryGeminiTextModel') && radioValue
          ? { value: radioValue, disabled: false }
          : null,
      getElementById: (id: string) => (id === 'unified-generator' ? hidden : null),
    },
  });
  hidden.value = hiddenValue;
}

describe('모델 라디오가 낡은 hidden 값을 이긴다', () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    UnifiedDOMCache.unifiedGenerator = null;
  });

  it('실측 조합: 라디오=openai-gpt41, hidden=claude → openai', () => {
    const hidden = { value: '' };
    stubDom('openai-gpt41', 'claude', hidden);
    UnifiedDOMCache.unifiedGenerator = hidden as never;

    expect(UnifiedDOMCache.getGenerator()).toBe('openai');
  });

  it('낡은 hidden 값을 스스로 고쳐 놓는다 — 다음 호출에서 또 어긋나지 않게', () => {
    const hidden = { value: '' };
    stubDom('openai-gpt41', 'claude', hidden);
    UnifiedDOMCache.unifiedGenerator = hidden as never;

    UnifiedDOMCache.getGenerator();
    expect(hidden.value).toBe('openai');
  });

  /*
   * 벤더가 셋뿐이 아니다. 형태로 도는지 확인한다 —
   * 특정 조합만 막으면 다음 조합에서 같은 사고가 난다.
   */
  it.each([
    ['claude-sonnet', 'openai', 'claude'],
    ['gemini-3.5-flash', 'claude', 'gemini'],
    ['perplexity-sonar', 'openai', 'perplexity'],
    ['openai-gpt4o', 'gemini', 'openai'],
  ])('라디오=%s, hidden=%s → %s', (radio, stale, expected) => {
    const hidden = { value: '' };
    stubDom(radio, stale, hidden);
    UnifiedDOMCache.unifiedGenerator = hidden as never;

    expect(UnifiedDOMCache.getGenerator()).toBe(expected);
  });
});

describe('어긋나지 않을 때는 기존 동작 그대로', () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    UnifiedDOMCache.unifiedGenerator = null;
  });

  it('라디오와 hidden 이 같은 벤더면 그대로 둔다', () => {
    const hidden = { value: '' };
    stubDom('openai-gpt41', 'openai', hidden);
    UnifiedDOMCache.unifiedGenerator = hidden as never;

    expect(UnifiedDOMCache.getGenerator()).toBe('openai');
    expect(hidden.value).toBe('openai');
  });

  /*
   * 에이전트 모드는 사용자가 명시 선택한 0과금 경로다(파일 주석 2026-06-30).
   * 새 조건이 그 우선순위를 덮어쓰면 API 로 과금되던 버그가 돌아온다.
   */
  it('에이전트 라디오는 여전히 최우선이다', () => {
    const hidden = { value: '' };
    stubDom('agent-codex', 'openai', hidden);
    UnifiedDOMCache.unifiedGenerator = hidden as never;

    expect(UnifiedDOMCache.getGenerator()).toBe('agent-codex');
  });

  it('라디오가 없으면 hidden 값을 그대로 쓴다 (fail-open)', () => {
    const hidden = { value: '' };
    stubDom(null, 'perplexity', hidden);
    UnifiedDOMCache.unifiedGenerator = hidden as never;

    expect(UnifiedDOMCache.getGenerator()).toBe('perplexity');
  });
});
