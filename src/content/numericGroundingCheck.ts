/**
 * Checks that every number-with-unit in the article actually appears in the material.
 *
 * [2026-08-27] Three measured articles showed the same defect: fact retention was 100%,
 * and the facts were still combined wrongly.
 *
 *   1편  the source's "16시간 공복" and "파운드" fused into "약 16파운드 안팎의 체지방 감량"
 *   2편  "16파운드"·"16시간" were grounded, and "최소 16개월 동안" slipped in beside them
 *
 * Once the model latches onto a number it reuses it in unrelated contexts. The grounding
 * gate only asked "is it in the material" — never "is that how the material used it".
 *
 * A number is the same fact only with its unit. "16시간" in the source does not license
 * "16개월" in the article.
 *
 * Warning-only. A computed value (16파운드 ≈ 7.2kg) is legitimately absent from the source,
 * so this reports what to check rather than what is wrong.
 */

/** Units worth checking. Narrow on purpose — a bare number is too common to judge. */
export const UNITS = [
  '년', '개월', '달', '주', '일', '시간', '분', '초', '차',
  'kg', 'g', 'mg', 't', '파운드', 'lb',
  'km', 'm', 'cm', 'mm', '평',
  '%', '％', '원', '만원', '억원', '달러',
  '개', '명', '곡', '편', '건', '회', '번', '위', '살', '세', '배', '층', '종',
  '마력', 'kcal', 'ml', 'L',
];

/** Longest first so "만원" wins over "원", "개월" over "개". */
export const UNIT_PATTERN = [...UNITS]
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const MEASUREMENT_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})`, 'g');

/** Below this the material is too thin to judge against. */
const MIN_SOURCE_CHARS = 500;

/** Cap so one bad article cannot flood the log. */
const MAX_REPORTED = 8;

const normalize = (text: string): string => String(text || '').replace(/\s+/g, '');

/** Numbers with units, whitespace collapsed, in order of first appearance. */
export function extractMeasurements(text: string | undefined): string[] {
  try {
    const body = String(text || '');
    if (!body) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const match of body.matchAll(MEASUREMENT_RE)) {
      const value = `${match[1]}${match[2]}`;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Measurements in the article that the material does not contain.
 *
 * Matching is whitespace-insensitive so "16 시간" in the source grounds "16시간" in the
 * article. Comma grouping is normalised too ("1,234명" ↔ "1234명").
 */
export function findUngroundedNumbers(
  article: string | undefined,
  sourceText: string | undefined,
): string[] {
  try {
    const body = String(article || '').trim();
    const source = String(sourceText || '').trim();
    if (!body) return [];
    if (source.length < MIN_SOURCE_CHARS) return [];

    const haystack = normalize(source);
    const haystackNoCommas = haystack.replace(/,/g, '');

    const out: string[] = [];
    for (const measurement of extractMeasurements(body)) {
      const needle = normalize(measurement);
      if (haystack.includes(needle)) continue;
      if (haystackNoCommas.includes(needle.replace(/,/g, ''))) continue;
      out.push(measurement);
      if (out.length >= MAX_REPORTED) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** One warning line, or empty when there is nothing to check. */
export function describeUngroundedNumbers(values: string[]): string {
  if (!Array.isArray(values) || values.length === 0) return '';
  return `자료에 없는 수치 ${values.length}건 — ${values.join(', ')}. `
    + '계산해서 쓴 값일 수도 있으니, 사실로 적었다면 원 자료에서 확인하세요.';
}
