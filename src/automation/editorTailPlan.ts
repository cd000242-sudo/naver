export type EditorTailCta = {
  readonly text?: string;
  readonly link?: string;
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

export function getHashtagGapEnterCount(previousPostTailInserted: boolean): number {
  return previousPostTailInserted ? 5 : 3;
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
  const bottomCtas = !input.skipCta && !isHeadingPosition ? [...effectiveCtas] : [];

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
