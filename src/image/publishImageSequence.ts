export interface PublishImageLike {
  heading?: unknown;
  headingIndex?: unknown;
  originalIndex?: unknown;
  filePath?: unknown;
  url?: unknown;
  thumbnailUrl?: unknown;
  savedToLocal?: unknown;
  previewDataUrl?: unknown;
  isThumbnail?: boolean;
  isIntro?: boolean;
  isShoppingRepresentativeThumbnail?: boolean;
}

export interface PublishImageSequenceOptions {
  originalIndexBase?: 0 | 1 | 'auto';
  thumbnailPath?: string | null;
}

interface HeadingSlot {
  title: string;
  index: number;
  key: string;
}

function readHeadingTitle(heading: unknown): string {
  if (typeof heading === 'string') return heading.trim();
  if (!heading || typeof heading !== 'object') return '';
  const value = (heading as { title?: unknown; heading?: unknown }).title
    ?? (heading as { heading?: unknown }).heading;
  return String(value || '').trim();
}

function normalizeHeadingIdentity(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s()[\]{}<>"'`~!@#$%^&*+=|\\/:;,.?-]+/g, '');
}

function isThumbnailImage(image: PublishImageLike): boolean {
  if (
    image?.isThumbnail === true
    || image?.isIntro === true
    || image?.isShoppingRepresentativeThumbnail === true
  ) {
    return true;
  }

  const heading = normalizeHeadingIdentity(image?.heading);
  return heading === 'thumbnail'
    || heading === 'thumbnailbg'
    || heading.includes('썸네일')
    || heading === '대표이미지';
}

function readSlotIndex(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeImageLocation(value: unknown): string {
  let location = String(value || '').trim();
  if (!location) return '';
  try {
    location = decodeURIComponent(location);
  } catch {
    // Keep the raw path when it contains malformed URL escapes.
  }
  return location
    .replace(/^file:\/\/\/?/i, '')
    .replace(/\\/g, '/')
    .replace(/^\/([a-z]:\/)/i, '$1')
    .toLocaleLowerCase();
}

export function resolvePublishImageSourceLocation(image: PublishImageLike): string {
  for (const candidate of [
    image.savedToLocal,
    image.filePath,
    image.url,
    image.thumbnailUrl,
    image.previewDataUrl,
  ]) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

function readImageLocationKeys(image: PublishImageLike): string[] {
  return [
    image.savedToLocal,
    image.filePath,
    image.url,
    image.thumbnailUrl,
    image.previewDataUrl,
  ]
    .map(normalizeImageLocation)
    .filter(Boolean);
}

function buildHeadingSlots(structuredContent: unknown): HeadingSlot[] {
  const headings = Array.isArray((structuredContent as { headings?: unknown[] } | null)?.headings)
    ? (structuredContent as { headings: unknown[] }).headings
    : [];

  return headings.map((heading, index) => {
    const title = readHeadingTitle(heading);
    return { title, index, key: normalizeHeadingIdentity(title) };
  });
}

function resolveOriginalIndexBase(
  images: PublishImageLike[],
  headingCount: number,
  hasThumbnail: boolean,
  requestedBase: PublishImageSequenceOptions['originalIndexBase'],
): 0 | 1 {
  if (requestedBase === 0 || requestedBase === 1) return requestedBase;

  const indices = images
    .map(image => readSlotIndex(image?.originalIndex))
    .filter((value): value is number => value !== null);
  if (indices.length === 0 || indices.includes(0)) return 0;

  let zeroBasedEvidence = 0;
  let oneBasedEvidence = 0;
  for (const image of images) {
    const originalIndex = readSlotIndex(image?.originalIndex);
    const headingIndex = readSlotIndex(image?.headingIndex);
    if (originalIndex === null || headingIndex === null) continue;
    if (originalIndex === headingIndex) zeroBasedEvidence += 1;
    if (originalIndex === headingIndex + 1) oneBasedEvidence += 1;
  }
  if (oneBasedEvidence > zeroBasedEvidence) return 1;
  if (zeroBasedEvidence > oneBasedEvidence) return 0;

  if (headingCount > 0 && indices.some(index => index >= headingCount)) return 1;
  const sortedUnique = [...new Set(indices)].sort((left, right) => left - right);
  const isContiguousFromOne = sortedUnique.every((index, position) => index === position + 1);
  if (hasThumbnail && isContiguousFromOne) return 1;

  // Legacy publisher payloads reserve slot 0 for the thumbnail and therefore
  // remain 1-based even when a partial/sparse body-only subset reaches here.
  // A producer with a known 0-based sparse subset must pass originalIndexBase: 0.
  return 1;
}

/**
 * Produces the single image ordering contract consumed by every publisher:
 * thumbnail slot 0, then body images ordered by their structured heading.
 * Body originalIndex values are offset by one only when a thumbnail exists.
 */
export function normalizePublishImageSequence<T extends PublishImageLike>(
  structuredContent: unknown,
  images: readonly T[] | null | undefined,
  options: PublishImageSequenceOptions = {},
): T[] {
  const explicitThumbnailPath = String(options.thumbnailPath || '').trim();
  const explicitThumbnailKey = normalizeImageLocation(explicitThumbnailPath);
  let matchedExplicitThumbnail = false;
  const source = [...(images || [])].map((image, sourceIndex) => ({
    image: (() => {
      const cloned = { ...image } as T;
      if (explicitThumbnailKey && readImageLocationKeys(cloned).includes(explicitThumbnailKey)) {
        matchedExplicitThumbnail = true;
        return { ...cloned, isThumbnail: true } as T;
      }
      return cloned;
    })(),
    sourceIndex,
  }));
  if (explicitThumbnailKey && !matchedExplicitThumbnail) {
    source.unshift({
      image: {
        filePath: explicitThumbnailPath,
        heading: 'thumbnail',
        isThumbnail: true,
      } as T,
      sourceIndex: -1,
    });
  }
  if (source.length === 0) return [];

  const thumbnailEntries = source.filter(entry => isThumbnailImage(entry.image));
  const bodyEntries = source.filter(entry => !isThumbnailImage(entry.image));
  const thumbnailOffset = thumbnailEntries.length > 0 ? 1 : 0;
  const thumbnails = thumbnailEntries.map(({ image }) => {
    const { headingIndex: _headingIndex, ...rest } = image;
    return {
      ...rest,
      isThumbnail: true,
      originalIndex: 0,
    } as T;
  });

  const slots = buildHeadingSlots(structuredContent);
  if (slots.length === 0) {
    const bodies = bodyEntries.map(({ image }, index) => ({
      ...image,
      headingIndex: index,
      originalIndex: index + thumbnailOffset,
    } as T));
    return [...thumbnails, ...bodies];
  }

  const slotIndexesByKey = new Map<string, number[]>();
  for (const slot of slots) {
    if (!slot.key) continue;
    const indexes = slotIndexesByKey.get(slot.key) || [];
    slotIndexesByKey.set(slot.key, [...indexes, slot.index]);
  }

  const originalIndexBase = resolveOriginalIndexBase(
    bodyEntries.map(entry => entry.image),
    slots.length,
    thumbnailEntries.length > 0,
    options.originalIndexBase,
  );
  const buckets = slots.map(() => [] as Array<{ image: T; sourceIndex: number }>);
  const unassigned: Array<{ image: T; sourceIndex: number }> = [];
  const duplicateTitleCursor = new Map<string, number>();

  for (const entry of bodyEntries) {
    const headingKey = normalizeHeadingIdentity(entry.image?.heading);
    const titleCandidates = headingKey ? (slotIndexesByKey.get(headingKey) || []) : [];
    const headingIndex = readSlotIndex(entry.image?.headingIndex);
    const originalIndex = readSlotIndex(entry.image?.originalIndex);
    const convertedOriginalIndex = originalIndex === null ? null : originalIndex - originalIndexBase;
    let targetIndex: number | null = null;

    if (titleCandidates.length === 1) {
      [targetIndex] = titleCandidates;
    } else if (titleCandidates.length > 1) {
      if (headingIndex !== null && titleCandidates.includes(headingIndex)) {
        targetIndex = headingIndex;
      } else if (convertedOriginalIndex !== null && titleCandidates.includes(convertedOriginalIndex)) {
        targetIndex = convertedOriginalIndex;
      } else {
        const cursor = duplicateTitleCursor.get(headingKey) || 0;
        targetIndex = titleCandidates[Math.min(cursor, titleCandidates.length - 1)];
        duplicateTitleCursor.set(headingKey, cursor + 1);
      }
    } else if (headingIndex !== null && headingIndex < slots.length) {
      targetIndex = headingIndex;
    } else if (
      convertedOriginalIndex !== null
      && convertedOriginalIndex >= 0
      && convertedOriginalIndex < slots.length
    ) {
      targetIndex = convertedOriginalIndex;
    }

    if (targetIndex === null) {
      unassigned.push(entry);
    } else {
      buckets[targetIndex] = [...buckets[targetIndex], entry];
    }
  }

  const occupiedSlots = new Set(
    buckets.flatMap((bucket, index) => bucket.length > 0 ? [index] : []),
  );
  let fallbackCursor = 0;
  for (const entry of unassigned) {
    while (fallbackCursor < slots.length && occupiedSlots.has(fallbackCursor)) {
      fallbackCursor += 1;
    }
    const targetIndex = fallbackCursor < slots.length ? fallbackCursor : slots.length - 1;
    buckets[targetIndex] = [...buckets[targetIndex], entry];
    occupiedSlots.add(targetIndex);
    fallbackCursor += 1;
  }

  const bodies = buckets.flatMap((bucket, headingIndex) => bucket
    .sort((left, right) => left.sourceIndex - right.sourceIndex)
    .map(({ image }) => ({
      ...image,
      heading: slots[headingIndex].title || image.heading,
      headingIndex,
      originalIndex: headingIndex + thumbnailOffset,
    } as T)));

  return [...thumbnails, ...bodies];
}
