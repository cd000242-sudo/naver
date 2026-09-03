/**
 * [2026-09-03 live] Naver storefront answered 429 ("[에러] 에러페이지 - 시스템오류") to the
 * brandconnect → store crawl, yet the crawler reported success with the *store page title*
 * ("삼성전자공식파트너 쇼마젠시 : 네이버 스마트스토어") as the product name, price 0,
 * spec none, reviews 0 — and a post was generated about nothing. These checks turn that
 * into an explicit failure so the flow can stop and say why.
 */
import { ERROR_PAGE_INDICATORS } from './shopping/types.js';

const STORE_TITLE_SUFFIX = /:\s*네이버\s*(?:스마트스토어|브랜드스토어)\s*$|네이버\s*(?:스마트스토어|브랜드스토어)\s*$/;

export function isStorePageTitle(name: unknown): boolean {
  const text = String(name || '').trim();
  return text.length > 0 && STORE_TITLE_SUFFIX.test(text);
}

export function looksLikeStoreErrorPage(title: unknown, bodyText: unknown): boolean {
  const haystack = `${String(title || '')}\n${String(bodyText || '').slice(0, 800)}`.toLowerCase();
  return ERROR_PAGE_INDICATORS.some((marker) => haystack.includes(marker.toLowerCase()));
}

export interface ProductCrawlShape {
  readonly name?: unknown;
  readonly price?: unknown;
  readonly description?: unknown;
  readonly specText?: unknown;
  readonly reviewTexts?: unknown;
}

/** True when nothing usable came back: store-title-only name, or no price + no reviews + no spec + thin description. */
export function isEmptyProductCrawl(info: ProductCrawlShape): boolean {
  if (isStorePageTitle(info.name)) return true;
  const priceMissing = info.price === null || info.price === undefined || info.price === '' || Number(info.price) === 0;
  const reviews = Array.isArray(info.reviewTexts) ? info.reviewTexts.length : 0;
  const description = String(info.description || '').trim();
  const spec = String(info.specText || '').trim();
  return priceMissing && reviews === 0 && spec.length === 0 && description.length < 80;
}
