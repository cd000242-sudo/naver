/**
 * SPEC-CONVERSION-001 L2-2.2 — 네이버쇼핑 경쟁 제품 수집 셀렉터
 *
 * 위치: search.shopping.naver.com (검색 결과 페이지)
 * 수집 항목: 제품명·가격·평점·리뷰수·셀러명·썸네일·랭킹.
 *
 * 본 셀렉터는 spike script(scripts/spike/shopping-competitor-dom.ts)로
 * 검증한 후 운영 투입 권장. 운영 전엔 fallback에 다양한 변종 명시.
 * SPEC-CONVERSION-001 L2-2.1: spike 미실행 시 수집 성공률 낮을 수 있음 → flag OFF 유지.
 */
import type { SelectorEntry, SelectorMap } from './types';

export type ShoppingCompetitorSelectorKey =
  | 'productList'
  | 'productCard'
  | 'productName'
  | 'productPrice'
  | 'productRating'
  | 'productReviewCount'
  | 'productSeller'
  | 'productThumbnail'
  | 'productLink'
  | 'pagination';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary,
  fallbacks,
  description,
});

export const SHOPPING_COMPETITOR_SELECTORS: SelectorMap<ShoppingCompetitorSelectorKey> = {
  productList: entry(
    'ul.list_basis',
    ['div.basicList_list_basis__uNBZx', 'ul[class*="list_basis"]', 'div[class*="list_basis"]'],
    '검색 결과 제품 리스트 컨테이너',
  ),
  productCard: entry(
    'li.basicList_item__0T9JD',
    ['li[class*="basicList_item"]', 'div[class*="basicList_item"]', 'li.product_item'],
    '개별 제품 카드',
  ),
  productName: entry(
    'a.basicList_link__JLQJf',
    ['a[class*="basicList_link"]', 'a.product_name', 'a[class*="product_link"]'],
    '제품명 링크',
  ),
  productPrice: entry(
    'span.price_num__S2p_v',
    ['span[class*="price_num"]', 'strong.price_num', 'em.price_num', 'span[class*="num"]'],
    '제품 가격 (숫자 영역)',
  ),
  productRating: entry(
    'span.basicList_star__r0Wii',
    ['span[class*="basicList_star"]', 'em.starvalue', 'span[class*="rating"]'],
    '제품 평점 (별점 수치)',
  ),
  productReviewCount: entry(
    'em.basicList_num__sfz3h',
    ['em[class*="basicList_num"]', 'a[class*="review"] em', 'span[class*="review_num"]'],
    '리뷰 개수',
  ),
  productSeller: entry(
    'a.basicList_mall_name__pbqI4',
    ['a[class*="basicList_mall"]', 'a.mall_name', 'span[class*="mall_name"]'],
    '판매 셀러·몰명',
  ),
  productThumbnail: entry(
    'img.thumbnail_thumb__Bxb6Z',
    ['img[class*="thumbnail_thumb"]', 'img.product_thumb', 'div[class*="thumbnail"] img'],
    '제품 썸네일 이미지',
  ),
  productLink: entry(
    'a.basicList_link__JLQJf',
    ['a[class*="basicList_link"]', 'a[href*="/catalog"]', 'a[href*="smartstore"]'],
    '제품 상세 링크',
  ),
  pagination: entry(
    'div.pagination_pagination__fsPwM',
    ['div[class*="pagination_pagination"]', 'div.paginate', 'a[class*="pagination_next"]'],
    '페이지네이션 컨테이너',
  ),
};
