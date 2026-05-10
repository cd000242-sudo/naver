/**
 * SPEC-CONVERSION-001 L4-3.1 — brandEmbedder 단위 테스트.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createBrandEmbedder, type BrandPost } from '../rag/brandEmbedder';
import { HashEmbedder } from '../rag/embedder';
import { InMemoryVectorStore } from '../rag/vectorStore';

function makePost(overrides: Partial<BrandPost>): BrandPost {
  return {
    accountId: 'brandA',
    postId: 'post1',
    title: '강남 카페 후기',
    bodyText: '카페 분위기가 정말 좋았어요. 메뉴 구성도 다양하고 인테리어가 깔끔했어요.',
    category: 'food',
    tone: 'casual',
    ...overrides,
  };
}

describe('brandEmbedder — 기본 동작', () => {
  let be: ReturnType<typeof createBrandEmbedder>;
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
    be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
  });

  it('upsertPost + size 반영', async () => {
    expect(store.size()).toBe(0);
    await be.upsertPost(makePost({ postId: '1' }));
    await be.upsertPost(makePost({ postId: '2' }));
    expect(store.size()).toBe(2);
  });

  it('같은 postId 재upsert는 중복 X (record 1개로 유지)', async () => {
    await be.upsertPost(makePost({ postId: '1', title: 'A' }));
    await be.upsertPost(makePost({ postId: '1', title: 'B' }));
    expect(store.size()).toBe(1);
    const ag = await be.aggregate('brandA');
    expect(ag!.totalPosts).toBe(1);
  });

  it('upsertPostBatch', async () => {
    await be.upsertPostBatch([
      makePost({ postId: '1' }),
      makePost({ postId: '2' }),
      makePost({ postId: '3', accountId: 'brandB' }),
    ]);
    expect(store.size()).toBe(3);
  });

  it('빈 accountId·postId·text는 명시 throw', async () => {
    await expect(be.upsertPost(makePost({ accountId: '' }))).rejects.toThrow(/ACCOUNT_ID_EMPTY/);
    await expect(be.upsertPost(makePost({ postId: '' }))).rejects.toThrow(/POST_ID_EMPTY/);
    await expect(be.upsertPost(makePost({ title: '', bodyText: '' }))).rejects.toThrow(/TEXT_EMPTY/);
  });
});

describe('brandEmbedder — searchSimilarPosts (브랜드별 격리)', () => {
  let be: ReturnType<typeof createBrandEmbedder>;

  beforeEach(() => {
    const store = new InMemoryVectorStore();
    be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
  });

  it('accountId 일치하는 글만 검색', async () => {
    await be.upsertPostBatch([
      makePost({ accountId: 'brandA', postId: 'a1', title: '강남 카페 후기' }),
      makePost({ accountId: 'brandA', postId: 'a2', title: '강남 맛집' }),
      makePost({ accountId: 'brandB', postId: 'b1', title: '강남 카페 분석' }),
    ]);
    const hits = await be.searchSimilarPosts({ accountId: 'brandA', query: '강남 카페' });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (const h of hits) {
      expect(h.metadata?.accountId).toBe('brandA');
    }
  });

  it('category 추가 필터', async () => {
    await be.upsertPostBatch([
      makePost({ postId: '1', category: 'food' }),
      makePost({ postId: '2', category: 'tech' }),
    ]);
    const hits = await be.searchSimilarPosts({
      accountId: 'brandA', query: '카페', category: 'food',
    });
    expect(hits.every((h) => h.metadata?.category === 'food')).toBe(true);
  });

  it('빈 accountId 쿼리는 명시 throw', async () => {
    await expect(be.searchSimilarPosts({ accountId: '', query: 'x' }))
      .rejects.toThrow(/QUERY_ACCOUNT_ID_EMPTY/);
  });
});

describe('brandEmbedder — deleteAccountPosts', () => {
  it('해당 accountId 글만 일괄 삭제', async () => {
    const store = new InMemoryVectorStore();
    const be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
    await be.upsertPostBatch([
      makePost({ accountId: 'A', postId: 'a1' }),
      makePost({ accountId: 'A', postId: 'a2' }),
      makePost({ accountId: 'B', postId: 'b1' }),
    ]);
    expect(store.size()).toBe(3);
    const deleted = await be.deleteAccountPosts('A');
    expect(deleted).toBe(2);
    expect(store.size()).toBe(1);
  });

  it('없는 accountId 삭제는 0 반환', async () => {
    const store = new InMemoryVectorStore();
    const be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
    expect(await be.deleteAccountPosts('none')).toBe(0);
  });
});

describe('brandEmbedder — aggregate', () => {
  it('per-category·per-tone 카운트 + 평균 길이', async () => {
    const store = new InMemoryVectorStore();
    const be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
    await be.upsertPostBatch([
      makePost({ postId: '1', category: 'food', tone: 'casual', title: 'AAA', bodyText: 'X'.repeat(100) }),
      makePost({ postId: '2', category: 'food', tone: 'casual', title: 'BBBB', bodyText: 'X'.repeat(200) }),
      makePost({ postId: '3', category: 'tech', tone: 'expert_review', title: 'CCC', bodyText: 'X'.repeat(150) }),
    ]);
    const ag = await be.aggregate('brandA');
    expect(ag).not.toBeNull();
    expect(ag!.totalPosts).toBe(3);
    expect(ag!.perCategoryCount.food).toBe(2);
    expect(ag!.perCategoryCount.tech).toBe(1);
    expect(ag!.perToneCount.casual).toBe(2);
    expect(ag!.avgBodyLength).toBe(150);
  });

  it('미존재 accountId aggregate는 null', async () => {
    const store = new InMemoryVectorStore();
    const be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
    expect(await be.aggregate('none')).toBeNull();
  });
});
