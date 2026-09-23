/**
 * NAVER FULL AUTO — what one unattended run asks the image core for.
 *
 * Built from the FINAL article (after the writing pipeline's own edits) so the thumbnail and H2 images
 * match the title and headings that will be published. Every unattended flow (one-click full auto,
 * the reservation queue, multi-account) uses these builders, so they cannot drift apart again.
 *
 * Pure; inlined into the renderer bundle, so names carry a fullAuto prefix.
 */
import { fullAutoDirectorTextMode, type FullAutoImagePolicy } from './fullAutoImagePolicy.js';

export interface FullAutoArticleLike {
  readonly selectedTitle?: unknown;
  readonly title?: unknown;
  readonly introduction?: unknown;
  readonly headings?: readonly unknown[];
}

export function fullAutoHeadingTitle(heading: unknown): string {
  if (typeof heading === 'string') return heading.trim();
  const h = (heading || {}) as { title?: unknown; heading?: unknown; text?: unknown };
  return String(h.title ?? h.heading ?? h.text ?? '').trim();
}

/** FINAL H2 titles in reading order (empty titles dropped). */
export function fullAutoFinalHeadingTitles(article: FullAutoArticleLike | null | undefined): string[] {
  const headings = Array.isArray(article?.headings) ? article!.headings! : [];
  return headings.map(fullAutoHeadingTitle).filter(Boolean);
}

export function fullAutoArticleTitle(article: FullAutoArticleLike | null | undefined, fallback = ''): string {
  return String(article?.selectedTitle || article?.title || fallback || '').trim();
}

/**
 * The heading list the automation image loop receives: the thumbnail pseudo-heading first — always,
 * not only when an introduction exists (without it the first H2 image doubled as the cover) — then
 * the article's H2 objects unchanged.
 */
export function buildFullAutoImageHeadingList(
  article: FullAutoArticleLike | null | undefined,
  policy: Pick<FullAutoImagePolicy, 'thumbnail'>,
  fallbackTitle = '',
): unknown[] {
  const headings = Array.isArray(article?.headings) ? [...article!.headings!] : [];
  if (!policy.thumbnail.enabled) return headings;
  const introduction = String(article?.introduction || '').trim();
  const thumbnail = {
    title: fullAutoArticleTitle(article, fallbackTitle) || '🖼️ 썸네일',
    content: introduction,
    isThumbnail: true,
    isIntro: introduction.length > 0,
  };
  return [thumbnail, ...headings];
}

export interface FullAutoRealImageCandidate {
  readonly filePath: string;
  readonly provider?: string;
  readonly source?: string;
  readonly isCollected?: boolean;
  readonly heading?: string;
}

export interface FullAutoDirectorRequest {
  readonly cardPromise?: string;
  readonly textMode: 'auto' | 'include' | 'exclude';
  /** The app may bake its own short-phrase card (only when the engine does not draw Korean itself). */
  readonly allowBakedText: boolean;
  readonly realImages: readonly FullAutoRealImageCandidate[];
}

/**
 * Thumbnail director request for an unattended run. Real photos are only candidates here — the
 * director's resolver still decides which may be composed (user or consented source photos only).
 */
export function buildFullAutoDirectorRequest(
  policy: Pick<FullAutoImagePolicy, 'thumbnail' | 'realAssetFirst' | 'realPair'>,
  context: { readonly cardPromise?: unknown; readonly realImages?: readonly FullAutoRealImageCandidate[] } = {},
): FullAutoDirectorRequest {
  const candidates = policy.realAssetFirst ? (context.realImages || []).filter((img) => String(img?.filePath || '').trim()) : [];
  const cardPromise = String(context.cardPromise ?? '').trim().slice(0, 200);
  return Object.freeze({
    ...(cardPromise ? { cardPromise } : {}),
    textMode: fullAutoDirectorTextMode(policy),
    allowBakedText: true,
    realImages: Object.freeze(candidates.slice(0, policy.realPair ? 2 : 1)),
  });
}

export interface FullAutoImageCallOptions {
  readonly thumbnailImageRatio: string;
  readonly subheadingImageRatio: string;
  readonly imageRatio: string;
  /** main normalizes every generated image of the call to this square size (homefeed only). */
  readonly targetSquareSize?: number;
  /** The heading scope was applied by the caller; the renderer guard must not re-read the global mode. */
  readonly headingScopeFromPolicy: true;
}

export function buildFullAutoImageCallOptions(
  policy: Pick<FullAutoImagePolicy, 'thumbnail' | 'sections' | 'squareSize'>,
): FullAutoImageCallOptions {
  return Object.freeze({
    thumbnailImageRatio: policy.thumbnail.ratio,
    subheadingImageRatio: policy.sections.ratio,
    imageRatio: policy.sections.ratio,
    ...(policy.squareSize ? { targetSquareSize: policy.squareSize } : {}),
    headingScopeFromPolicy: true,
  });
}
