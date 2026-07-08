/**
 * Normalizes only the accidental duplicate year prefix shape.
 *
 * Examples:
 * - "2026년 2026 장학금 신청" -> "2026년 장학금 신청"
 * - "2026 2026년 장학금 신청" -> "2026년 장학금 신청"
 */
export function collapseDuplicateLeadingYearTitle(title: string): string {
  let next = String(title || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!next) return '';

  let previous = '';
  while (previous !== next) {
    previous = next;
    next = next
      .replace(/^((?:19|20)\d{2})(년?)\s+\1(년?)(?=\s|$)/u, (_match, year: string, firstSuffix: string, secondSuffix: string) => {
        const suffix = firstSuffix || secondSuffix ? '년' : '';
        return `${year}${suffix}`;
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  return next;
}
