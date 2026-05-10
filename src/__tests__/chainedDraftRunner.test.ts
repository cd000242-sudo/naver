/**
 * SPEC-CONVERSION-001 L2-2.5 — chainedDraftRunner 통합 테스트.
 * chained + competitor + draft 묶음 검증 (Mock 사용).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runChainedDraft } from '../content/chainedDraftRunner';
import type { LLMProvider } from '../content/draftWriter';
import type { PageLike } from '../crawler/competitorDataCollector';
import { clearAllChainCaches } from '../content/chainCache';
import { resetChainedGenMetrics, getChainedGenSnapshot } from '../monitor/chainedGenMetrics';

const longBody = (label: string) =>
  `# ${label}\n\n` +
  `오늘은 강남 카페 후기를 적어볼게요. 분위기가 깔끔했어요. `.repeat(40);

function fakeLLM(text: string): LLMProvider {
  return { complete: vi.fn(async () => text) };
}

function mockShoppingPage(rawProducts: any[]): PageLike {
  let evalCount = 0;
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => null),
    evaluate: vi.fn(async <T,>(_fn: (s: unknown) => T): Promise<T> => {
      evalCount++;
      if (evalCount === 1) return undefined as unknown as T;
      return rawProducts as unknown as T;
    }),
  };
}

const sampleRaw = [
  { rank: 1, name: 'A', priceText: '450,000원', ratingText: '4.7', reviewText: '(1234)', seller: 'A', thumbnailUrl: null, productUrl: null },
  { rank: 2, name: 'B', priceText: '380,000원', ratingText: '4.5', reviewText: '(890)', seller: 'B', thumbnailUrl: null, productUrl: null },
  { rank: 3, name: 'C', priceText: '520,000원', ratingText: '4.8', reviewText: '(2100)', seller: 'C', thumbnailUrl: null, productUrl: null },
];

describe('runChainedDraft — 정상 흐름', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('chained ON, 경쟁 데이터 없음 → draft 단일 호출', async () => {
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '강남 카페 후기' },
      topic: '강남 카페 후기',
      minChars: 1000,
      llmProvider: llm,
    });
    expect(r.chainResult.enabled).toBe(true);
    expect(r.competitor).toBeNull();
    expect(r.draft.charCount).toBeGreaterThan(800);
    expect(r.contextBlocksUsed.competitor).toBe(false);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    // chained gen 메트릭 누적 확인
    const snap = getChainedGenSnapshot();
    expect(snap.enabledRuns).toBe(1);
  });

  it('chained ON + competitor ON → draft prompt에 경쟁 블록 합성', async () => {
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '무선청소기 후기' },
      topic: '무선청소기 후기',
      minChars: 1000,
      llmProvider: llm,
      competitor: {
        fetcher: mockShoppingPage(sampleRaw),
        query: '무선청소기',
        targetPriceWon: 400_000,
        forceFlag: true,
      },
    });
    expect(r.competitor?.enabled).toBe(true);
    expect(r.competitor?.collectorResult.products).toHaveLength(3);
    expect(r.contextBlocksUsed.competitor).toBe(true);
    expect(r.draft.promptUsed).toContain('경쟁 제품 데이터');
    expect(r.draft.promptUsed).toContain('가격 포지셔닝');
  });

  it('competitor flag OFF면 contextBlock 빈 문자열 + draft 정상 진행', async () => {
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '주제' },
      topic: '주제',
      minChars: 1000,
      llmProvider: llm,
      competitor: {
        fetcher: mockShoppingPage(sampleRaw),
        query: 'x',
        forceFlag: false, // OFF
      },
    });
    expect(r.competitor?.enabled).toBe(false);
    expect(r.contextBlocksUsed.competitor).toBe(false);
    expect(r.draft.promptUsed).not.toContain('경쟁 제품 데이터');
  });

  it('extraContext + competitor 둘 다 합성', async () => {
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '주제' },
      topic: '주제',
      minChars: 1000,
      extraContext: '## [추가 메모]\n사용자 1차 경험: 손에 들었을 때 묵직했어요',
      llmProvider: llm,
      competitor: {
        fetcher: mockShoppingPage(sampleRaw),
        query: 'x',
        forceFlag: true,
      },
    });
    expect(r.contextBlocksUsed.competitor).toBe(true);
    expect(r.contextBlocksUsed.extra).toBe(true);
    expect(r.draft.promptUsed).toContain('경쟁 제품 데이터');
    expect(r.draft.promptUsed).toContain('손에 들었을 때 묵직');
  });
});

describe('runChainedDraft — L3 통합 (RAG·trend·season)', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('rag retriever 주입 시 ragHits + 블록 합성', async () => {
    const { HashEmbedder } = await import('../rag/embedder');
    const { InMemoryVectorStore } = await import('../rag/vectorStore');
    const { createRetriever } = await import('../rag/retriever');
    const embedder = new HashEmbedder(32);
    const store = new InMemoryVectorStore();
    const retriever = createRetriever({ embedder, store });
    await retriever.upsertDocument({
      id: 'doc1', text: '강남 카페 후기 본문',
      metadata: { title: '강남 카페 후기', structureSignature: '1-2-2-2' },
    });

    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '강남 카페' },
      topic: '강남 카페',
      minChars: 1000,
      llmProvider: llm,
      rag: { retriever, query: '강남 카페' },
    });
    expect(r.ragHits).not.toBeNull();
    expect(r.ragHits!.length).toBeGreaterThanOrEqual(1);
    expect(r.contextBlocksUsed.rag).toBe(true);
    expect(r.draft.promptUsed).toContain('유사 성공글');
  });

  it('trend fetcher + cache 주입 시 trend 블록 합성', async () => {
    const { TrendCache } = await import('../trend/trendCache');
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '카페' },
      topic: '카페',
      minChars: 1000,
      llmProvider: llm,
      trend: {
        seedTerm: '카페',
        forceFlag: true,
        fetcher: {
          fetch: vi.fn(async () => ({
            keywords: [{ term: '강남 카페', rank: 1, trend: 'rising' as const }],
            source: 'datalab' as const,
          })),
        },
        cache: new TrendCache(10, 1_000_000),
      },
    });
    expect(r.trend?.enabled).toBe(true);
    expect(r.contextBlocksUsed.trend).toBe(true);
    expect(r.draft.promptUsed).toContain('최근 트렌드');
  });

  it('seasonDate 주입 시 season 블록 합성', async () => {
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '카페' },
      topic: '카페',
      minChars: 1000,
      llmProvider: llm,
      seasonDate: '2026-05-08',
    });
    expect(r.season?.season).toBe('spring');
    expect(r.contextBlocksUsed.season).toBe(true);
    expect(r.draft.promptUsed).toContain('시즌 컨텍스트');
    expect(r.draft.promptUsed).toContain('가정의 달');
  });

  it('잘못된 seasonDate는 silent — 콘솔 경고 + 블록 미주입', async () => {
    const llm = fakeLLM(longBody('초안'));
    const r = await runChainedDraft({
      chainInput: { forceFlag: true, title: '카페' },
      topic: '카페',
      minChars: 1000,
      llmProvider: llm,
      seasonDate: 'not-a-date',
    });
    expect(r.season).toBeNull();
    expect(r.contextBlocksUsed.season).toBe(false);
  });
});

describe('runChainedDraft — 명시 throw (silent 폴백 X)', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('CHAINED_GEN_V1 OFF (forceFlag=false)면 명시 throw', async () => {
    await expect(
      runChainedDraft({
        chainInput: { forceFlag: false, title: '주제' },
        topic: '주제',
        minChars: 1000,
        llmProvider: fakeLLM('x'.repeat(2000)),
      }),
    ).rejects.toThrow(/CHAINED_DRAFT_DISABLED/);
  });

  it('LLM 실패는 그대로 전파 (DRAFT_LLM_FAILED)', async () => {
    const failing: LLMProvider = {
      complete: vi.fn(async () => {
        throw new Error('Gemini 한도 초과');
      }),
    };
    await expect(
      runChainedDraft({
        chainInput: { forceFlag: true, title: '주제' },
        topic: '주제',
        minChars: 1000,
        llmProvider: failing,
      }),
    ).rejects.toThrow(/DRAFT_LLM_FAILED.*한도/);
  });
});
