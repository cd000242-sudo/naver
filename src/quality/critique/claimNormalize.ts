// [2026-09-23 Quality Fix 1] Canonical forms for the high-risk claim values so that surface
// variants never count as "unsupported": 15,000원 / 1만5000원 / 15000원 -> "15000원",
// 3천 명 -> "3000명", 10월 16~22일 / 10월 16∼22일 / 10월 16일부터 22일까지 -> ["10월16일", "10월22일"],
// curly and straight quotes -> one quote form. Unit list is reused from numericGroundingCheck.

import { UNIT_PATTERN } from '../../content/numericGroundingCheck';

const NUMBER_WITH_UNIT_RE = new RegExp(
  `(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s*(억|만|천))?\\s*(?:(\\d{1,4})\\s*)?(${UNIT_PATTERN})`,
  'g',
);
const RANGE_DASH = '[~∼～\\-–]';
const MONTH_DAY_RANGE_RE = new RegExp(`(?:(20\\d{2})년\\s*)?(\\d{1,2})월\\s*(\\d{1,2})\\s*(?:일)?\\s*(?:${RANGE_DASH}|부터)\\s*(?:(\\d{1,2})월\\s*)?(\\d{1,2})\\s*일`, 'g');
const MONTH_DAY_RE = /(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g;
const YEAR_MONTH_RE = /(20\d{2})년\s*(\d{1,2})월(?!\s*\d)/g;
const ISO_DATE_RE = /(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/g;
const QUOTE_RE = /[“"「『]([^”"」』]{6,120})[”"」』]/g;

const KOREAN_SCALE: Record<string, number> = { 억: 100_000_000, 만: 10_000, 천: 1_000 };

function canonicalNumber(value: string, scale: string | undefined, tail: string | undefined): string {
  const base = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(base)) return value.replace(/,/g, '');
  let n = scale ? base * KOREAN_SCALE[scale] : base;
  if (scale && tail) n += Number(tail);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const NUMBER_RANGE_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:${RANGE_DASH}|부터)\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})`, 'g');

/** Canonical "<number><unit>" tokens, e.g. "15000원", "54%", "1245명"; ranges "2.3~3.1%" give both ends. */
export function normalizeNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text || '').matchAll(NUMBER_RANGE_RE)) {
    const unit = m[3] === '만원' || m[3] === '억원' ? '원' : m[3];
    const scale = m[3] === '만원' ? '만' : m[3] === '억원' ? '억' : undefined;
    out.add(`${canonicalNumber(m[1], scale, undefined)}${unit}`);
  }
  for (const m of String(text || '').matchAll(NUMBER_WITH_UNIT_RE)) {
    const unit = m[4] === '만원' ? '원' : m[4] === '억원' ? '원' : m[4];
    const scale = m[4] === '만원' ? '만' : m[4] === '억원' ? '억' : m[2];
    out.add(`${canonicalNumber(m[1], scale, m[3])}${unit}`);
  }
  return [...out];
}

/**
 * Canonical "<M>월<D>일" tokens (year dropped — the source rarely repeats it), ranges expanded.
 * `includeIso` is off for the allowed-value corpus: ISO dates there are metadata (게시일: 2026-09-07,
 * [2026-09-07 작성]) and must not license an event date — live 201400 wrote "9월 7일 무료 개방" from
 * a publish date exactly that way (팩트 규율 5).
 */
export function normalizeDates(text: string, includeIso: boolean = true): string[] {
  const out = new Set<string>();
  const src = String(text || '');
  for (const m of src.matchAll(MONTH_DAY_RANGE_RE)) {
    const m1 = Number(m[2]); const m2 = m[4] ? Number(m[4]) : m1;
    out.add(`${m1}월${Number(m[3])}일`); out.add(`${m2}월${Number(m[5])}일`);
  }
  for (const m of src.matchAll(MONTH_DAY_RE)) out.add(`${Number(m[2])}월${Number(m[3])}일`);
  if (includeIso) for (const m of src.matchAll(ISO_DATE_RE)) out.add(`${Number(m[2])}월${Number(m[3])}일`);
  for (const m of src.matchAll(YEAR_MONTH_RE)) out.add(`${m[1]}년${Number(m[2])}월`);
  return [...out];
}

/** Direct quotes (6~120 chars) with quote marks and spaces stripped. */
export function normalizeQuotes(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text || '').matchAll(QUOTE_RE)) out.add(m[1].replace(/\s+/g, '').replace(/[.,!?。]+$/g, ''));
  return [...out];
}

/**
 * Date ranges as endpoint pairs: "10월 12~18일" -> [["10월12일","10월18일"]]. A range with one
 * endpoint in the source is a derived calendar bucket (live 195843 built a 6-row "언제 가나" table
 * out of the four real end-dates), not a fabricated date.
 */
export function dateRangePairs(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of String(text || '').matchAll(MONTH_DAY_RANGE_RE)) {
    const m1 = Number(m[2]); const m2 = m[4] ? Number(m[4]) : m1;
    out.push([`${m1}월${Number(m[3])}일`, `${m2}월${Number(m[5])}일`]);
  }
  return out;
}

/** Endpoints of ranges whose other end the source confirms — derived bucket boundaries. */
export function rangeAnchoredDates(text: string, allowed: ReadonlySet<string>): Set<string> {
  const anchored = new Set<string>();
  for (const [a, b] of dateRangePairs(text)) {
    if (allowed.has(a) || allowed.has(b)) { anchored.add(a); anchored.add(b); }
  }
  return anchored;
}

/** True when `date` ("10월23일") is the day right before/after an allowed date — a derived boundary, not a new fact. */
export function isAdjacentDay(date: string, allowed: ReadonlySet<string>): boolean {
  const m = /^(\d{1,2})월(\d{1,2})일$/.exec(date);
  if (!m) return false;
  const month = Number(m[1]); const day = Number(m[2]);
  return allowed.has(`${month}월${day - 1}일`) || allowed.has(`${month}월${day + 1}일`);
}

/**
 * Drops "12일"-shaped number tokens that are really fragments of a date in the same text
 * ("10월 12~18일" yields the date 10월12일 AND the number 12일 — only the date is a claim).
 */
export function withoutDateFragments(numbers: readonly string[], dates: readonly string[]): string[] {
  const dayDigits = new Set(dates.flatMap((d) => d.match(/\d+/g) || []));
  return numbers.filter((n) => {
    const m = /^(\d+)(일|월|년)$/.exec(n);
    return !(m && dayDigits.has(m[1]));
  });
}

/** Whitespace/quote-mark-insensitive haystack for substring checks. */
export function compactForMatch(text: string): string {
  return String(text || '').replace(/[“”"‘’'「」『』]/g, '').replace(/\s+/g, '');
}

export interface ClaimTokens {
  readonly numbers: string[];
  readonly dates: string[];
  readonly quotes: string[];
}

export function extractClaimTokens(text: string): ClaimTokens {
  return { numbers: normalizeNumbers(text), dates: normalizeDates(text), quotes: normalizeQuotes(text) };
}

/** Allowed-value sets built once from the full evidence corpus. */
export interface AllowedValues {
  readonly numbers: ReadonlySet<string>;
  readonly dates: ReadonlySet<string>;
  readonly quotes: readonly string[];
  readonly compact: string;
}

export function buildAllowedValues(corpus: string): AllowedValues {
  const t = extractClaimTokens(corpus);
  return { numbers: new Set(t.numbers), dates: new Set(normalizeDates(corpus, false)), quotes: t.quotes, compact: compactForMatch(corpus) };
}

/** A quote is supported when 60%+ of its 8-char shingles occur in the corpus (models trim endings). */
export function quoteSupported(quote: string, allowed: AllowedValues): boolean {
  const q = quote.replace(/\s+/g, '');
  if (q.length < 6) return true;
  if (allowed.compact.includes(q)) return true;
  const size = 8;
  if (q.length < size * 2) return allowed.compact.includes(q.slice(0, Math.min(q.length, 6)));
  let hits = 0; let total = 0;
  for (let i = 0; i + size <= q.length; i += 3) { total += 1; if (allowed.compact.includes(q.slice(i, i + size))) hits += 1; }
  return total > 0 && hits / total >= 0.6;
}
