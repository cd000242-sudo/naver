/**
 * NAVER FULL AUTO — one slot per image the final article needs: the thumbnail plus one per final H2.
 *
 * Slots are keyed by the user-visible 1-based heading number, so a failed H2 3 stays empty and H2 4's
 * image can never slide into it. States: PENDING → SUCCESS | FAILED, or SKIPPED_BY_SETTING when the
 * heading scope (odd / even / none) leaves that heading without an image on purpose.
 *
 * Pure and immutable; inlined into the renderer bundle, so names carry a fullAuto prefix.
 */
import type { FullAutoHeadingScope, FullAutoImagePolicy } from './fullAutoImagePolicy.js';

export type FullAutoImageSlotState = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED_BY_SETTING';
export type FullAutoImageSlotKind = 'thumbnail' | 'section';

export interface FullAutoImageSlot {
  readonly key: string;
  readonly kind: FullAutoImageSlotKind;
  /** 0 for the thumbnail, otherwise the 1-based H2 number the reader sees. */
  readonly number: number;
  readonly heading: string;
  readonly state: FullAutoImageSlotState;
  readonly reason?: string;
  readonly provider?: string;
  readonly assetKind?: string;
  readonly width?: number;
  readonly height?: number;
  readonly textRendered?: boolean;
  /** The image came from another engine/model than the one selected (e.g. a Gemini final fallback). */
  readonly fallbackUsed?: boolean;
  readonly actualProvider?: string;
}

export const FULL_AUTO_THUMBNAIL_SLOT_KEY = 'thumbnail';

export function fullAutoSectionSlotKey(number: number): string {
  return `h2-${number}`;
}

/** Same 1-based rule as image/headingImageSelection.keepSectionImage (parity is tested). */
export function fullAutoScopeKeepsHeading(scope: FullAutoHeadingScope, number: number): boolean {
  if (scope === 'none') return false;
  if (scope === 'odd') return number % 2 === 1;
  if (scope === 'even') return number % 2 === 0;
  return true;
}

export interface FullAutoSlotPlanInput {
  readonly title: string;
  /** FINAL H2 titles in reading order — the plan must be built after the article is fixed. */
  readonly headings: readonly string[];
  readonly policy: Pick<FullAutoImagePolicy, 'imagesEnabled' | 'thumbnail' | 'sections'>;
}

export function buildFullAutoImageSlots(input: FullAutoSlotPlanInput): FullAutoImageSlot[] {
  const { policy } = input;
  if (!policy.imagesEnabled) return [];
  const slots: FullAutoImageSlot[] = [];
  if (policy.thumbnail.enabled) {
    slots.push(Object.freeze({
      key: FULL_AUTO_THUMBNAIL_SLOT_KEY,
      kind: 'thumbnail',
      number: 0,
      heading: String(input.title || '').trim(),
      state: 'PENDING',
    }));
  }
  const headings = input.headings.map((h) => String(h || '').trim()).filter(Boolean);
  headings.forEach((heading, index) => {
    const number = index + 1;
    const kept = fullAutoScopeKeepsHeading(policy.sections.scope, number);
    slots.push(Object.freeze({
      key: fullAutoSectionSlotKey(number),
      kind: 'section',
      number,
      heading,
      state: kept ? 'PENDING' : 'SKIPPED_BY_SETTING',
      ...(kept ? {} : { reason: `소제목 이미지 범위(${policy.sections.scope})` }),
    }));
  });
  return slots;
}

export type FullAutoSlotPatch = Partial<Omit<FullAutoImageSlot, 'key' | 'kind' | 'number' | 'heading'>>;

/** New slot list with one slot changed; unknown keys leave the list as it was. */
export function updateFullAutoImageSlot(
  slots: readonly FullAutoImageSlot[],
  key: string,
  patch: FullAutoSlotPatch,
): FullAutoImageSlot[] {
  return slots.map((slot) => (slot.key === key ? Object.freeze({ ...slot, ...patch }) : slot));
}

/** The slot a generated/requested image belongs to, from its thumbnail flag or its H2 title. */
export function findFullAutoSlotForImage(
  slots: readonly FullAutoImageSlot[],
  image: { readonly isThumbnail?: boolean; readonly heading?: string } | null | undefined,
): FullAutoImageSlot | null {
  if (!image) return null;
  if (image.isThumbnail === true) return slots.find((slot) => slot.kind === 'thumbnail') ?? null;
  const heading = String(image.heading || '').replace(/\s+/gu, ' ').trim();
  if (!heading) return null;
  return slots.find((slot) => slot.kind === 'section' && slot.heading.replace(/\s+/gu, ' ') === heading) ?? null;
}

export interface FullAutoScopedItem<T> {
  readonly item: T;
  /** 0 for the thumbnail, otherwise the 1-based H2 number. */
  readonly number: number;
  readonly kept: boolean;
}

/**
 * Number request items and apply the heading scope. Only an explicit isThumbnail flag makes a
 * thumbnail — a real H2 that merely contains "대표" or "서론" stays a numbered section.
 */
export function fullAutoItemsForScope<T extends { readonly isThumbnail?: boolean }>(
  items: readonly T[],
  scope: FullAutoHeadingScope,
): FullAutoScopedItem<T>[] {
  let number = 0;
  return items.map((item) => {
    if (item?.isThumbnail === true) return { item, number: 0, kept: true };
    number += 1;
    return { item, number, kept: fullAutoScopeKeepsHeading(scope, number) };
  });
}

/**
 * Settle every still-open slot against the images actually returned: a slot with an image is SUCCESS,
 * a PENDING slot without one becomes FAILED. Recorded failure reasons are kept.
 */
export function reconcileFullAutoSlotsWithImages(
  slots: readonly FullAutoImageSlot[],
  images: readonly {
    readonly isThumbnail?: boolean;
    readonly heading?: string;
    readonly provider?: string;
    readonly width?: number;
    readonly height?: number;
    readonly textRendered?: boolean;
    readonly assetKind?: string;
    readonly fallbackUsed?: boolean;
    readonly actualProvider?: string;
  }[],
): FullAutoImageSlot[] {
  const matched = new Map<string, (typeof images)[number]>();
  for (const image of images) {
    const slot = findFullAutoSlotForImage(slots, image);
    if (slot && !matched.has(slot.key)) matched.set(slot.key, image);
  }
  return slots.map((slot) => {
    if (slot.state === 'SKIPPED_BY_SETTING') return slot;
    const image = matched.get(slot.key);
    if (image) {
      return Object.freeze({
        ...slot,
        state: 'SUCCESS' as const,
        reason: undefined,
        ...(image.provider ? { provider: String(image.provider) } : {}),
        ...(image.assetKind ? { assetKind: String(image.assetKind) } : {}),
        ...(Number.isFinite(image.width) ? { width: Number(image.width) } : {}),
        ...(Number.isFinite(image.height) ? { height: Number(image.height) } : {}),
        ...(typeof image.textRendered === 'boolean' ? { textRendered: image.textRendered } : {}),
        ...(image.fallbackUsed === true ? { fallbackUsed: true } : {}),
        ...(image.actualProvider ? { actualProvider: String(image.actualProvider) } : {}),
      });
    }
    if (slot.state === 'PENDING' || slot.state === 'SUCCESS') {
      return Object.freeze({ ...slot, state: 'FAILED' as const, reason: slot.reason || '이미지 결과 없음' });
    }
    return slot;
  });
}

export interface FullAutoSlotSummary {
  /** Images this article needs (skipped slots excluded). */
  readonly planned: number;
  readonly done: number;
  readonly failed: number;
  readonly skipped: number;
  readonly pending: number;
  /** "4/6" — done over planned. */
  readonly label: string;
}

export function summarizeFullAutoImageSlots(slots: readonly FullAutoImageSlot[]): FullAutoSlotSummary {
  const count = (state: FullAutoImageSlotState) => slots.filter((slot) => slot.state === state).length;
  const skipped = count('SKIPPED_BY_SETTING');
  const planned = slots.length - skipped;
  const done = count('SUCCESS');
  return Object.freeze({
    planned,
    done,
    failed: count('FAILED'),
    skipped,
    pending: count('PENDING'),
    label: `${done}/${planned}`,
  });
}

/** Korean label for one slot, e.g. "썸네일" or "소제목 3". */
export function fullAutoSlotLabel(slot: Pick<FullAutoImageSlot, 'kind' | 'number'>): string {
  return slot.kind === 'thumbnail' ? '썸네일' : `소제목 ${slot.number}`;
}

/** Progress label for the automation loop's onStage event, e.g. "🖼️ 소제목 3 이미지 생성 중 (4/6)". */
export function describeFullAutoImageStage(stage: unknown): string {
  const s = (stage || {}) as { kind?: unknown; number?: unknown; index?: unknown; total?: unknown };
  const index = Number(s.index) || 0;
  const total = Number(s.total) || 0;
  const count = index > 0 && total > 0 ? ` (${index}/${total})` : '';
  if (s.kind === 'thumbnail') return `🖼️ 썸네일 생성 중${count}`;
  const number = Number(s.number) || 0;
  return `🖼️ 소제목${number > 0 ? ` ${number}` : ''} 이미지 생성 중${count}`;
}
