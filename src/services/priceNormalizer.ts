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

  const digitsOnly = str.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;

  const num = parseInt(digitsOnly, 10);
  if (!Number.isFinite(num) || num <= 0) return null;

  return num;
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
