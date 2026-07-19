import { selectDecisionUsefulReviewTexts } from '../crawler/shopping/utils/reviewTextSelection.js';
import { parsePrice } from '../services/priceNormalizer.js';

export interface ShoppingEvidenceInput {
  url: string;
  title?: string;
  description?: string;
  spec?: string;
  price?: string;
  reviews?: unknown;
  images?: string[];
  resolvedUrl?: string;
  hasProductStructuredData?: boolean;
}

export interface ShoppingEvidenceSnapshot {
  usable: boolean;
  url: string;
  title?: string;
  rawText: string;
  productPrice?: string;
  productSpec?: string;
  productReviews: string[];
  images: string[];
  evidenceMode: 'review_synthesis' | 'spec_only';
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function uniqueImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => /^https?:\/\//i.test(item)))];
}

function hasProductDetailIdentity(value: string): boolean {
  try {
    const url = new URL(value);
    if (/(?:^|\/)(?:blog|article|news|post|guide)(?:\/|$)/i.test(url.pathname)) return false;
    if (/(?:^|\/)(?:product|products|goods|item|detail)(?:\/|$)/i.test(url.pathname)) return true;
    if (/(?:shopdetail|goods[_-]?view|product[_-]?detail)(?:\.(?:html?|php))?/i.test(url.pathname)) return true;
    const queryKeys = [...url.searchParams.keys()];
    if (queryKeys.some(key => /^(?:product_?no|product_?id|goods_?no|goods_?id|goods_?idx|item_?id|item_?no|branduid)$/i.test(key))) {
      return true;
    }
    const hasCommercePath = /(?:^|\/)(?:shop|mall|store|goods|product|item|catalog)(?:\/|$)/i.test(url.pathname);
    return hasCommercePath && queryKeys.some(key => /^(?:index_?no|idx|pno)$/i.test(key));
  } catch {
    return false;
  }
}

/**
 * Converts a commerce crawl result into immutable, explicitly labelled
 * evidence. It never summarizes reviews or invents missing product facts.
 */
export function buildShoppingEvidenceSnapshot(input: ShoppingEvidenceInput): ShoppingEvidenceSnapshot {
  const title = normalizeText(input.title, 300);
  const description = normalizeText(input.description, 3_000);
  const spec = normalizeText(input.spec, 2_000);
  const productReviews = selectDecisionUsefulReviewTexts(input.reviews, 12);
  const parsedPrice = parsePrice(input.price);
  const productPrice = parsedPrice === null ? undefined : `${parsedPrice.toLocaleString('ko-KR')}원`;
  const productSpec = [description, spec]
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex(other => other === value) === index)
    .join('\n') || undefined;
  const images = uniqueImages(input.images);
  const url = input.resolvedUrl || input.url;
  const hasProductIdentity = input.hasProductStructuredData === true
    || hasProductDetailIdentity(url);
  const hasConcreteProductEvidence = Boolean(
    input.hasProductStructuredData === true
    || (hasProductIdentity && (
      productPrice
      || productReviews.length > 0
      || (productSpec && productSpec.length >= 40)
    ))
    || (productPrice && productReviews.length > 0),
  );
  const usable = title.length >= 3 && hasConcreteProductEvidence;
  const rawParts = [
    title ? `상품명: ${title}` : '',
    productPrice ? `표시 가격: ${productPrice}` : '',
    productSpec ? `=== 판매 페이지 상품 정보 ===\n${productSpec}` : '',
    productReviews.length > 0
      ? `=== 실제 구매자 후기 ===\n${productReviews.map((review, index) => `REVIEW_${index + 1}: ${review}`).join('\n')}`
      : '',
    `출처 URL: ${url}`,
  ].filter(Boolean);

  return {
    usable,
    url,
    title: title || undefined,
    rawText: rawParts.join('\n\n'),
    productPrice,
    productSpec,
    productReviews,
    images,
    evidenceMode: productReviews.length > 0 ? 'review_synthesis' : 'spec_only',
  };
}
