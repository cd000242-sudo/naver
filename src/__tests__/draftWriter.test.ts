/**
 * SPEC-CONVERSION-001 L2-1.4 — Stage 3 본문 초안 어댑터 단위 테스트.
 * Mock LLMProvider로 결정론 검증.
 */

import { describe, it, expect, vi } from 'vitest';
import { writeDraft, buildDraftPrompt, type LLMProvider } from '../content/draftWriter';
import { runChainedGeneration } from '../content/chainedGeneration';

const fakeProvider = (response: string): LLMProvider => ({
  complete: vi.fn(async () => response),
});

const failingProvider = (error: string): LLMProvider => ({
  complete: vi.fn(async () => { throw new Error(error); }),
});

async function buildChainResult() {
  return await runChainedGeneration({
    forceFlag: true,
    title: '맛집 김치찌개 레시피',
    productHint: '한식 맛집',
  });
}

describe('buildDraftPrompt — 프롬프트 조립', () => {
  it('페르소나 + 카테고리 + 주제 + 분량 지시 포함', async () => {
    const chainResult = await buildChainResult();
    const prompt = buildDraftPrompt({
      chainResult,
      topic: '강남 김치찌개 맛집 후기',
      minChars: 1500,
    });
    expect(prompt).toContain('food');
    expect(prompt).toContain('이름');
    expect(prompt).toContain('강남 김치찌개 맛집 후기');
    expect(prompt).toContain('1500자');
    expect(prompt).toContain('한국어');
  });

  it('minChars 800 미만은 800으로 강제 (분량 floor)', async () => {
    const chainResult = await buildChainResult();
    const prompt = buildDraftPrompt({
      chainResult,
      topic: '주제',
      minChars: 100,
    });
    expect(prompt).toContain('800자');
  });

  it('maxChars 6000 초과는 6000으로 ceiling', async () => {
    const chainResult = await buildChainResult();
    const prompt = buildDraftPrompt({
      chainResult,
      topic: '주제',
      minChars: 2000,
      maxChars: 99999,
    });
    expect(prompt).toContain('6000자');
  });

  it('additionalContext 주입', async () => {
    const chainResult = await buildChainResult();
    const prompt = buildDraftPrompt({
      chainResult,
      topic: '주제',
      minChars: 1000,
      additionalContext: '경쟁 데이터: 주변 맛집 평균 가격 12,000원',
    });
    expect(prompt).toContain('경쟁 데이터');
  });
});

describe('writeDraft — LLM 어댑터 동작', () => {
  it('정상 LLM 응답으로 초안 반환', async () => {
    const chainResult = await buildChainResult();
    const longResponse = '안녕하세요. 김치찌개 후기입니다. '.repeat(50); // ~1500자
    const provider = fakeProvider(longResponse);
    const r = await writeDraft({
      chainResult,
      topic: '김치찌개 후기',
      minChars: 1000,
      llmProvider: provider,
    });
    expect(r.draft.length).toBeGreaterThan(800);
    expect(r.charCount).toBe(r.draft.length);
    expect(r.promptUsed).toContain('김치찌개 후기');
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('LLM 응답의 코드블록·메타 머리말 제거', async () => {
    const chainResult = await buildChainResult();
    const messy = '```markdown\n초안: 본문 내용입니다. '.repeat(50) + '\n```';
    const r = await writeDraft({
      chainResult,
      topic: '주제',
      minChars: 800,
      llmProvider: fakeProvider(messy),
    });
    expect(r.draft.startsWith('```')).toBe(false);
    expect(r.draft.startsWith('초안:')).toBe(false);
    expect(r.draft).toContain('본문 내용');
  });
});

describe('writeDraft — 명시 오류 (silent 폴백 X)', () => {
  it('chainResult.enabled=false면 명시 throw', async () => {
    const r = await runChainedGeneration({ forceFlag: false });
    await expect(writeDraft({
      chainResult: r,
      topic: '주제',
      minChars: 1000,
      llmProvider: fakeProvider('x'.repeat(2000)),
    })).rejects.toThrow(/DRAFT_CHAIN_DISABLED/);
  });

  it('빈 topic은 명시 throw', async () => {
    const chainResult = await buildChainResult();
    await expect(writeDraft({
      chainResult,
      topic: '',
      minChars: 1000,
      llmProvider: fakeProvider('x'.repeat(2000)),
    })).rejects.toThrow(/DRAFT_TOPIC_EMPTY/);
  });

  it('LLM provider 미주입은 명시 throw', async () => {
    const chainResult = await buildChainResult();
    await expect(writeDraft({
      chainResult,
      topic: '주제',
      minChars: 1000,
      llmProvider: null as any,
    })).rejects.toThrow(/DRAFT_LLM_PROVIDER_INVALID/);
  });

  it('LLM 호출 실패는 DRAFT_LLM_FAILED throw', async () => {
    const chainResult = await buildChainResult();
    await expect(writeDraft({
      chainResult,
      topic: '주제',
      minChars: 1000,
      llmProvider: failingProvider('Gemini API 한도 초과'),
    })).rejects.toThrow(/DRAFT_LLM_FAILED.*한도 초과/);
  });

  it('LLM 응답 800자 미만은 DRAFT_TOO_SHORT throw', async () => {
    const chainResult = await buildChainResult();
    await expect(writeDraft({
      chainResult,
      topic: '주제',
      minChars: 1000,
      llmProvider: fakeProvider('짧은 응답'),
    })).rejects.toThrow(/DRAFT_TOO_SHORT/);
  });
});

describe('SPEC 메모리 원칙', () => {
  it('silent 폴백 부재 — 결과에 imageSource·subWorkProvider 없음', async () => {
    const chainResult = await buildChainResult();
    const r = await writeDraft({
      chainResult,
      topic: '주제',
      minChars: 1000,
      llmProvider: fakeProvider('x'.repeat(1500)),
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });
});
