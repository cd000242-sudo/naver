/**
 * SPEC-CONVERSION-001 — chainedDraftAdapter 단위 테스트.
 * flag 분기 + chainedDraftRunner 위임 + 명시 fallback 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isChainedDraftEntryEnabled,
  maybeRunChainedDraft,
} from '../content/chainedDraftAdapter';
import type { LLMProvider } from '../content/draftWriter';
import { clearAllChainCaches } from '../content/chainCache';
import { resetChainedGenMetrics } from '../monitor/chainedGenMetrics';

const longBody = (label: string) =>
  `# ${label}\n\n` + `오늘은 카페에 다녀왔어요. 분위기가 깔끔했어요. `.repeat(30);

function fakeLLM(text: string): LLMProvider {
  return { complete: vi.fn(async () => text) };
}

describe('isChainedDraftEntryEnabled', () => {
  beforeEach(() => { delete process.env.CHAINED_DRAFT_V1; });

  it('기본 OFF', () => expect(isChainedDraftEntryEnabled()).toBe(false));
  it('forceFlag=true → ON', () => expect(isChainedDraftEntryEnabled(true)).toBe(true));
  it('forceFlag=false → OFF', () => expect(isChainedDraftEntryEnabled(false)).toBe(false));
  it('env=on → ON', () => {
    process.env.CHAINED_DRAFT_V1 = 'on';
    expect(isChainedDraftEntryEnabled()).toBe(true);
  });
  it('env=1 → ON', () => {
    process.env.CHAINED_DRAFT_V1 = '1';
    expect(isChainedDraftEntryEnabled()).toBe(true);
  });
});

describe('maybeRunChainedDraft — flag OFF', () => {
  beforeEach(() => {
    delete process.env.CHAINED_DRAFT_V1;
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('flag OFF면 result=null + reason 명시 + LLM 호출 없음', async () => {
    const llm = fakeLLM(longBody('주제'));
    const r = await maybeRunChainedDraft({
      chainInput: { forceFlag: true, title: '주제' },
      topic: '주제',
      minChars: 1000,
      llmProvider: llm,
      forceEntryFlag: false,
    });
    expect(r.entryEnabled).toBe(false);
    expect(r.result).toBeNull();
    expect(r.fallbackReason).toMatch(/CHAINED_DRAFT_V1 미활성화/);
    expect((llm.complete as any).mock.calls).toHaveLength(0);
  });
});

describe('maybeRunChainedDraft — flag ON', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('forceEntryFlag=true + chainedGen ON → 정상 실행', async () => {
    const llm = fakeLLM(longBody('주제'));
    const r = await maybeRunChainedDraft({
      chainInput: { forceFlag: true, title: '주제' },
      topic: '주제',
      minChars: 1000,
      llmProvider: llm,
      forceEntryFlag: true,
    });
    expect(r.entryEnabled).toBe(true);
    expect(r.result).not.toBeNull();
    expect(r.result!.draft.charCount).toBeGreaterThan(800);
    expect(r.fallbackReason).toBeUndefined();
  });

  it('chainedDraftRunner 내부 throw는 fallbackReason으로 전파', async () => {
    // CHAINED_GEN_V1 OFF인 상태에서 forceFlag=false로 chainedDraftRunner가 throw
    const llm = fakeLLM(longBody('주제'));
    const r = await maybeRunChainedDraft({
      chainInput: { forceFlag: false, title: '주제' },
      topic: '주제',
      minChars: 1000,
      llmProvider: llm,
      forceEntryFlag: true,
    });
    expect(r.entryEnabled).toBe(true);
    expect(r.result).toBeNull();
    expect(r.fallbackReason).toMatch(/CHAINED_DRAFT_FAILED.*CHAINED_DRAFT_DISABLED/);
  });

  it('LLM 실패도 fallback reason으로 전파', async () => {
    const failing: LLMProvider = {
      complete: vi.fn(async () => { throw new Error('rate limit'); }),
    };
    const r = await maybeRunChainedDraft({
      chainInput: { forceFlag: true, title: '주제' },
      topic: '주제',
      minChars: 1000,
      llmProvider: failing,
      forceEntryFlag: true,
    });
    expect(r.entryEnabled).toBe(true);
    expect(r.result).toBeNull();
    expect(r.fallbackReason).toMatch(/CHAINED_DRAFT_FAILED.*rate limit/);
  });
});
