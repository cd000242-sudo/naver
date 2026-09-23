/**
 * SPEC-NAVER-IMAGE-2026 FINAL IMAGE FIX §3 — one text state per thumbnail, so the copy is drawn once.
 *
 *   TEXT_IN_IMAGE      the final copy is already in the pixels (generation-time overlay, a baked card,
 *                      a real-photo composite with copy, or an engine that drew it) → publish skips
 *   TEXT_NOT_WANTED    no copy in the pixels and none wanted (AUTO decided "no text")  → publish skips
 *   TEXT_NOT_IN_IMAGE  no copy in the pixels → the publish-time overlay may add it once
 *
 * `disableTextOverlay` is the flag the publish step already honours; `textRendered` records why.
 * Every setter writes both fields explicitly, so a regenerated image never inherits a stale state.
 * Import-free on purpose (pure data), usable from main and renderer code alike.
 */

export type ThumbnailTextState = 'TEXT_IN_IMAGE' | 'TEXT_NOT_WANTED' | 'TEXT_NOT_IN_IMAGE';

export interface ThumbnailTextFlags {
  textRendered?: boolean;
  disableTextOverlay?: boolean;
}

/** The final copy is in the pixels: the publish overlay must not draw it again. */
export function withTextInImage<T extends object>(image: T): T & { textRendered: true; disableTextOverlay: true } {
  return { ...image, textRendered: true, disableTextOverlay: true };
}

/** No copy in the pixels and none wanted: the publish overlay must not add one either. */
export function withTextNotWanted<T extends object>(image: T): T & { textRendered: false; disableTextOverlay: true } {
  return { ...image, textRendered: false, disableTextOverlay: true };
}

/** No copy in the pixels: the publish overlay may add it. Clears flags left over from an older image. */
export function withTextNotInImage<T extends object>(image: T): T & { textRendered: false; disableTextOverlay: false } {
  return { ...image, textRendered: false, disableTextOverlay: false };
}

export function thumbnailTextState(image: ThumbnailTextFlags | null | undefined): ThumbnailTextState {
  if (image?.textRendered === true) return 'TEXT_IN_IMAGE';
  if (image?.disableTextOverlay === true) return 'TEXT_NOT_WANTED';
  return 'TEXT_NOT_IN_IMAGE';
}

/** Only the two text fields of a fresh result — for rebuilding a slot image without stale flags. */
export function textFlagsOf(image: ThumbnailTextFlags | null | undefined): Required<ThumbnailTextFlags> {
  return { textRendered: image?.textRendered === true, disableTextOverlay: image?.disableTextOverlay === true };
}

export interface PublishOverlayContext {
  /** The post's "put copy on the thumbnail" setting at publish time. */
  readonly includeThumbnailText: boolean;
  /** Shopping-connect thumbnails keep the product photo untouched. */
  readonly shoppingConnect: boolean;
}

/**
 * The single publish-time decision. It refuses by default: the copy is added only when the image says
 * explicitly that it has none (`textRendered === false`, not "no copy wanted"). An image with no state
 * (an older image, a saved post, a flow that dropped the fields) may already carry the generation-time
 * overlay, so it is left alone — a missing copy is visible and fixable, a doubled one ruins the card.
 */
export function publishOverlayDecision(
  image: (ThumbnailTextFlags & { preserveOriginal?: boolean }) | null | undefined,
  context: PublishOverlayContext,
): { apply: boolean; reason: string } {
  if (!context.includeThumbnailText) return { apply: false, reason: '썸네일 문구 설정 꺼짐' };
  if (context.shoppingConnect) return { apply: false, reason: '쇼핑커넥트 원본 유지' };
  if (image?.preserveOriginal === true) return { apply: false, reason: '원본 유지 표시' };
  const state = thumbnailTextState(image);
  if (state === 'TEXT_IN_IMAGE') return { apply: false, reason: '이미 이미지에 문구가 있음' };
  if (state === 'TEXT_NOT_WANTED') return { apply: false, reason: '문구 없음으로 결정됨' };
  if (image?.textRendered !== false) return { apply: false, reason: '문구 상태를 모름 — 겹칠 수 있어 그리지 않음' };
  return { apply: true, reason: '이미지에 문구 없음 → 발행 때 1회' };
}
