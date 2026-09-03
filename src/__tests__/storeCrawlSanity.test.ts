import { describe, expect, it } from 'vitest';

import { isEmptyProductCrawl, isStorePageTitle, looksLikeStoreErrorPage } from '../crawler/storeCrawlSanity';

/** [2026-09-03 라이브] 429 에러 페이지를 "성공"으로 넘겨 재료 0으로 글이 생성된 사고 */
describe('스토어 크롤 정합성', () => {
  it('스토어 페이지 제목은 상품명이 아니다', () => {
    expect(isStorePageTitle('삼성전자공식파트너 쇼마젠시 : 네이버 스마트스토어')).toBe(true);
    expect(isStorePageTitle('닥터웰 종아리 공기압 마사지기 발 장화 안마기 에어웨이브 DR-5180 (그레이)본체+다리')).toBe(false);
  });

  it('에러/차단 페이지 제목·본문을 알아본다', () => {
    expect(looksLikeStoreErrorPage('[에러] 에러페이지 - 시스템오류', '')).toBe(true);
    expect(looksLikeStoreErrorPage('싱글가젯', '현재 서비스 접속이 불가합니다. 동시에 접속하는 이용자 수가 많거나')).toBe(true);
    expect(looksLikeStoreErrorPage('닥터웰 종아리 공기압 마사지기 : 닥터웰', '상품 상세 리뷰 12건')).toBe(false);
  });

  it('가격·리뷰·스펙·설명이 전부 비면 빈 크롤이다', () => {
    expect(isEmptyProductCrawl({ name: '삼성전자공식파트너 쇼마젠시 : 네이버 스마트스토어', price: 0, description: '삼성전자공식파트너 쇼마젠시', reviewTexts: [] })).toBe(true);
    expect(isEmptyProductCrawl({ name: '어떤 상품', price: null, description: '짧은 설명', reviewTexts: [], specText: '' })).toBe(true);
    expect(isEmptyProductCrawl({ name: '닥터웰 DR-5180', price: 135000, description: '', reviewTexts: [] })).toBe(false);
    expect(isEmptyProductCrawl({ name: '닥터웰 DR-5180', price: null, description: '', reviewTexts: ['소음이 좀 있어요'] })).toBe(false);
  });
});
