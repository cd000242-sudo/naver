/**
 * [2026-11-05] 쇼핑커넥트 소제목 점검(저장 기록이 없어 실제 상품 제목·소제목 조합으로 재현).
 *
 * 1. "미쉐린 프라이머시 4 플러스 소음은 줄어들까" → "플러스 소음은 줄어들까": the title-word candidate
 *    "미쉐린 프라이머시 4 플러스," kept its comma, so only "미쉐린 프라이머시 4" matched and the cut landed
 *    inside the product name.
 * 2. "닥터웰 DR-5180 착용 방식은 편할까" was dropped as a duplicate of the title "닥터웰 DR-5180 마사지기, …"
 *    because the first 10 characters matched — the whole first section disappeared. Same risk for business
 *    posts whose first heading starts with "수원 영통 욕실 리…".
 */
import { describe, expect, it } from 'vitest';
import { validateStructuredContent } from '../contentStructuredValidator';
import { stripReviewTitlePrefixFromHeading } from '../contentTitlePrefixHelpers';

const run = (title: string, headings: string[], source: Record<string, unknown>) => {
  const content: any = {
    selectedTitle: title,
    introduction: '도입',
    headings: headings.map((t) => ({ title: t, content: '본문' })),
    hashtags: [],
  };
  validateStructuredContent(content, source as any);
  return content.headings.map((h: any) => h.title);
};

describe('title/product prefix strip never cuts inside the product name', () => {
  it('strips the whole "미쉐린 프라이머시 4 플러스", not a fragment of it', () => {
    const out = stripReviewTitlePrefixFromHeading(
      '미쉐린 프라이머시 4 플러스 소음은 줄어들까',
      '미쉐린 프라이머시 4 플러스, 승차감 바꾸려는 분께',
      '미쉐린 프라이머시 4 플러스 타이어',
    );
    expect(out).not.toMatch(/^플러스/u);
    expect(['소음은 줄어들까', '미쉐린 프라이머시 4 플러스 소음은 줄어들까']).toContain(out);
  });

  it('keeps product prefixes that do strip cleanly (control)', () => {
    const out = stripReviewTitlePrefixFromHeading(
      '쿠쿠 6인용 IH 밥솥 용량은 3인 가족에 맞을까',
      '쿠쿠 6인용 IH 밥솥, 3인 가족에게 충분할까',
      '쿠쿠 6인용 IH 전기압력밥솥',
    );
    // The whole repeated title phrase ("쿠쿠 6인용 IH 밥솥") may go; either way no fragment of it is left behind.
    expect(['용량은 3인 가족에 맞을까', '밥솥 용량은 3인 가족에 맞을까']).toContain(out);
  });
});

describe('first heading is dropped only when it really repeats the title', () => {
  const shopping = { contentMode: 'affiliate', articleType: 'shopping_review', productInfo: { name: '닥터웰 DR-5180 마사지기' } };

  it('keeps a first heading that only shares the product name with the title', () => {
    const out = run('닥터웰 DR-5180 마사지기, 매일 쓰기엔 어떨까', ['닥터웰 DR-5180 착용 방식은 편할까', '소음은 어느 정도일까', '구매 전 확인할 것'], shopping);
    expect(out).toHaveLength(3);
  });

  it('keeps a business first heading that starts with the region + service phrase', () => {
    const out = run(
      '수원 영통 욕실 리모델링, 덧방 2~3일 철거 4~5일 갈리는 기준',
      ['수원 영통 욕실 리모델링 순서는 어떻게 되나요?', '견적은 무료인가요?', '시공 문의 안내'],
      { contentMode: 'business', articleType: 'interior' },
    );
    expect(out[0]).toBe('수원 영통 욕실 리모델링 순서는 어떻게 되나요?');
  });

  it('still drops a first heading identical to the title (control)', () => {
    const out = run('청약통장 금리 인상 정리', ['청약통장 금리 인상 정리', '인상 폭은 얼마나', '언제부터 적용되나'], { contentMode: 'seo' });
    expect(out).toEqual(['인상 폭은 얼마나', '언제부터 적용되나']);
  });
});
