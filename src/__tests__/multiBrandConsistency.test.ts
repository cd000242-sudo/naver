/**
 * SPEC-CONVERSION-001 L4-3.3 — 다계정(브랜드) 일관성 통합 테스트.
 *
 * 시나리오: 두 브랜드 A, B의 과거 글이 brandEmbedder에 적재된 상태에서
 *   - 같은 카테고리·같은 productHint를 받아도 각 브랜드는 서로 다른 enriched 입력을 얻어야
 *   - 같은 브랜드는 서로 다른 호출에서도 일관된 톤을 추천받아야
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createBrandEmbedder } from '../rag/brandEmbedder';
import { HashEmbedder } from '../rag/embedder';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { enrichPersonaWithBrandTone } from '../content/brandTonePersonaIntegrator';
import { buildPersona } from '../content/personaBuilder';

describe('다계정 일관성 — 브랜드 격리', () => {
  let be: ReturnType<typeof createBrandEmbedder>;

  beforeAll(async () => {
    const store = new InMemoryVectorStore();
    be = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
    await be.upsertPostBatch([
      // 브랜드 A: casual 톤 위주 (5건)
      { accountId: 'A', postId: 'a1', title: '강남 카페 솔직 후기', bodyText: '본문 A1 카페', category: 'food', tone: 'casual' },
      { accountId: 'A', postId: 'a2', title: '서울 디저트 추천', bodyText: '본문 A2 디저트', category: 'food', tone: 'casual' },
      { accountId: 'A', postId: 'a3', title: '강남 맛집 정리', bodyText: '본문 A3 맛집', category: 'food', tone: 'casual' },
      { accountId: 'A', postId: 'a4', title: '카페 인테리어 분석', bodyText: '본문 A4', category: 'food', tone: 'friendly' },
      { accountId: 'A', postId: 'a5', title: '메뉴 비교', bodyText: '본문 A5', category: 'food', tone: 'casual' },
      // 브랜드 B: expert_review 톤 위주 (4건)
      { accountId: 'B', postId: 'b1', title: '커피 원두 8년차 분석', bodyText: '본문 B1', category: 'food', tone: 'expert_review' },
      { accountId: 'B', postId: 'b2', title: '에스프레소 추출 과학', bodyText: '본문 B2', category: 'food', tone: 'expert_review' },
      { accountId: 'B', postId: 'b3', title: '바리스타 관점 후기', bodyText: '본문 B3', category: 'food', tone: 'expert_review' },
      { accountId: 'B', postId: 'b4', title: '카페 운영 노하우', bodyText: '본문 B4', category: 'food', tone: 'professional' },
    ]);
  });

  it('브랜드 A는 casual 톤 추천', async () => {
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'food', productHint: '카페' },
    });
    expect(r.suggestedTone).toBe('casual');
    expect(r.aggregate?.totalPosts).toBe(5);
  });

  it('브랜드 B는 expert_review 톤 추천', async () => {
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'B',
      basePersonaInput: { category: 'food', productHint: '카페' },
    });
    expect(r.suggestedTone).toBe('expert_review');
    expect(r.aggregate?.totalPosts).toBe(4);
  });

  it('같은 입력이라도 브랜드별로 persona.tone이 다름', async () => {
    const baseInput = { category: 'food' as const, productHint: '카페' };
    const rA = await enrichPersonaWithBrandTone({ brandEmbedder: be, accountId: 'A', basePersonaInput: baseInput });
    const rB = await enrichPersonaWithBrandTone({ brandEmbedder: be, accountId: 'B', basePersonaInput: baseInput });
    const personaA = buildPersona(rA.enrichedPersonaInput);
    const personaB = buildPersona(rB.enrichedPersonaInput);
    expect(personaA.tone).toBe('casual');
    expect(personaB.tone).toBe('expert_review');
    expect(personaA.tone).not.toBe(personaB.tone);
  });

  it('searchSimilarPosts에서 브랜드 누수 X', async () => {
    const hitsA = await be.searchSimilarPosts({ accountId: 'A', query: '카페' });
    const hitsB = await be.searchSimilarPosts({ accountId: 'B', query: '카페' });
    expect(hitsA.every((h) => h.metadata?.accountId === 'A')).toBe(true);
    expect(hitsB.every((h) => h.metadata?.accountId === 'B')).toBe(true);
    // 두 결과 집합의 ID 교집합 0
    const idsA = new Set(hitsA.map((h) => h.id));
    const idsB = new Set(hitsB.map((h) => h.id));
    for (const id of idsA) expect(idsB.has(id)).toBe(false);
  });

  it('같은 브랜드에 대한 두 호출은 결정론 (같은 톤·aggregate)', async () => {
    const baseInput = { category: 'food' as const, productHint: '카페' };
    const r1 = await enrichPersonaWithBrandTone({ brandEmbedder: be, accountId: 'A', basePersonaInput: baseInput });
    const r2 = await enrichPersonaWithBrandTone({ brandEmbedder: be, accountId: 'A', basePersonaInput: baseInput });
    expect(r1.suggestedTone).toBe(r2.suggestedTone);
    expect(r1.aggregate?.totalPosts).toBe(r2.aggregate?.totalPosts);
    expect(r1.addedVocabulary).toEqual(r2.addedVocabulary);
  });

  it('브랜드 삭제 후 그 브랜드 검색은 0건', async () => {
    const store = new InMemoryVectorStore();
    const local = createBrandEmbedder({ embedder: new HashEmbedder(64), store });
    await local.upsertPost({ accountId: 'X', postId: '1', title: '글', bodyText: '본문' });
    expect(store.size()).toBe(1);
    await local.deleteAccountPosts('X');
    expect(store.size()).toBe(0);
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: local,
      accountId: 'X',
      basePersonaInput: { category: 'food' },
    });
    expect(r.fallbackReason).toMatch(/NO_BRAND_DATA/);
  });
});
