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
  const hasConcreteProductEvidence = Boolean(
    productPrice
    || productReviews.length > 0
    || (productSpec && productSpec.length >= 40),
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

