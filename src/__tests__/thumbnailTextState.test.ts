// SPEC-NAVER-IMAGE-2026 FINAL IMAGE FIX §3 — the thumbnail copy is drawn exactly once (or not at all).
import { describe, expect, it } from 'vitest';
import {
  publishOverlayDecision,
  textFlagsOf,
  thumbnailTextState,
  withTextInImage,
  withTextNotInImage,
  withTextNotWanted,
} from '../image/director/thumbnailTextState';

const on = { includeThumbnailText: true, shoppingConnect: false };
/** Copies in the final thumbnail: one per step that draws text. */
const copies = (generationDrewText: boolean, image: object) =>
  (generationDrewText ? 1 : 0) + (publishOverlayDecision(image, on).apply ? 1 : 0);

describe('thumbnail text state', () => {
  it('each setter writes both fields, so nothing stale survives', () => {
    const stale = { filePath: 'a.png', textRendered: true, disableTextOverlay: true };
    expect(withTextNotInImage(stale)).toMatchObject({ textRendered: false, disableTextOverlay: false });
    expect(withTextNotWanted({ filePath: 'b.png' })).toMatchObject({ textRendered: false, disableTextOverlay: true });
    expect(withTextInImage({ filePath: 'c.png' })).toMatchObject({ textRendered: true, disableTextOverlay: true });
    expect(textFlagsOf(undefined)).toEqual({ textRendered: false, disableTextOverlay: false });
  });

  it('states', () => {
    expect(thumbnailTextState(withTextInImage({}))).toBe('TEXT_IN_IMAGE');
    expect(thumbnailTextState(withTextNotWanted({}))).toBe('TEXT_NOT_WANTED');
    expect(thumbnailTextState({})).toBe('TEXT_NOT_IN_IMAGE');
    // an older baked card only carried disableTextOverlay — still no second copy
    expect(publishOverlayDecision({ disableTextOverlay: true }, on).apply).toBe(false);
  });
});

describe('copy count (owner scenarios 1–5)', () => {
  it('1. text drawn at generation → exactly one copy', () => {
    expect(copies(true, withTextInImage({ provider: 'openai-image' }))).toBe(1);
  });

  it('2. no text at generation → the publish overlay adds it once', () => {
    expect(copies(false, withTextNotInImage({ provider: 'openai-image' }))).toBe(1);
  });

  it('3. a regeneration with text → exactly one copy, even over an older no-text image', () => {
    const old = withTextNotInImage({ provider: 'openai-image' });
    const regenerated = { ...old, ...textFlagsOf(withTextInImage({})) };
    expect(copies(true, regenerated)).toBe(1);
  });

  it('3b. a regeneration without text never inherits the old "text in image" state', () => {
    const old = withTextInImage({ provider: 'openai-image' });
    const regenerated = { ...old, ...textFlagsOf({}) };
    expect(copies(false, regenerated)).toBe(1);
  });

  it('4. two real photos + copy band → exactly one copy', () => {
    expect(copies(true, withTextInImage({ provider: 'collected-image-with-text' }))).toBe(1);
  });

  it('5. AUTO decided no text → zero copies', () => {
    expect(copies(false, withTextNotWanted({ provider: 'collected-image' }))).toBe(0);
  });

  it('copy setting off → zero; shopping keeps the product photo; original kept', () => {
    const noText = withTextNotInImage({});
    expect(publishOverlayDecision(noText, { includeThumbnailText: false, shoppingConnect: false }).apply).toBe(false);
    expect(publishOverlayDecision(noText, { includeThumbnailText: true, shoppingConnect: true }).apply).toBe(false);
    expect(publishOverlayDecision({ ...noText, preserveOriginal: true }, on).apply).toBe(false);
  });

  it('an image with no text state is never overprinted (it may carry the generation-time overlay)', () => {
    expect(publishOverlayDecision({}, on)).toMatchObject({ apply: false });
    expect(publishOverlayDecision({ provider: 'flow-nano-banana-2' } as any, on).apply).toBe(false);
    expect(publishOverlayDecision(undefined, on).apply).toBe(false);
  });
});
