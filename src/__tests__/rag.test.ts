/**
 * SPEC-CONVERSION-001 L3-1 — vectorStore + embedder + retriever 단위 테스트.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVectorStore, cosineSimilarity } from '../rag/vectorStore';
import { HashEmbedder } from '../rag/embedder';
import { createRetriever } from '../rag/retriever';

describe('cosineSimilarity', () => {
  it('동일 벡터는 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it('직교 벡터는 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it('영벡터는 0', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it('차원 불일치는 throw', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/VECTOR_DIM_MISMATCH/);
  });
});

describe('InMemoryVectorStore', () => {
  let store: InMemoryVectorStore;
  beforeEach(() => { store = new InMemoryVectorStore(); });

  it('upsert + size', async () => {
    expect(store.size()).toBe(0);
    await store.upsert([{ id: 'a', vector: [1, 0, 0] }]);
    expect(store.size()).toBe(1);
  });

  it('차원 불일치 upsert는 throw', async () => {
    await store.upsert([{ id: 'a', vector: [1, 0, 0] }]);
    await expect(store.upsert([{ id: 'b', vector: [1, 0] }])).rejects.toThrow(/VECTOR_DIM_MISMATCH/);
  });

  it('빈 vector·id는 throw', async () => {
    await expect(store.upsert([{ id: '', vector: [1] }])).rejects.toThrow(/VECTOR_ID_EMPTY/);
    await expect(store.upsert([{ id: 'a', vector: [] }])).rejects.toThrow(/VECTOR_EMPTY/);
  });

  it('search top-K + score 정렬', async () => {
    await store.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0.9, 0.1, 0] },
      { id: 'c', vector: [0, 1, 0] },
    ]);
    const hits = await store.search([1, 0, 0], { topK: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0].id).toBe('a');
    expect(hits[0].score).toBeCloseTo(1, 5);
    expect(hits[1].id).toBe('b');
  });

  it('minScore 임계 미만 제외', async () => {
    await store.upsert([
      { id: 'a', vector: [1, 0] },
      { id: 'b', vector: [0, 1] }, // cosine = 0
    ]);
    const hits = await store.search([1, 0], { minScore: 0.5 });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('a');
  });

  it('metadata filter', async () => {
    await store.upsert([
      { id: 'a', vector: [1, 0], metadata: { cat: 'food' } },
      { id: 'b', vector: [1, 0], metadata: { cat: 'tech' } },
    ]);
    const hits = await store.search([1, 0], {
      metadataFilter: (md) => md?.cat === 'food',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('a');
  });

  it('delete 후 빈 store는 dim 리셋', async () => {
    await store.upsert([{ id: 'a', vector: [1, 0] }]);
    await store.delete(['a']);
    expect(store.size()).toBe(0);
    await store.upsert([{ id: 'b', vector: [1, 0, 0] }]); // 새 dim 허용
    expect(store.size()).toBe(1);
  });

  it('clear', async () => {
    await store.upsert([{ id: 'a', vector: [1, 0] }]);
    await store.clear();
    expect(store.size()).toBe(0);
  });

  it('빈 store search → 빈 배열', async () => {
    const hits = await store.search([1, 0]);
    expect(hits).toEqual([]);
  });
});

describe('HashEmbedder', () => {
  it('결정론 — 같은 텍스트는 같은 벡터', async () => {
    const e = new HashEmbedder(64);
    const a = await e.embed('강남 카페 후기');
    const b = await e.embed('강남 카페 후기');
    expect(a.vector).toEqual(b.vector);
    expect(a.dim).toBe(64);
  });

  it('빈 텍스트는 0 벡터', async () => {
    const e = new HashEmbedder(32);
    const r = await e.embed('');
    expect(r.vector.every((v) => v === 0)).toBe(true);
  });

  it('L2 정규화 (norm ≈ 1)', async () => {
    const e = new HashEmbedder(64);
    const r = await e.embed('카페 맛집 후기');
    let norm = 0;
    for (const v of r.vector) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it('embedBatch', async () => {
    const e = new HashEmbedder(32);
    const rs = await e.embedBatch(['a', 'b', 'c']);
    expect(rs).toHaveLength(3);
  });

  it('dim 16 미만 또는 4096 초과는 throw', () => {
    expect(() => new HashEmbedder(8)).toThrow(/DIM_INVALID/);
    expect(() => new HashEmbedder(5000)).toThrow(/DIM_INVALID/);
  });
});

describe('Retriever (createRetriever)', () => {
  it('upsertDocument + search', async () => {
    const e = new HashEmbedder(64);
    const s = new InMemoryVectorStore();
    const r = createRetriever({ embedder: e, store: s });
    await r.upsertDocument({ id: 'doc1', text: '강남 카페 맛집 후기', metadata: { cat: 'food' } });
    const hits = await r.search('강남 카페');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].id).toBe('doc1');
    expect(hits[0].metadata?.cat).toBe('food');
  });

  it('upsertDocuments 배치', async () => {
    const e = new HashEmbedder(64);
    const s = new InMemoryVectorStore();
    const r = createRetriever({ embedder: e, store: s });
    await r.upsertDocuments([
      { id: 'd1', text: '카페 후기' },
      { id: 'd2', text: '맛집 추천' },
      { id: 'd3', text: '여행 코스' },
    ]);
    expect(s.size()).toBe(3);
  });

  it('빈 query → 빈 결과', async () => {
    const r = createRetriever({ embedder: new HashEmbedder(32), store: new InMemoryVectorStore() });
    expect(await r.search('')).toEqual([]);
    expect(await r.search('   ')).toEqual([]);
  });

  it('embedder 없이 createRetriever 호출은 throw', () => {
    expect(() => createRetriever({ embedder: null as any, store: new InMemoryVectorStore() }))
      .toThrow(/RETRIEVER_EMBEDDER_MISSING/);
  });
});
