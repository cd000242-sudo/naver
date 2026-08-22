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

/**
 * [v2.11.206] 이 섹션 아래에 장소 블록을 넣을 차례인지.
 *
 * 장소는 CTA와 달리 글당 하나뿐이라 목록이 아니라 위치 문자열 하나만 본다.
 * 이름이 비어 있으면(앱에서 확정 안 함) 어떤 위치든 삽입하지 않는다.
 */
export function shouldInsertPlaceAtHeading(
  placeName: string | undefined,
  placePosition: string | undefined,
  headingNumber: number,
): boolean {
  if (!String(placeName || '').trim()) return false;
  return String(placePosition || '').trim() === `heading-${headingNumber}`;
}

/**
 * [v2.11.206] 본문 맨 끝(해시태그 앞)에 장소를 넣을 차례인지.
 *
 * 위치를 'bottom'으로 고른 글뿐 아니라, 'heading-5'를 골랐는데 소제목이 3개뿐이라
 * 그 자리가 아예 없었던 글도 여기로 온다. 사용자가 원한 건 "이 글에 지도"이지
 * "5번 아래가 아니면 말고"가 아니다 — 자리를 못 찾았으면 꼬리에 넣고 로그를 남긴다.
 */
export function shouldInsertPlaceAtTail(
  placeName: string | undefined,
  alreadyHandled: boolean,
): boolean {
  if (!String(placeName || '').trim()) return false;
  return !alreadyHandled;
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
