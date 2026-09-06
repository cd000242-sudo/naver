import { describe, expect, it } from 'vitest';

import { sanitizeReviewTitle } from '../contentKeywordPrefix';
import { validateStructuredContent } from '../contentStructuredValidator';

/**
 * [2026-09-03 생성 실측 2026-09-03T02-29-42] 검증기가 리뷰형 글의 제목·후보 전부에 상품명 앞머리를 "보장" 해
 *   "닥터웰 종아리 공기압 마사지기 닥터웰 종아리 마사지기 DR-5180, …" 이 됐고, 중복 제거기가 검색어를 토막 냈다.
 *   쇼핑은 검색어가 앞이다(ensureFront3). 검증기는 쇼핑에서 상품명을 붙이지 않는다.
 */
const productName = '닥터웰 종아리 공기압 마사지기 발 장화 안마기 에어웨이브 DR-5180 (그레이)본체+다리';
const title = '닥터웰 종아리 마사지기 DR-5180, 유선인데 괜찮을까';

describe('쇼핑 제목 — 검증기의 상품명 접두', () => {
  it('sanitizeReviewTitle 은 ensureProductPrefix:false 면 상품명을 붙이지 않고 나머지 정제만 한다', () => {
    expect(sanitizeReviewTitle(title, productName, { ensureProductPrefix: false })).toBe(title);
    expect(sanitizeReviewTitle(`${title}!!!`, productName, { ensureProductPrefix: false })).toBe(title);
    expect(sanitizeReviewTitle(title, productName)).not.toBe(title); // 기본값은 예전대로 붙인다
  });

  it('검증기: 쇼핑(affiliate)이면 제목·후보에 상품명이 안 붙고, 다른 리뷰형은 예전대로 붙는다', () => {
    const make = (contentMode: string, selectedTitle = title) => ({
      content: { selectedTitle, titleAlternatives: [selectedTitle], bodyPlain: '본문 '.repeat(200), headings: [] } as any,
      source: { articleType: 'shopping_review', contentMode, productInfo: { name: productName }, title: productName } as any,
    });
    const shop = make('affiliate');
    validateStructuredContent(shop.content, shop.source);
    expect(shop.content.selectedTitle).toBe(title);
    expect(shop.content.titleAlternatives[0]).toBe(title);
    // 다른 리뷰형: 상품명이 없는 제목에는 예전대로 붙는다 (상품명을 이미 품은 제목은 변형구 판정이 생략)
    const bare = '유선인데 괜찮을까, 압박 위치가 관건';
    const seo = make('seo', bare);
    validateStructuredContent(seo.content, seo.source);
    expect(seo.content.selectedTitle).not.toBe(bare);
    expect(seo.content.selectedTitle.startsWith('닥터웰')).toBe(true);
  });
});
