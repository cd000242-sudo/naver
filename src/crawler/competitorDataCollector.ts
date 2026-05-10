/**
 * SPEC-CONVERSION-001 L2-2.3 — 네이버쇼핑 경쟁 제품 수집기
 *
 * 검색어를 받아 상위 N개 경쟁 제품 정보를 수집한다.
 *
 * 설계 원칙 (Dependency Injection):
 *   - 본 모듈은 Puppeteer/Playwright 의존성을 *직접 import하지 않음*.
 *   - 호출자(contentGenerator 또는 spike script)가 PageLike 인터페이스를 주입.
 *   - 단위 테스트는 PageLike의 in-memory mock으로 결정론 검증 가능.
 *
 * Feature flag: COMPETITOR_DATA_V1 (기본 OFF). 운영 투입은
 *   (1) spike script로 셀렉터 검증 + (2) flag ON 후 점진 롤아웃 순서.
 *
 * 메모리 [silent 폴백 금지]: 수집 실패는 명시 reason 반환 — 호출자가 결정.
 * 메모리 [추정 효과 금지]: 수집 성공률 약속 X — 운영 메트릭으로 calibrate.
 *
 * 파일 한도 250줄 준수.
 */

import { SHOPPING_COMPETITOR_SELECTORS } from '../automation/selectors/shoppingCompetitorSelectors';

const FEATURE_FLAG_ENV = 'COMPETITOR_DATA_V1';
const DEFAULT_TOP_N = 10;
const HARD_MAX_TOP_N = 30;
const DEFAULT_TIMEOUT_MS = 12_000;

export interface CompetitorProduct {
  readonly name: string;
  readonly priceWon: number;
  readonly rating: number | null;       // 0~5 (null이면 미수집)
  readonly reviewCount: number | null;
  readonly seller: string | null;
  readonly thumbnailUrl: string | null;
  readonly productUrl: string | null;
  readonly rank: number;                // 1-based 검색 결과 순위
}

export interface CompetitorCollectorInput {
  readonly query: string;
  readonly topN?: number;
  readonly forceFlag?: boolean;          // 테스트용 — env 무시하고 강제 ON/OFF
  readonly timeoutMs?: number;
  readonly fetcher: PageLike;            // DI: Puppeteer/Playwright 또는 mock
}

export interface CompetitorCollectorResult {
  readonly enabled: boolean;
  readonly query: string;
  readonly products: readonly CompetitorProduct[];
  readonly successRate: number;          // 0~1 (수집된/시도된)
  readonly elapsedMs: number;
  readonly fallbackReason?: string;
}

/**
 * 호출자가 주입할 인터페이스. Puppeteer Page · Playwright Page 모두 만족.
 * Mock 구현으로 단위 테스트 가능.
 */
export interface PageLike {
  readonly goto: (url: string, options?: { timeout?: number }) => Promise<void>;
  readonly waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>;
  readonly evaluate: <T>(fn: (s: unknown) => T, arg?: unknown) => Promise<T>;
}

export function isCompetitorCollectorEnabled(forceFlag?: boolean): boolean {
  if (forceFlag === true) return true;
  if (forceFlag === false) return false;
  const v = (process.env[FEATURE_FLAG_ENV] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'on';
}

function buildSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query.trim());
  return `https://search.shopping.naver.com/search/all?query=${encoded}`;
}

/**
 * 가격 문자열에서 숫자 추출. "12,500원" → 12500, "1만원" → 10000.
 * 추정·환산 결과가 비현실적(<100, >1억)이면 0 반환 (silent 위조 X).
 */
export function parseKoreanPrice(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d만천원]/g, '');
  if (!cleaned) return 0;
  const manMatch = cleaned.match(/(\d+)만/);
  const cheonMatch = cleaned.match(/(\d+)천/);
  let result = 0;
  if (manMatch) result += parseInt(manMatch[1], 10) * 10_000;
  if (cheonMatch) result += parseInt(cheonMatch[1], 10) * 1_000;
  if (result === 0) {
    const numOnly = cleaned.replace(/[^\d]/g, '');
    if (numOnly) result = parseInt(numOnly, 10);
  }
  if (result < 100 || result > 100_000_000) return 0;
  return result;
}

export function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (Number.isNaN(v) || v < 0 || v > 5) return null;
  return v;
}

export function parseReviewCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,()리뷰\s]/g, '');
  const v = parseInt(cleaned, 10);
  if (Number.isNaN(v) || v < 0 || v > 10_000_000) return null;
  return v;
}

/**
 * 페이지 evaluate 컨텍스트에서 실행될 추출 함수 (브라우저 측).
 * 셀렉터 후보를 순차 시도해 가장 처음 매치된 것을 사용.
 */
function browserSideExtractor(): unknown {
  // NOTE: 본 함수 본문은 evaluate 시 브라우저에 직렬화 전송된다.
  //       외부 변수·imports를 참조할 수 없으므로 self-contained.
  const SEL = (window as any).__SHOPPING_COMPETITOR_SEL__ as Record<string, string[]>;
  if (!SEL) return [];

  const tryQuery = (root: Element | Document, candidates: string[]): Element | null => {
    for (const sel of candidates) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  };
  const tryQueryAll = (root: Element | Document, candidates: string[]): Element[] => {
    for (const sel of candidates) {
      const els = root.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }
    return [];
  };

  const cards = tryQueryAll(document, SEL.productCard);
  return cards.slice(0, 30).map((card, idx) => {
    const nameEl = tryQuery(card, SEL.productName);
    const priceEl = tryQuery(card, SEL.productPrice);
    const ratingEl = tryQuery(card, SEL.productRating);
    const reviewEl = tryQuery(card, SEL.productReviewCount);
    const sellerEl = tryQuery(card, SEL.productSeller);
    const thumbEl = tryQuery(card, SEL.productThumbnail) as HTMLImageElement | null;
    const linkEl = tryQuery(card, SEL.productLink) as HTMLAnchorElement | null;
    return {
      rank: idx + 1,
      name: (nameEl?.textContent ?? '').trim(),
      priceText: (priceEl?.textContent ?? '').trim(),
      ratingText: (ratingEl?.textContent ?? '').trim(),
      reviewText: (reviewEl?.textContent ?? '').trim(),
      seller: (sellerEl?.textContent ?? '').trim(),
      thumbnailUrl: thumbEl?.src ?? null,
      productUrl: linkEl?.href ?? null,
    };
  });
}

interface RawCompetitor {
  rank: number;
  name: string;
  priceText: string;
  ratingText: string;
  reviewText: string;
  seller: string;
  thumbnailUrl: string | null;
  productUrl: string | null;
}

function normalizeRaw(raw: RawCompetitor): CompetitorProduct {
  return {
    rank: raw.rank,
    name: raw.name,
    priceWon: parseKoreanPrice(raw.priceText),
    rating: parseRating(raw.ratingText),
    reviewCount: parseReviewCount(raw.reviewText),
    seller: raw.seller || null,
    thumbnailUrl: raw.thumbnailUrl,
    productUrl: raw.productUrl,
  };
}

export async function collectCompetitorProducts(
  input: CompetitorCollectorInput,
): Promise<CompetitorCollectorResult> {
  const start = Date.now();
  const enabled = isCompetitorCollectorEnabled(input.forceFlag);

  if (!enabled) {
    return {
      enabled: false,
      query: input.query,
      products: [],
      successRate: 0,
      elapsedMs: Date.now() - start,
      fallbackReason: `Feature flag ${FEATURE_FLAG_ENV} 미활성화`,
    };
  }

  if (!input.query || !input.query.trim()) {
    return {
      enabled: true,
      query: input.query ?? '',
      products: [],
      successRate: 0,
      elapsedMs: Date.now() - start,
      fallbackReason: 'COMPETITOR_QUERY_EMPTY: query가 비어 있음',
    };
  }

  const topN = Math.max(1, Math.min(HARD_MAX_TOP_N, input.topN ?? DEFAULT_TOP_N));
  const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    await input.fetcher.goto(buildSearchUrl(input.query), { timeout });
    await input.fetcher.waitForSelector(
      SHOPPING_COMPETITOR_SELECTORS.productCard.primary,
      { timeout },
    );
    // 셀렉터 후보를 브라우저 컨텍스트에 주입
    const selMap = {
      productCard: [
        SHOPPING_COMPETITOR_SELECTORS.productCard.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productCard.fallbacks,
      ],
      productName: [
        SHOPPING_COMPETITOR_SELECTORS.productName.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productName.fallbacks,
      ],
      productPrice: [
        SHOPPING_COMPETITOR_SELECTORS.productPrice.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productPrice.fallbacks,
      ],
      productRating: [
        SHOPPING_COMPETITOR_SELECTORS.productRating.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productRating.fallbacks,
      ],
      productReviewCount: [
        SHOPPING_COMPETITOR_SELECTORS.productReviewCount.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productReviewCount.fallbacks,
      ],
      productSeller: [
        SHOPPING_COMPETITOR_SELECTORS.productSeller.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productSeller.fallbacks,
      ],
      productThumbnail: [
        SHOPPING_COMPETITOR_SELECTORS.productThumbnail.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productThumbnail.fallbacks,
      ],
      productLink: [
        SHOPPING_COMPETITOR_SELECTORS.productLink.primary,
        ...SHOPPING_COMPETITOR_SELECTORS.productLink.fallbacks,
      ],
    };

    await input.fetcher.evaluate((s: unknown) => {
      (window as any).__SHOPPING_COMPETITOR_SEL__ = s;
      return undefined;
    }, selMap);

    const rawArr = (await input.fetcher.evaluate(browserSideExtractor)) as RawCompetitor[];
    const normalized = rawArr.slice(0, topN).map(normalizeRaw);

    const validCount = normalized.filter((p) => p.name && p.priceWon > 0).length;
    const successRate = normalized.length > 0 ? validCount / normalized.length : 0;

    return {
      enabled: true,
      query: input.query,
      products: normalized,
      successRate,
      elapsedMs: Date.now() - start,
    };
  } catch (err) {
    return {
      enabled: true,
      query: input.query,
      products: [],
      successRate: 0,
      elapsedMs: Date.now() - start,
      fallbackReason: `COMPETITOR_FETCH_FAILED: ${(err as Error)?.message ?? '알 수 없는 오류'}`,
    };
  }
}
