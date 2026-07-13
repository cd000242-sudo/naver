// SPEC-STABILITY-2026 (쇼핑커넥트 크롤 보강) — JSON-LD Product parser.
//
// Smartstore/brand pages rotate obfuscated CSS classes on every deploy, so
// DOM selectors rot silently (live 실측 2026-06-12: 상품명이 스토어 인사말로
// 오염, 리뷰/스펙 0). The price fallback already proved JSON-LD survives those
// rotations — this module extends the same source to name/reviews/rating.
// Pure function over raw <script type="application/ld+json"> contents so it
// is unit-testable without a browser.

import { formatPrice } from '../../../services/priceNormalizer.js';

export interface JsonLdProductInfo {
  name?: string;
  description?: string;
  price?: string;
  priceCurrency?: string;
  availability?: string;
  canonicalUrl?: string;
  reviewTexts: string[];
  reviewCount?: number;
  rating?: string;
  /** Product gallery images — string, string[] and ImageObject forms. */
  images: string[];
}

interface JsonLdOfferInfo {
  price?: string;
  priceCurrency?: string;
  availability?: string;
  canonicalUrl?: string;
}

const MAX_REVIEW_TEXTS = 5;
const MIN_REVIEW_LEN = 20;
const MAX_REVIEW_LEN = 500;

function isProductNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object') return false;
  const type = (node as Record<string, unknown>)['@type'];
  if (typeof type === 'string') return type.toLowerCase() === 'product';
  if (Array.isArray(type)) return type.some((t) => String(t).toLowerCase() === 'product');
  return false;
}

function collectNodes(root: unknown, out: Record<string, unknown>[]): void {
  if (!root || typeof root !== 'object') return;
  if (Array.isArray(root)) {
    for (const item of root) collectNodes(item, out);
    return;
  }
  const obj = root as Record<string, unknown>;
  if (isProductNode(obj)) out.push(obj);
  if (Array.isArray(obj['@graph'])) collectNodes(obj['@graph'], out);
}

function extractImageUrls(image: unknown): string[] {
  const items = Array.isArray(image) ? image : image ? [image] : [];
  const urls: string[] = [];
  for (const item of items) {
    let url = '';
    if (typeof item === 'string') url = item;
    else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      url = typeof obj.url === 'string' ? obj.url : typeof obj.contentUrl === 'string' ? obj.contentUrl : '';
    }
    url = url.trim();
    if (url.startsWith('http')) urls.push(url);
  }
  return urls;
}

function extractReviewTexts(review: unknown): string[] {
  const items = Array.isArray(review) ? review : review ? [review] : [];
  const texts: string[] = [];
  for (const item of items) {
    if (texts.length >= MAX_REVIEW_TEXTS) break;
    if (!item || typeof item !== 'object') continue;
    const body = (item as Record<string, unknown>).reviewBody
      ?? (item as Record<string, unknown>).description;
    const text = typeof body === 'string' ? body.trim() : '';
    if (text.length >= MIN_REVIEW_LEN && text.length <= MAX_REVIEW_LEN) texts.push(text);
  }
  return texts;
}

function extractOfferInfo(offers: unknown): JsonLdOfferInfo {
  const candidates = Array.isArray(offers) ? offers : offers ? [offers] : [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const offer = candidate as Record<string, unknown>;
    const priceSpec = offer.priceSpecification && typeof offer.priceSpecification === 'object'
      ? offer.priceSpecification as Record<string, unknown>
      : undefined;
    const normalizedPrice = formatPrice(
      offer.price ?? offer.lowPrice ?? priceSpec?.price,
    );
    if (!normalizedPrice) continue;

    return {
      price: normalizedPrice,
      priceCurrency: typeof (offer.priceCurrency ?? priceSpec?.priceCurrency) === 'string'
        ? String(offer.priceCurrency ?? priceSpec?.priceCurrency).trim()
        : undefined,
      availability: typeof offer.availability === 'string'
        ? offer.availability.trim()
        : undefined,
      canonicalUrl: typeof offer.url === 'string' ? offer.url.trim() : undefined,
    };
  }

  return {};
}

/** Parse raw ld+json script contents into product info. Malformed JSON is skipped. */
export function parseProductJsonLd(rawScripts: ReadonlyArray<string | null | undefined>): JsonLdProductInfo {
  const products: Record<string, unknown>[] = [];
  for (const raw of rawScripts) {
    if (!raw || typeof raw !== 'string') continue;
    try {
      collectNodes(JSON.parse(raw), products);
    } catch { /* malformed script block — ignore, others may parse */ }
  }

  const result: JsonLdProductInfo = { reviewTexts: [], images: [] };
  for (const product of products) {
    for (const url of extractImageUrls(product.image)) {
      if (!result.images.includes(url)) result.images.push(url);
    }
    if (!result.name && typeof product.name === 'string' && product.name.trim().length > 2) {
      result.name = product.name.trim();
    }
    if (!result.description && typeof product.description === 'string' && product.description.trim()) {
      result.description = product.description.trim();
    }
    if (!result.price) {
      const offerInfo = extractOfferInfo(product.offers);
      result.price = offerInfo.price;
      result.priceCurrency = offerInfo.priceCurrency;
      result.availability = offerInfo.availability;
      result.canonicalUrl = offerInfo.canonicalUrl;
    }
    if (result.reviewTexts.length < MAX_REVIEW_TEXTS) {
      const more = extractReviewTexts(product.review);
      for (const text of more) {
        if (result.reviewTexts.length >= MAX_REVIEW_TEXTS) break;
        if (!result.reviewTexts.includes(text)) result.reviewTexts.push(text);
      }
    }
    const agg = product.aggregateRating;
    if (agg && typeof agg === 'object') {
      const aggObj = agg as Record<string, unknown>;
      const count = Number(aggObj.reviewCount ?? aggObj.ratingCount);
      if (result.reviewCount === undefined && Number.isFinite(count) && count > 0) {
        result.reviewCount = count;
      }
      const rating = aggObj.ratingValue;
      if (!result.rating && (typeof rating === 'string' || typeof rating === 'number')) {
        result.rating = String(rating);
      }
    }
  }
  return result;
}
