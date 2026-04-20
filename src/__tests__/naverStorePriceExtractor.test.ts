/**
 * Unit tests for the 5-stage Naver store price extractor.
 *
 * We don't boot jsdom — the function only calls document.querySelector* and
 * document.body.innerText, which we mock via a minimal stub. This keeps the
 * test lean and surfaces any API-shape assumption the extractor makes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractNaverStorePrice } from '../crawler/naverStorePriceExtractor';

// Minimal DOM stub --------------------------------------------------------

interface StubElement {
  tagName?: string;
  textContent: string | null;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => StubElement | null;
}

interface StubSelectorMap {
  [selector: string]: StubElement[];
}

function installDocumentStub(opts: {
  selectors?: StubSelectorMap;
  bodyText?: string;
}): void {
  const selectors = opts.selectors ?? {};
  const bodyText = opts.bodyText ?? '';

  const matchList = (sel: string): StubElement[] => {
    // Match exact selector first
    if (selectors[sel]) return selectors[sel];
    // Match comma-separated selectors (simulate document.querySelectorAll)
    const parts = sel.split(',').map((s) => s.trim());
    for (const p of parts) {
      if (selectors[p]) return selectors[p];
    }
    return [];
  };

  (globalThis as any).document = {
    querySelector: (sel: string): StubElement | null => {
      const list = matchList(sel);
      return list.length > 0 ? list[0] : null;
    },
    querySelectorAll: (sel: string): StubElement[] => {
      return matchList(sel);
    },
    body: {
      innerText: bodyText,
      textContent: bodyText,
    },
  };
}

beforeEach(() => {
  (globalThis as any).document = undefined;
});

afterEach(() => {
  delete (globalThis as any).document;
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage 1: JSON-LD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractNaverStorePrice — stage 1 JSON-LD', () => {
  it('picks up price from a Product schema JSON-LD', () => {
    installDocumentStub({
      selectors: {
        'script[type="application/ld+json"]': [
          {
            textContent: JSON.stringify({
              '@type': 'Product',
              offers: { '@type': 'Offer', price: 1178610 },
            }),
          },
        ],
      },
    });
    const result = extractNaverStorePrice();
    expect(result.stage).toBe(1);
    expect(result.price).toBe('1,178,610원');
  });

  it('captures both price and highPrice (원가/할인가)', () => {
    installDocumentStub({
      selectors: {
        'script[type="application/ld+json"]': [
          {
            textContent: JSON.stringify({
              offers: { price: 1178610, highPrice: 1382000 },
            }),
          },
        ],
      },
    });
    const result = extractNaverStorePrice();
    expect(result.price).toBe('1,178,610원');
    expect(result.originalPrice).toBe('1,382,000원');
  });

  it('returns null stage when JSON-LD contains only price=0', () => {
    installDocumentStub({
      selectors: {
        'script[type="application/ld+json"]': [
          { textContent: JSON.stringify({ offers: { price: 0 } }) },
        ],
      },
    });
    const result = extractNaverStorePrice();
    // Stage 1 rejects 0, should fall through. With no other stubs, stage=null.
    expect(result.stage).toBeNull();
    expect(result.price).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage 2: Meta tags
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractNaverStorePrice — stage 2 meta', () => {
  it('reads og:price:amount when no JSON-LD', () => {
    installDocumentStub({
      selectors: {
        'meta[property="og:price:amount"]': [
          { textContent: '', getAttribute: () => '1178610' },
        ],
      },
    });
    const result = extractNaverStorePrice();
    expect(result.stage).toBe(2);
    expect(result.price).toBe('1,178,610원');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage 5: Page-text regex (last resort)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractNaverStorePrice — stage 5 text regex', () => {
  it('picks the MAX "N,NNN원" mention from body text', () => {
    installDocumentStub({
      bodyText:
        '배송비 3,000원 무료배송 기준 50,000원 제품가 1,178,610원 쿠폰할인 200,000원',
    });
    const result = extractNaverStorePrice();
    expect(result.stage).toBe(5);
    expect(result.price).toBe('1,178,610원');
  });

  it('returns null when body has no price mentions', () => {
    installDocumentStub({ bodyText: '가격 정보 없음' });
    const result = extractNaverStorePrice();
    expect(result.stage).toBeNull();
  });

  it('ignores "0원" in text (no positive values to pick)', () => {
    installDocumentStub({ bodyText: '현재 0원으로 표시됩니다' });
    const result = extractNaverStorePrice();
    expect(result.stage).toBeNull();
    expect(result.price).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "never returns 0원" contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractNaverStorePrice — zero-guard contract', () => {
  it('returns null instead of "0원" when every stage fails', () => {
    installDocumentStub({ bodyText: '' });
    const result = extractNaverStorePrice();
    expect(result.price).toBeNull();
  });

  it('never produces a formatted "0원" string', () => {
    // Simulate a pathological page where everything yields 0
    installDocumentStub({
      selectors: {
        'script[type="application/ld+json"]': [
          { textContent: JSON.stringify({ offers: { price: 0, highPrice: 0 } }) },
        ],
        'meta[property="og:price:amount"]': [
          { textContent: '', getAttribute: () => '0' },
        ],
      },
      bodyText: '0원 0원 0원',
    });
    const result = extractNaverStorePrice();
    expect(result.price).not.toBe('0원');
    expect(result.price).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reproduction of the user's 2026-04-21 bug
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('extractNaverStorePrice — reproduces 2026-04-21 TV case', () => {
  it('extracts 1,178,610원 from a smartstore-like page via JSON-LD', () => {
    installDocumentStub({
      selectors: {
        'script[type="application/ld+json"]': [
          {
            textContent: JSON.stringify({
              '@type': 'Product',
              name: '중복쿠폰 LG전자 QNED TV 4K 사운드바 포함 65QNED75AEA',
              offers: {
                '@type': 'Offer',
                price: 1178610,
                highPrice: 1382000,
                priceCurrency: 'KRW',
              },
            }),
          },
        ],
      },
    });
    const result = extractNaverStorePrice();
    expect(result.price).toBe('1,178,610원');
    expect(result.originalPrice).toBe('1,382,000원');
    expect(result.stage).toBe(1);
  });

  it('extracts from body text when JSON-LD is missing', () => {
    installDocumentStub({
      bodyText:
        '중복쿠폰 LG전자 QNED TV. 정가 1,382,000원. 할인가 1,178,610원. 배송비 무료.',
    });
    const result = extractNaverStorePrice();
    expect(result.price).toBe('1,382,000원'); // stage 5 picks MAX
    expect(result.stage).toBe(5);
  });
});
