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
 *   5) Label-aware page-text fallback                  — last resort
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
    if (typeof raw === 'number') {
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    }

    const text = String(raw).trim();
    if (!text) return null;
    const tokens = text.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)+|\d+/g) || [];
    if (tokens.length !== 1) return null;
    const token = tokens[0];
    const value = /^\d{1,3}(?:\.\d{3})+$/.test(token)
      ? Number(token.replace(/\./g, ''))
      : Number(token.replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
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
    const discountValues: number[] = [];
    const originalValues: number[] = [];
    for (let i = 0; i < priceNodes.length; i++) {
      const el = priceNodes[i] as HTMLElement;
      const text = (el.textContent || '').replace(/\s+/g, '');
      if (!/원/.test(text)) continue;
      if (/(?:배송비|적립|할부|혜택|쿠폰할인|무료배송)/.test(text)) continue;
      const priceMentions = text.match(/(?:₩|￦)?(?:\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?원/g) || [];
      if (priceMentions.length !== 1) continue;
      const n = toPositiveInt(priceMentions[0]);
      if (n === null) continue;
      const isDel = el.tagName === 'DEL' || el.closest('del') !== null || /(?:정가|원가|정상가)/.test(text);
      if (isDel) originalValues.push(n);
      else discountValues.push(n);
    }
    const discountCandidates = Array.from(new Set(discountValues));
    const originalCandidates = Array.from(new Set(originalValues));
    const ambiguous = discountCandidates.length > 1 || originalCandidates.length > 1;
    const discountN = discountCandidates.length === 1 ? discountCandidates[0] : null;
    const originalN = originalCandidates.length === 1 ? originalCandidates[0] : null;
    const finalPrice = ambiguous ? null : discountN ?? originalN;
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

  // Stage 5: Page-text fallback. Only trust an explicit product-price label,
  // or a single unambiguous amount after excluding shipping/benefit figures.
  try {
    const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
    const text = bodyText.substring(0, 50000);
    const amountSource = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{4,}(?:\\.\\d+)?)';
    const uniquePrices = (values: number[]): number[] => Array.from(new Set(values));
    const labelledPrices = (labels: string): number[] => {
      const regex = new RegExp(`(?:${labels})\\s*[:：]?\\s*(?:₩|￦)?\\s*${amountSource}\\s*원?`, 'giu');
      const values: number[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const precedingLabel = text.slice(Math.max(0, match.index - 10), match.index);
        if (/(?:배송|적립|할부|혜택|무료배송)\s*$/u.test(precedingLabel)) continue;
        const value = toPositiveInt(match[1]);
        if (value !== null) values.push(value);
      }
      return uniquePrices(values);
    };

    const salePrices = labelledPrices('할인가|판매가|최종가|쿠폰가|결제가|현재가|상품가|제품가|판매\\s*가격|가격');
    if (salePrices.length === 1) {
      return { price: formatKrw(salePrices[0]), originalPrice: null, stage: 5, stageLabel: 'text-labelled-sale' };
    }
    if (salePrices.length > 1) return { price: null, originalPrice: null, stage: null };

    const originalPrices = labelledPrices('정가|원가|정상가');
    if (originalPrices.length === 1) {
      return { price: formatKrw(originalPrices[0]), originalPrice: null, stage: 5, stageLabel: 'text-labelled-original' };
    }
    if (originalPrices.length > 1) return { price: null, originalPrice: null, stage: null };

    const amountRegex = new RegExp(`${amountSource}\\s*원`, 'giu');
    const candidates: number[] = [];
    let amountMatch: RegExpExecArray | null;
    while ((amountMatch = amountRegex.exec(text)) !== null) {
      const contextStart = Math.max(0, amountMatch.index - 20);
      const contextEnd = Math.min(text.length, amountRegex.lastIndex + 12);
      const context = text.slice(contextStart, contextEnd);
      if (/(?:배송(?:비|\s*가격)?|적립|무료배송|할부|혜택|쿠폰할인|이상\s*구매|추천\s*상품|함께\s*본\s*상품)/u.test(context)) continue;
      const value = toPositiveInt(amountMatch[1]);
      if (value !== null) candidates.push(value);
    }
    const unambiguous = uniquePrices(candidates);
    if (unambiguous.length === 1) {
      return { price: formatKrw(unambiguous[0]), originalPrice: null, stage: 5, stageLabel: 'text-single-price' };
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
