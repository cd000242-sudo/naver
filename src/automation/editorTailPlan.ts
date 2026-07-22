export type EditorTailCta = {
  readonly text?: string;
  readonly link?: string;
  // [v2.11.142] Per-CTA position ('bottom' | 'heading-N'). Absent → the global
  // ctaPosition decides (legacy behaviour preserved).
  readonly position?: string;
};

export type EditorTailPlanInput = {
  readonly previousPostUrl?: string;
  readonly affiliateLink?: string;
  readonly ctas?: readonly EditorTailCta[];
  readonly ctaPosition?: string;
  readonly skipCta?: boolean;
  readonly hashtags?: readonly string[];
  readonly hashtagLimit?: number;
};

export type EditorTailPlan = {
  readonly effectiveCtas: EditorTailCta[];
  readonly bottomCtas: EditorTailCta[];
  readonly skippedDuplicateCtaCount: number;
  readonly isHeadingPosition: boolean;
  readonly previousPost: {
    readonly url: string;
    readonly shouldInsert: boolean;
    readonly skippedBecauseAffiliateDuplicate: boolean;
  };
  readonly hashtagsToApply: string[];
  readonly hashtagGapEnterCountAfterPreviousPost: number;
  readonly hashtagGapEnterCountWithoutPreviousPost: number;
};

export function normalizeComparableUrl(value?: string): string {
  return String(value || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

export function isHeadingCtaPosition(value?: string): boolean {
  return /^heading-\d+$/.test(String(value || ''));
}

/** [v2.11.142] Effective position of one CTA: own position wins, else global, else bottom. */
export function resolveCtaPosition(cta: EditorTailCta | undefined, globalPosition?: string): string {
  const own = String(cta?.position || '').trim();
  if (own) return own;
  const global = String(globalPosition || '').trim();
  return global || 'bottom';
}

/** [v2.11.142] CTAs that belong under heading N (1-based) — per-CTA position with global fallback. */
export function selectSectionCtas(
  ctas: readonly EditorTailCta[] | undefined,
  globalPosition: string | undefined,
  headingNumber: number,
): EditorTailCta[] {
  if (!Array.isArray(ctas) || ctas.length === 0) return [];
  const target = `heading-${headingNumber}`;
  return ctas.filter((cta) => resolveCtaPosition(cta, globalPosition) === target);
}

export function getHashtagGapEnterCount(previousPostTailInserted: boolean): number {
  void previousPostTailInserted;
  return 5;
}

export function getExpectedLinkCardMin(
  previousPostTailInserted: boolean,
  effectiveCtas: readonly EditorTailCta[] = [],
): number {
  const ctaLinkCount = effectiveCtas.filter((cta) => Boolean(cta?.link)).length;
  return (previousPostTailInserted ? 1 : 0) + ctaLinkCount;
}

function selectTailHashtags(hashtags: readonly string[] = [], limit = 5): string[] {
  return hashtags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}

export function planEditorTail(input: EditorTailPlanInput): EditorTailPlan {
  const initialCtas = Array.isArray(input.ctas) ? [...input.ctas] : [];
  const previousPostUrl = String(input.previousPostUrl || '').trim();
  const previousPostComparable = normalizeComparableUrl(previousPostUrl);
  const affiliateComparable = normalizeComparableUrl(input.affiliateLink);
  const skippedBecauseAffiliateDuplicate =
    Boolean(previousPostComparable) && previousPostComparable === affiliateComparable;

  const effectiveCtas = previousPostComparable
    ? initialCtas.filter((cta) => normalizeComparableUrl(cta?.link) !== previousPostComparable)
    : initialCtas;
  const skippedDuplicateCtaCount = initialCtas.length - effectiveCtas.length;
  const isHeadingPosition = isHeadingCtaPosition(input.ctaPosition);
  // [v2.11.142] Per-CTA positions: bottom CTAs are the ones whose EFFECTIVE position
  // (own > global > 'bottom') is not a heading slot. A mixed set now works — some CTAs
  // land under headings (inserted in the section loop) and the rest at the bottom.
  const bottomCtas = !input.skipCta
    ? effectiveCtas.filter((cta) => !isHeadingCtaPosition(resolveCtaPosition(cta, input.ctaPosition)))
    : [];

  return {
    effectiveCtas,
    bottomCtas,
    skippedDuplicateCtaCount,
    isHeadingPosition,
    previousPost: {
      url: previousPostUrl,
      shouldInsert: Boolean(previousPostUrl) && !skippedBecauseAffiliateDuplicate,
      skippedBecauseAffiliateDuplicate,
    },
    hashtagsToApply: selectTailHashtags(input.hashtags || [], input.hashtagLimit ?? 5),
    hashtagGapEnterCountAfterPreviousPost: getHashtagGapEnterCount(true),
    hashtagGapEnterCountWithoutPreviousPost: getHashtagGapEnterCount(false),
  };
}
