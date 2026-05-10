/**
 * SPEC-CONVERSION-001 — chainedFullRunner 통합 + smoke 테스트.
 *
 * 5단계 + editor + competitor + RAG + trend + season을 모두 동시 사용하는
 * end-to-end 시나리오까지 포함.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runChainedFull, summarizeFullRun } from '../content/chainedFullRunner';
import type { LLMProvider } from '../content/draftWriter';
import { clearAllChainCaches } from '../content/chainCache';
import { resetChainedGenMetrics } from '../monitor/chainedGenMetrics';
import { HashEmbedder } from '../rag/embedder';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { createRetriever } from '../rag/retriever';
import { TrendCache } from '../trend/trendCache';
import type { PageLike } from '../crawler/competitorDataCollector';

// 본문 fixture: factGate 통과를 위해 experience·duration 패턴 회피
const longBody = (label: string) =>
  `# ${label}\n\n` + `오늘은 카페에 들렀어요. 분위기가 깔끔하고 메뉴도 무난했답니다. `.repeat(40);

function fakeLLM(text: string): LLMProvider {
  return { complete: vi.fn(async () => text) };
}

function mockShoppingPage(raw: unknown[]): PageLike {
  let count = 0;
  return {
    goto: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => null),
    evaluate: vi.fn(async <T,>(): Promise<T> => {
      count++;
      if (count === 1) return undefined as unknown as T;
      return raw as unknown as T;
    }),
  };
}

describe('runChainedFull — Stage 1~5 정상 흐름', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
    delete process.env.EDITOR_LAYER_V1;
  });

  it('factGate 통과 + optimize 적용 (editor OFF)', async () => {
    const draft = longBody('초안');
    const optimized = longBody('퇴고');
    let callCount = 0;
    const provider: LLMProvider = {
      complete: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? draft : optimized;
      }),
    };
    const r = await runChainedFull({
      chainInput: { forceFlag: true, title: '카페' },
      topic: '카페 후기',
      minChars: 1000,
      llmProvider: provider,
    });
    expect(r.stagesCompleted).toEqual(['draft', 'factGate', 'optimize']);
    expect(r.factGate.passed).toBe(true);
    expect(r.factGateRetryInstruction).toBe('');
    expect(r.optimized).not.toBeNull();
    expect(r.edited?.applied).toBe(false); // editor flag OFF
    expect(r.finalContent).toBe(r.optimized!.optimized);
    expect(r.fallbackReason).toBeUndefined();
  });

  it('editor flag ON + 변경률 임계 이내 → editor 적용', async () => {
    const draft = longBody('초안');
    const optimized = longBody('퇴고');
    // editor는 거의 동일 결과 반환 → 변경률 0 → 적용됨
    let i = 0;
    const provider: LLMProvider = {
      complete: vi.fn(async () => {
        i++;
        if (i === 1) return draft;
        if (i === 2) return optimized;
        return optimized; // editor도 동일 반환
      }),
    };
    const r = await runChainedFull({
      chainInput: { forceFlag: true, title: '카페' },
      topic: '카페',
      minChars: 1000,
      llmProvider: provider,
      editorForceFlag: true,
    });
    expect(r.stagesCompleted).toContain('editor');
    expect(r.edited?.applied).toBe(true);
    expect(r.finalContent).toBe(r.edited!.editedDraft);
  });

  it('editor 변경률 임계 초과 → 원본(optimized) 유지', async () => {
    const draft = longBody('초안');
    const optimized = longBody('퇴고');
    const wildEdited = longBody('완전히 다른 글').replace(/카페/g, '식당').replace(/분위기/g, '맛');
    let i = 0;
    const provider: LLMProvider = {
      complete: vi.fn(async () => {
        i++;
        if (i === 1) return draft;
        if (i === 2) return optimized;
        return wildEdited;
      }),
    };
    const r = await runChainedFull({
      chainInput: { forceFlag: true, title: '카페' },
      topic: '카페',
      minChars: 1000,
      llmProvider: provider,
      editorForceFlag: true,
      editorMaxChangeRatio: 0.05,
    });
    expect(r.edited?.applied).toBe(false);
    expect(r.edited?.fallbackReason).toMatch(/CHANGE_RATIO_EXCEEDED/);
    expect(r.finalContent).toBe(r.optimized!.optimized);
  });
});

describe('runChainedFull — fact gate 실패', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('sourceText에 없는 환각 수치 → factGate 실패 + retry instruction', async () => {
    const fabricated =
      '# 후기\n\n' +
      '히알루론산 5,000ppm 함유로 2주간 사용하니 피부가 좋아졌어요. '.repeat(30);
    const provider = fakeLLM(fabricated);
    const r = await runChainedFull({
      chainInput: { forceFlag: true, title: '뷰티 후기' },
      topic: '히알루론산 크림',
      minChars: 1000,
      llmProvider: provider,
      sourceText: '히알루론산 크림. 가격 20,000원.',
    });
    expect(r.factGate.passed).toBe(false);
    expect(r.factGateRetryInstruction).toContain('팩트 게이트 검증 실패');
    expect(r.optimized).toBeNull();
    expect(r.edited).toBeNull();
    expect(r.finalContent).toBe(r.draft.draft.draft);
    expect(r.fallbackReason).toMatch(/STAGE4_FACT_GATE_FAILED/);
  });
});

describe('runChainedFull — 5단계 + competitor + RAG + trend + season smoke', () => {
  beforeEach(() => {
    clearAllChainCaches();
    resetChainedGenMetrics();
  });

  it('전체 옵션 동시 사용 시 모든 컨텍스트 블록이 prompt에 합성', async () => {
    // 1. RAG retriever 준비
    const store = new InMemoryVectorStore();
    const retriever = createRetriever({ embedder: new HashEmbedder(64), store });
    await retriever.upsertDocument({
      id: 'r1', text: '카페 인테리어 후기 본문',
      metadata: { title: '카페 인테리어 후기', structureSignature: '1-2-2-2' },
    });

    // 2. competitor mock
    const competitorRaw = [
      { rank: 1, name: 'A', priceText: '5,000원', ratingText: '4.7', reviewText: '(100)', seller: 'A', thumbnailUrl: null, productUrl: null },
      { rank: 2, name: 'B', priceText: '6,000원', ratingText: '4.5', reviewText: '(80)', seller: 'B', thumbnailUrl: null, productUrl: null },
      { rank: 3, name: 'C', priceText: '7,000원', ratingText: '4.8', reviewText: '(150)', seller: 'C', thumbnailUrl: null, productUrl: null },
    ];

    // 3. trend fetcher mock
    const trendCache = new TrendCache<any>(10, 1_000_000);
    const trendFetcher = {
      fetch: vi.fn(async () => ({
        keywords: [{ term: '강남 카페', rank: 1, trend: 'rising' as const }],
        source: 'datalab' as const,
      })),
    };

    // 4. LLM provider — Stage 3·5 두 호출 (mock)
    let i = 0;
    const draftText = longBody('초안');
    const optText = longBody('퇴고');
    const provider: LLMProvider = {
      complete: vi.fn(async (prompt) => {
        i++;
        // 첫 호출이 draft 호출 — prompt에 모든 컨텍스트 블록이 포함됐는지 검증
        if (i === 1) {
          expect(prompt).toContain('경쟁 제품 데이터');
          expect(prompt).toContain('유사 성공글');
          expect(prompt).toContain('최근 트렌드');
          expect(prompt).toContain('시즌 컨텍스트');
        }
        return i === 1 ? draftText : optText;
      }),
    };

    const r = await runChainedFull({
      chainInput: { forceFlag: true, title: '강남 카페' },
      topic: '강남 카페',
      minChars: 1000,
      llmProvider: provider,
      competitor: {
        fetcher: mockShoppingPage(competitorRaw),
        query: '카페',
        targetPriceWon: 5500,
        forceFlag: true,
      },
      rag: { retriever, query: '카페' },
      trend: { fetcher: trendFetcher, seedTerm: '카페', forceFlag: true, cache: trendCache },
      seasonDate: '2026-05-08',
      socialProof: { reviewCount: 1234, avgRating: 4.6 },
    });

    expect(r.stagesCompleted).toContain('optimize');
    expect(r.factGate.passed).toBe(true);
    expect(r.draft.contextBlocksUsed).toMatchObject({
      competitor: true, rag: true, trend: true, season: true,
    });
    expect(r.finalContent.length).toBeGreaterThan(800);
  });
});

describe('summarizeFullRun', () => {
  it('정상 흐름 요약', () => {
    const summary = summarizeFullRun({
      draft: { chainResult: { enabled: true } as any, competitor: null, ragHits: null, trend: null, season: null,
        draft: { draft: 'x', charCount: 1, promptUsed: '', elapsedMs: 0 }, contextBlocksUsed: { competitor: false, rag: false, trend: false, season: false, extra: false } },
      factGate: { passed: true, totalClaims: 0, verifiedClaims: 0, unverifiedClaims: [], verificationRate: 1 },
      factGateRetryInstruction: '',
      optimized: { optimized: 'opt', charCount: 3, hookFirst100: '', ctaLine: '', elapsedMs: 0, appliedFixes: [] },
      edited: null,
      finalContent: 'opt',
      stagesCompleted: ['draft', 'factGate', 'optimize'],
    });
    expect(summary).toMatch(/draft→factGate→optimize/);
    expect(summary).toMatch(/3자/);
  });

  it('fallback 포함', () => {
    const summary = summarizeFullRun({
      draft: { chainResult: {} as any, competitor: null, ragHits: null, trend: null, season: null,
        draft: { draft: 'x', charCount: 1, promptUsed: '', elapsedMs: 0 }, contextBlocksUsed: { competitor: false, rag: false, trend: false, season: false, extra: false } },
      factGate: { passed: false, totalClaims: 5, verifiedClaims: 1, unverifiedClaims: [], verificationRate: 0.2, reason: '검증 실패' },
      factGateRetryInstruction: 'retry',
      optimized: null,
      edited: null,
      finalContent: 'x',
      stagesCompleted: ['draft', 'factGate'],
      fallbackReason: 'STAGE4_FACT_GATE_FAILED',
    });
    expect(summary).toMatch(/fallback: STAGE4_FACT_GATE_FAILED/);
  });
});
