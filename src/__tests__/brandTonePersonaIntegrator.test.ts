/**
 * SPEC-CONVERSION-001 L4-3.2 — brandTonePersonaIntegrator 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import { enrichPersonaWithBrandTone } from '../content/brandTonePersonaIntegrator';
import { buildPersona } from '../content/personaBuilder';
import { createBrandEmbedder } from '../rag/brandEmbedder';
import { HashEmbedder } from '../rag/embedder';
import { InMemoryVectorStore } from '../rag/vectorStore';

function makeBrandEmbedder() {
  const store = new InMemoryVectorStore();
  return createBrandEmbedder({ embedder: new HashEmbedder(64), store });
}

describe('enrichPersonaWithBrandTone — 정상', () => {
  it('userVoice + tone 추천 자동 주입', async () => {
    const be = makeBrandEmbedder();
    await be.upsertPostBatch([
      { accountId: 'A', postId: '1', title: '강남 카페 후기', bodyText: '카페 분위기 메뉴 인테리어 본문 텍스트', category: 'food', tone: 'casual' },
      { accountId: 'A', postId: '2', title: '강남 맛집 정리', bodyText: '맛집 카페 리스트 본문 텍스트', category: 'food', tone: 'casual' },
      { accountId: 'A', postId: '3', title: '서울 디저트 추천', bodyText: '디저트 카페 본문 텍스트', category: 'food', tone: 'friendly' },
    ]);

    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'food', productHint: '강남 카페' },
      query: '강남 카페',
    });

    expect(r.aggregate?.totalPosts).toBe(3);
    expect(r.suggestedTone).toBe('casual'); // 최빈
    expect(r.enrichedPersonaInput.toneOverride).toBe('casual');
    expect(r.addedUserVoice.length).toBeGreaterThan(0);
  });

  it('basePersonaInput.toneOverride가 있으면 추천 무시 (사용자 우선)', async () => {
    const be = makeBrandEmbedder();
    await be.upsertPost({
      accountId: 'A', postId: '1', title: '글 제목', bodyText: '본문',
      tone: 'mom_cafe',
    });
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'food', toneOverride: 'professional' },
    });
    expect(r.enrichedPersonaInput.toneOverride).toBe('professional');
  });

  it('userVoice 기존 값 보존 + 신규 append', async () => {
    const be = makeBrandEmbedder();
    await be.upsertPost({
      accountId: 'A', postId: '1', title: '강남 카페 후기',
      bodyText: '본문 텍스트', tone: 'casual',
    });
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'food', userVoice: ['기존 댓글 1'] },
      query: '강남 카페',
    });
    expect(r.enrichedPersonaInput.userVoice).toContain('기존 댓글 1');
    expect((r.enrichedPersonaInput.userVoice ?? []).length).toBeGreaterThan(1);
  });

  it('persona 빌더와 함께 사용 — toneOverride 반영', async () => {
    const be = makeBrandEmbedder();
    await be.upsertPostBatch([
      { accountId: 'A', postId: '1', title: '글', bodyText: '본문', tone: 'expert_review' },
      { accountId: 'A', postId: '2', title: '글2', bodyText: '본문', tone: 'expert_review' },
    ]);
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'tech' },
    });
    const persona = buildPersona(r.enrichedPersonaInput);
    expect(persona.tone).toBe('expert_review');
  });
});

describe('enrichPersonaWithBrandTone — fallback', () => {
  it('빈 accountId는 명시 reason + base 그대로 반환', async () => {
    const be = makeBrandEmbedder();
    const base = { category: 'food' as const };
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: '',
      basePersonaInput: base,
    });
    expect(r.fallbackReason).toMatch(/ACCOUNT_ID_EMPTY/);
    expect(r.enrichedPersonaInput).toBe(base);
  });

  it('아직 글이 없는 accountId는 NO_BRAND_DATA', async () => {
    const be = makeBrandEmbedder();
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'NEW_BRAND',
      basePersonaInput: { category: 'food' },
    });
    expect(r.fallbackReason).toMatch(/NO_BRAND_DATA/);
  });

  it('알 수 없는 tone 라벨은 추천 후보에서 제외', async () => {
    const be = makeBrandEmbedder();
    await be.upsertPostBatch([
      { accountId: 'A', postId: '1', title: '글', bodyText: '본문', tone: '존재하지않는톤' },
      { accountId: 'A', postId: '2', title: '글', bodyText: '본문', tone: 'casual' },
    ]);
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'food' },
    });
    expect(r.suggestedTone).toBe('casual');
  });
});

describe('enrichPersonaWithBrandTone — 보안 (개인정보 sanitize)', () => {
  it('전화번호·이메일·@핸들 제거', async () => {
    const be = makeBrandEmbedder();
    await be.upsertPost({
      accountId: 'A', postId: '1',
      title: '전화 010-1234-5678 카페 후기 abc@x.com @user',
      bodyText: '본문', category: 'food', tone: 'casual',
    });
    const r = await enrichPersonaWithBrandTone({
      brandEmbedder: be,
      accountId: 'A',
      basePersonaInput: { category: 'food' },
      query: '카페',
    });
    for (const v of r.addedUserVoice) {
      expect(v).not.toMatch(/010-\d+-\d+/);
      expect(v).not.toMatch(/@\S+/);
      expect(v).not.toMatch(/abc@x\.com/);
    }
  });
});
