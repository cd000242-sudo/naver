/**
 * [2026-09-04 사장님 결정] Issue posts need the people's own words. The 용혜인 청문회 material carried
 * 93 quoted passages and every engine wrote a post with zero direct quotes — the gate had no item
 * for it, so nothing pushed the model to quote. This counts direct quotations on both sides so the
 * homefeed / SEO evaluators can flag "재료에 인용이 있는데 본문에 없음" and the retry directive
 * carries it into the rewrite.
 */
const DIRECT_QUOTE_RE = /["“]([^"”\n]{8,160})["”]/gu;

/** Minimum quoted passages in the material before a quote-less body counts as a miss. */
export const MATERIAL_QUOTE_THRESHOLD = 3;

export function countDirectQuotes(text: string | undefined): number {
  const source = String(text || '');
  if (!source) return 0;
  return (source.match(DIRECT_QUOTE_RE) || []).length;
}

export interface QuoteCoverage {
  readonly materialQuotes: number;
  readonly bodyQuotes: number;
  /** true when the material offers quotes and the body used none. */
  readonly missing: boolean;
}

export function assessQuoteCoverage(materialText: string | undefined, bodyText: string | undefined): QuoteCoverage {
  const materialQuotes = countDirectQuotes(materialText);
  const bodyQuotes = countDirectQuotes(bodyText);
  return {
    materialQuotes,
    bodyQuotes,
    missing: materialQuotes >= MATERIAL_QUOTE_THRESHOLD && bodyQuotes === 0,
  };
}

export const QUOTE_COVERAGE_ISSUE = '재료에 당사자 발언 인용이 있는데 본문에 직접 인용이 없음';
export const QUOTE_COVERAGE_SUGGESTION = '재료에 있는 당사자 발언을 따옴표 그대로 1~2개 넣고 누가 말했는지 붙이기';

/** Up to `max` distinct quoted passages from the material, longest first — handed to the rewrite as concrete candidates. */
export function extractDirectQuotes(materialText: string | undefined, max: number = 5): string[] {
  const source = String(materialText || '');
  const seen = new Set<string>();
  const quotes: string[] = [];
  for (const match of source.matchAll(DIRECT_QUOTE_RE)) {
    const quote = match[1].trim();
    if (quote.length < 12 || seen.has(quote)) continue;
    seen.add(quote);
    quotes.push(quote);
  }
  return quotes.sort((a, b) => b.length - a.length).slice(0, Math.max(0, max));
}
