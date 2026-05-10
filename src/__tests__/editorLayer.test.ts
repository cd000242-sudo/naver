/**
 * SPEC-CONVERSION-001 L4-1 — editorLayer 단위 테스트.
 * Mock LLM으로 편집 적용·변경률 임계·사실 보존 검증.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyEditorLayer,
  isEditorLayerEnabled,
  approximateChangeRatio,
  checkFactsPreserved,
} from '../content/editorLayer';
import type { LLMProvider } from '../content/draftWriter';
import type { PersonaProfile } from '../content/personaBuilder';

const persona: PersonaProfile = {
  name: '지영',
  age: '30대',
  occupation: '직장인',
  experienceYears: 5,
  tone: 'casual',
  vocabularyHints: ['실사용', '솔직히'],
  forbiddenPhrases: ['최고의', '무조건'],
  category: 'general',
};

function fakeLLM(text: string): LLMProvider {
  return { complete: vi.fn(async () => text) };
}

const longBody = (label: string, n = 30) =>
  `# ${label}\n\n` + `오늘은 카페 후기를 적어볼게요. 분위기가 좋았어요. `.repeat(n);

describe('approximateChangeRatio', () => {
  it('동일 문자열은 0', () => {
    expect(approximateChangeRatio('hello', 'hello')).toBe(0);
  });
  it('전혀 다른 문자열은 1에 가깝', () => {
    expect(approximateChangeRatio('aaaaa', 'bbbbb')).toBe(1);
  });
  it('일부 변경', () => {
    const r = approximateChangeRatio('helloworld', 'helloXorld');
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.5);
  });
});

describe('checkFactsPreserved', () => {
  it('숫자+단위 보존', () => {
    expect(checkFactsPreserved('가격 12,500원', '가격은 12,500원입니다')).toBe(true);
  });
  it('숫자 누락 시 false', () => {
    expect(checkFactsPreserved('가격 12,500원이고 무게 150g', '가격 12,500원')).toBe(false);
  });
  it('따옴표 인용 보존', () => {
    expect(checkFactsPreserved(
      '리뷰: "정말 만족스러웠어요"',
      '리뷰는 "정말 만족스러웠어요"라고 했어요',
    )).toBe(true);
  });
  it('따옴표 인용 누락 시 false', () => {
    expect(checkFactsPreserved(
      '"정말 만족스러웠어요"라고 했어요',
      '만족스러웠다고 했어요',
    )).toBe(false);
  });
});

describe('isEditorLayerEnabled', () => {
  beforeEach(() => { delete process.env.EDITOR_LAYER_V1; });
  it('기본 OFF', () => expect(isEditorLayerEnabled()).toBe(false));
  it('forceFlag=true → ON', () => expect(isEditorLayerEnabled(true)).toBe(true));
  it('env=on → ON', () => {
    process.env.EDITOR_LAYER_V1 = 'on';
    expect(isEditorLayerEnabled()).toBe(true);
  });
});

describe('applyEditorLayer — flag OFF', () => {
  it('flag OFF면 원본 그대로 + applied=false + reason', async () => {
    const r = await applyEditorLayer({
      optimizedDraft: longBody('주제'),
      persona,
      llmProvider: fakeLLM('변경된 본문'),
      forceFlag: false,
    });
    expect(r.enabled).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.editedDraft).toBe(r.originalDraft);
    expect(r.fallbackReason).toMatch(/미활성화/);
  });
});

describe('applyEditorLayer — 정상 흐름', () => {
  it('정상 편집 적용 (변경률 임계 이내)', async () => {
    const original = longBody('주제');
    // 거의 비슷한 결과 (변경률 ~0%)
    const llm = fakeLLM(original);
    const r = await applyEditorLayer({
      optimizedDraft: original,
      persona,
      llmProvider: llm,
      forceFlag: true,
    });
    expect(r.enabled).toBe(true);
    expect(r.applied).toBe(true);
    expect(r.changeRatio).toBeLessThanOrEqual(0.1);
    expect(r.preservedFacts).toBe(true);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});

describe('applyEditorLayer — 안전장치 (silent 폴백 X)', () => {
  it('변경률 임계 초과 시 원본 유지 + reason', async () => {
    const original = longBody('주제');
    const completelyDifferent = longBody('완전히 다른 글', 50).replace(/카페/g, '식당').replace(/분위기/g, '맛');
    const r = await applyEditorLayer({
      optimizedDraft: original,
      persona,
      llmProvider: fakeLLM(completelyDifferent),
      forceFlag: true,
      maxChangeRatio: 0.1,
    });
    expect(r.applied).toBe(false);
    expect(r.editedDraft).toBe(original);
    expect(r.fallbackReason).toMatch(/CHANGE_RATIO_EXCEEDED/);
  });

  it('숫자 누락 시 원본 유지 + reason', async () => {
    // 변경률은 거의 동일하지만 첫 등장 숫자만 다른 토큰으로 살짝 교체 (앞뒤 위치 거의 보존)
    const original = '## 가격 분석\n\n' + '제품 가격은 12,500원이고 무게는 150g입니다. '.repeat(40);
    // 같은 위치에 12,500을 가짜 숫자로 살짝 변경 — 변경률 매우 낮게 유지
    const factLost = original.replace(/12,500원/g, '12,000원');
    const r = await applyEditorLayer({
      optimizedDraft: original,
      persona,
      llmProvider: fakeLLM(factLost),
      forceFlag: true,
      maxChangeRatio: 0.5,
    });
    expect(r.applied).toBe(false);
    expect(r.preservedFacts).toBe(false);
    expect(r.fallbackReason).toMatch(/FACT_LOSS/);
  });

  it('800자 미만 입력은 명시 fallback', async () => {
    const r = await applyEditorLayer({
      optimizedDraft: '짧은 본문',
      persona,
      llmProvider: fakeLLM('x'),
      forceFlag: true,
    });
    expect(r.fallbackReason).toMatch(/INPUT_TOO_SHORT/);
    expect(r.applied).toBe(false);
  });

  it('LLM 실패 시 원본 유지 + reason', async () => {
    const failing: LLMProvider = {
      complete: vi.fn(async () => { throw new Error('Gemini 한도'); }),
    };
    const r = await applyEditorLayer({
      optimizedDraft: longBody('주제'),
      persona,
      llmProvider: failing,
      forceFlag: true,
    });
    expect(r.applied).toBe(false);
    expect(r.fallbackReason).toMatch(/LLM_FAILED.*한도/);
    expect(r.editedDraft).toBe(r.originalDraft);
  });

  it('LLM provider null 주입은 명시 throw', async () => {
    await expect(applyEditorLayer({
      optimizedDraft: longBody('주제'),
      persona,
      llmProvider: null as any,
      forceFlag: true,
    })).rejects.toThrow(/LLM_PROVIDER_INVALID/);
  });
});
