/**
 * SPEC-NAVER-IMAGE-2026 FINAL IMAGE FIX §1 — which section images a heading-image mode keeps.
 *
 * One rule for every flow. The heading number the user sees is 1-based (1 = odd, 2 = even, 3 = odd …)
 * and the thumbnail is never a section image, so no section filter removes it.
 *
 *   all             every section
 *   odd-only        1, 3, 5 …
 *   even-only       2, 4, 6 …
 *   thumbnail-only  no sections
 *   none            no sections ("이미지 없음" — the renderer already skips images entirely for it)
 *
 * The heading number comes from, in order: the caller's `sectionIndex` (0-based index into the article
 * headings), the item's heading found in the article's heading list, or — for a batch with neither — the
 * item's position among the batch's section items. A one-item call with no such context is kept: the old
 * rule counted it as position 0 and dropped it in odd mode, which is how every image could disappear.
 *
 * Before (main.ts): `originalIndex % 2 === 1` on the position inside the request, so a batch of all
 * headings kept 2, 4 for "odd" and 1, 3, 5 for "even", and 'none' also removed the thumbnail.
 * Import-free on purpose.
 */

export type HeadingImageMode = 'all' | 'odd-only' | 'even-only' | 'thumbnail-only' | 'none';

export function normalizeHeadingImageMode(raw: unknown): HeadingImageMode {
  const value = String(raw ?? '').trim();
  return value === 'odd-only' || value === 'even-only' || value === 'thumbnail-only' || value === 'none'
    ? value
    : 'all';
}

/** Keep the section image of 1-based heading `headingNumber` (null = unknown) in this mode? */
export function keepSectionImage(mode: HeadingImageMode, headingNumber: number | null): boolean {
  if (mode === 'none' || mode === 'thumbnail-only') return false;
  if (mode === 'all' || headingNumber === null) return true;
  return mode === 'odd-only' ? headingNumber % 2 === 1 : headingNumber % 2 === 0;
}

export interface SelectableImageItem {
  heading?: string;
  isThumbnail?: boolean;
  /** 0-based index of this heading in the article's heading list. */
  sectionIndex?: number;
}

/** The legacy "always keep" rule for thumbnail/intro stand-ins that are not flagged isThumbnail. */
const THUMBNAIL_LIKE_HEADING = /썸네일|thumbnail|서론|대표/iu;

/** Heading text compared without markdown hashes, a leading "1." number, or spacing differences. */
export function normalizeSectionTitle(heading: unknown): string {
  return String(heading ?? '')
    .replace(/^\s{0,3}#{1,6}\s+/u, '')
    .replace(/^\s*\d{1,2}\s*[.)]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface HeadingImageSelection<T> {
  readonly kept: T[];
  readonly dropped: Array<{ readonly heading: string; readonly headingNumber: number | null }>;
  /** The 1-based heading number used for each input item (null for thumbnails and unknown items). */
  readonly numbers: Array<number | null>;
}

export function selectItemsForHeadingImageMode<T extends SelectableImageItem>(
  items: readonly T[],
  rawMode: unknown,
  context: { readonly sectionPlanHeadings?: readonly unknown[] } = {},
): HeadingImageSelection<T> {
  const mode = normalizeHeadingImageMode(rawMode);
  const plan = (context.sectionPlanHeadings || []).map(normalizeSectionTitle);
  const fromContext = (item: T): number | null => {
    if (Number.isInteger(item.sectionIndex) && (item.sectionIndex as number) >= 0) return (item.sectionIndex as number) + 1;
    const title = normalizeSectionTitle(item.heading);
    const index = title ? plan.indexOf(title) : -1;
    return index >= 0 ? index + 1 : null;
  };

  // Thumbnails first (flag, or the legacy heading rule when the heading is not an article heading).
  const contextNumbers = items.map((item) => (item?.isThumbnail === true ? null : fromContext(item)));
  const isThumb = items.map((item, i) => item?.isThumbnail === true
    || (contextNumbers[i] === null && THUMBNAIL_LIKE_HEADING.test(String(item?.heading || ''))));
  const anyContext = contextNumbers.some((n, i) => n !== null && !isThumb[i]);
  const sections = items.map((_, i) => i).filter((i) => !isThumb[i]);
  // A batch with no context at all: its section items are the headings, in order.
  const positional = !anyContext && sections.length >= 2;

  const numbers = items.map((_, i) => {
    if (isThumb[i]) return null;
    if (contextNumbers[i] !== null) return contextNumbers[i];
    return positional ? sections.indexOf(i) + 1 : null;
  });

  const kept: T[] = [];
  const dropped: Array<{ heading: string; headingNumber: number | null }> = [];
  items.forEach((item, i) => {
    if (isThumb[i] || keepSectionImage(mode, numbers[i])) kept.push(item);
    else dropped.push({ heading: String(item?.heading || ''), headingNumber: numbers[i] });
  });
  return { kept, dropped, numbers };
}
