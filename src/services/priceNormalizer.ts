/**
 * Single source of truth for product price normalization.
 *
 * Why this exists:
 * Collectors across the codebase (bestProductCollector, sourceAssembler, crawler/shopping/*)
 * historically produced "0원" / "가격 정보 없음" / "" when price extraction failed,
 * and the prompt layer then injected those strings into LLM prompts, producing
 * posts that literally said "현재 0원에 판매 중".
 *
 * All price inputs MUST pass through parsePrice/formatPrice before being stored
 * or injected into prompts. If the price cannot be normalized to a positive
 * integer KRW value, the result is null and callers MUST treat it as "no price".
 */

const INVALID_TOKENS = [
  '가격 정보 없음',
  '정보 없음',
  '정보없음',
  '문의',
  '상담',
  '별도',
  '무료',
  '미정',
  '품절',
  '일시품절',
  '단종',
  'N/A',
  'null',
  'undefined',
];

const PRICE_NUMBER_TOKEN = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)+|\d+/g;

function parseNumericPriceToken(token: string): number | null {
  const normalized = token.trim();
  if (!normalized) return null;

  // A dotted value with only three-digit groups is treated as a localized
  // thousands separator. Otherwise the dot is a decimal separator, as used
  // by JSON-LD values such as "47158.00".
  const numericValue = /^\d{1,3}(?:\.\d{3})+$/u.test(normalized)
    ? Number(normalized.replace(/\./g, ''))
    : Number(normalized.replace(/,/g, ''));
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Math.floor(numericValue);
}

/**
 * Parse any raw price input into a positive KRW integer.
 * Returns null for zero, negative, missing, or non-numeric values.
 *
 * Accepts: number, string ("15,370원", " 12345 ", "₩12,345"), null, undefined.
 */
export function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
  }

  const str = String(raw).trim();
  if (!str) return null;

  for (const token of INVALID_TOKENS) {
    if (str.includes(token)) return null;
  }

  if (/(?:^|\s)-\s*\d/u.test(str)) return null;

  const numericTokens = str.match(PRICE_NUMBER_TOKEN) ?? [];
  if (numericTokens.length !== 1) return null;

  const tokenIndex = str.indexOf(numericTokens[0]);
  const suffix = str.slice(tokenIndex + numericTokens[0].length).trimStart();
  if (suffix.startsWith('%')) return null;

  return parseNumericPriceToken(numericTokens[0]);
}

/**
 * Format a raw price input into a Korean display string "12,345원".
 * Returns null when the price is invalid — callers MUST omit the price
 * entirely rather than substituting a placeholder.
 */
export function formatPrice(raw: unknown): string | null {
  const num = parsePrice(raw);
  return num === null ? null : `${num.toLocaleString('ko-KR')}원`;
}

/**
 * Recover an explicitly labelled product price from assembled crawler text.
 * This intentionally ignores bare numbers so product ids and model numbers
 * cannot be mistaken for prices.
 */
export function extractLabeledPrice(text: unknown): string | null {
  if (typeof text !== 'string' || !text.trim()) return null;

  const labeledPricePattern = /(?:\uC218\uC9D1\s*\uC2DC\uC810\s*\uD45C\uC2DC\s*\uAC00\uACA9|\uAC00\uACA9)\s*[:：]\s*([₩￦]?\s*\d[\d,]*(?:\.\d+)?(?:\s*\uC6D0)?)/g;
  for (const match of text.matchAll(labeledPricePattern)) {
    const normalized = formatPrice(match[1]);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Predicate form for conditional rendering in prompts.
 */
export function hasValidPrice(raw: unknown): boolean {
  return parsePrice(raw) !== null;
}

/**
 * Legacy-compatible formatter that returns an empty string (not null) when
 * the price is invalid. Use ONLY at legacy call sites that cannot handle
 * null without wider refactoring. Prefer formatPrice() for new code.
 */
export function formatPriceOrEmpty(raw: unknown): string {
  return formatPrice(raw) ?? '';
}
