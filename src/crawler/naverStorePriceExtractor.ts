/**
 * Naver Store (smartstore / brand.naver.com) price extractor with 5-stage fallback.
 *
 * Why this exists:
 * Naver obfuscates product page CSS class names (e.g. "Xu9MEKUuIo",
 * "e1DMQNBPJ_", "VaZJPclpdJ") and rotates them frequently. Hard-coding a
 * single selector breaks the moment Naver ships a new build, producing the
 * "0원" symptom reported 2026-04-21.
 *
 * Strategy: try the most stable signal first, fall back progressively.
 *
 *   1) JSON-LD (schema.org Product / Offer)            — rarely changes
 *   2) og:price:amount / product:price:amount meta     — stable
 *   3) `[class*="price"] strong` + "원" text            — semi-stable
 *   4) Current obfuscated class (2026-04)              — fragile but live
 *   5) Page-text regex max-value fallback              — last resort
 *
 * The function is SELF-CONTAINED: all helpers are declared inside so it can
 * be passed as-is to page.evaluate() without closure capture. Returns null
 * if every stage yields zero — never returns "0원" masquerading as a price.
 */

export interface ExtractedPriceResult {
  price: string | null;
  originalPrice: string | null;
  stage: 1 | 2 | 3 | 4 | 5 | null;
  stageLabel?: string;
}

/**
 * Self-contained price extractor. Passable directly to Puppeteer/Playwright
 * page.evaluate — uses no closure variables.
 */
export function extractNaverStorePrice(): ExtractedPriceResult {
  const toPositiveInt = (raw: unknown): number | null => {
    if (raw === null || raw === undefined) return null;
    const s = typeof raw === 'number' ? String(raw) : String(raw);
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const formatKrw = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

  // Stage 1: JSON-LD
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const text = script.textContent || '';
      if (!text.trim()) continue;
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { continue; }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        const offers = item && item.offers;
        if (!offers) continue;
        const offerList = Array.isArray(offers) ? offers : [offers];
        for (const offer of offerList) {
          const price = toPositiveInt((offer && (offer.price ?? offer.lowPrice)) ?? null);
          const original = toPositiveInt((offer && offer.highPrice) ?? (item && item.price) ?? null);
          if (price !== null) {
            return {
              price: formatKrw(price),
              originalPrice: original !== null && original !== price ? formatKrw(original) : null,
              stage: 1,
              stageLabel: 'json-ld',
            };
          }
        }
      }
    }
  } catch { /* continue */ }

  // Stage 2: Meta tags
  try {
    const meta = document.querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"]');
    const metaPrice = meta ? meta.getAttribute('content') : null;
    const n = toPositiveInt(metaPrice);
    if (n !== null) {
      return { price: formatKrw(n), originalPrice: null, stage: 2, stageLabel: 'meta-og' };
    }
  } catch { /* continue */ }

  // Stage 3: Generic [class*="price"] with "원" text
  try {
    const priceNodes = document.querySelectorAll('[class*="price"], [class*="Price"]');
    let discountN: number | null = null;
    let originalN: number | null = null;
    for (let i = 0; i < priceNodes.length; i++) {
      const el = priceNodes[i] as HTMLElement;
      const text = (el.textContent || '').replace(/\s+/g, '');
      if (!/원/.test(text)) continue;
      const n = toPositiveInt(text);
      if (n === null) continue;
      const isDel = el.tagName === 'DEL' || el.closest('del') !== null;
      if (isDel && originalN === null) originalN = n;
      else if (!isDel && discountN === null) discountN = n;
      if (discountN !== null && originalN !== null) break;
    }
    const finalPrice = discountN ?? originalN;
    if (finalPrice !== null) {
      return {
        price: formatKrw(finalPrice),
        originalPrice: discountN !== null && originalN !== null && originalN !== discountN
          ? formatKrw(originalN)
          : null,
        stage: 3,
        stageLabel: 'class-price',
      };
    }
  } catch { /* continue */ }

  // Stage 4: Current obfuscated class (2026-04)
  try {
    const legacyEl = document.querySelector('strong.Xu9MEKUuIo span.e1DMQNBPJ_')
      || document.querySelector('del.VaZJPclpdJ span.e1DMQNBPJ_');
    const legacy = legacyEl ? legacyEl.textContent : null;
    const n = toPositiveInt(legacy);
    if (n !== null) {
      return { price: formatKrw(n), originalPrice: null, stage: 4, stageLabel: 'legacy-class' };
    }
  } catch { /* continue */ }

  // Stage 5: Page-text regex (max numeric "원" mention)
  try {
    const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
    const text = bodyText.substring(0, 50000);
    const regex = /(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/g;
    let match: RegExpExecArray | null;
    let max = 0;
    while ((match = regex.exec(text)) !== null) {
      const n = toPositiveInt(match[1]);
      if (n !== null && n > max) max = n;
    }
    if (max > 0) {
      return { price: formatKrw(max), originalPrice: null, stage: 5, stageLabel: 'text-regex' };
    }
  } catch { /* continue */ }

  return { price: null, originalPrice: null, stage: null };
}

/**
 * Node-side test adapter. Tests pass a jsdom document by setting global.document
 * first, then calling the function. Exported for convenience in future tests
 * that may want richer DOM fixtures.
 */
export function extractFromDocument(doc: Document): ExtractedPriceResult {
  const prevDoc = (globalThis as any).document;
  try {
    (globalThis as any).document = doc;
    return extractNaverStorePrice();
  } finally {
    (globalThis as any).document = prevDoc;
  }
}
