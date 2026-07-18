import {
  buildReferenceImageIdentity,
  deduplicateReferenceImages,
  extractReferenceImageUrl,
  selectRepresentativeReferenceImage,
} from './referenceImagePolicy.js';

export const SHOPPING_REFERENCE_IMAGE_ENGINES = [
  'nano-banana-2',
  'nano-banana-pro',
  'openai-image',
  'dropshot',
] as const;

export type ShoppingReferenceImageEngine = typeof SHOPPING_REFERENCE_IMAGE_ENGINES[number];

export const SHOPPING_SELECTABLE_REFERENCE_ENGINES = [
  'nano-banana-2',
  'nano-banana-pro',
  'openai-image',
  'dropshot',
] as const;

export type ShoppingSelectableReferenceEngine = typeof SHOPPING_SELECTABLE_REFERENCE_ENGINES[number];

const SHOPPING_REFERENCE_IMAGE_ENGINE_SET = new Set<string>(SHOPPING_REFERENCE_IMAGE_ENGINES);
const SHOPPING_SELECTABLE_REFERENCE_ENGINE_SET = new Set<string>(SHOPPING_SELECTABLE_REFERENCE_ENGINES);

export interface ShoppingReferenceSourceCandidate {
  source: string;
  allowLocalFile: boolean;
}

const TRUSTED_LOCAL_REFERENCE_FIELDS = [
  'localPath',
  'savedToLocal',
  'filePath',
  'referenceImagePath',
] as const;

const REMOTE_REFERENCE_FIELDS = [
  'referenceImageUrl',
  'originalUrl',
  'url',
  'thumbnailUrl',
  'src',
] as const;

export function getShoppingReferenceSourceCandidates(
  candidate: unknown,
): ShoppingReferenceSourceCandidate[] {
  if (!candidate || typeof candidate !== 'object') {
    const source = extractReferenceImageUrl(candidate);
    return source ? [{ source, allowLocalFile: true }] : [];
  }

  const image = candidate as Record<string, unknown>;
  const sources: ShoppingReferenceSourceCandidate[] = [];
  const sourceIndexes = new Map<string, number>();
  const appendSource = (value: unknown, allowLocalFile: boolean): void => {
    const source = extractReferenceImageUrl(value);
    if (!source) return;

    const existingIndex = sourceIndexes.get(source);
    if (existingIndex !== undefined) {
      if (allowLocalFile && !sources[existingIndex].allowLocalFile) {
        sources[existingIndex] = { source, allowLocalFile: true };
      }
      return;
    }

    sourceIndexes.set(source, sources.length);
    sources.push({ source, allowLocalFile });
  };

  for (const field of TRUSTED_LOCAL_REFERENCE_FIELDS) {
    appendSource(image[field], true);
  }
  for (const field of REMOTE_REFERENCE_FIELDS) {
    appendSource(image[field], false);
  }
  return sources;
}

export function getShoppingReferenceSources(candidate: unknown): string[] {
  return getShoppingReferenceSourceCandidates(candidate).map(candidateSource => candidateSource.source);
}

export function extractShoppingReferenceSource(candidate: unknown): string {
  return getShoppingReferenceSources(candidate)[0] || '';
}

export interface ShoppingRepresentativeReference<T> {
  images: T[];
  representative: T | null;
  referenceUrl: string;
}

export interface ShoppingCollectedImagePlacement<T> extends ShoppingRepresentativeReference<T> {
  subheadingImages: T[];
}

export interface ShoppingReferenceFields {
  referenceImagePath: string;
  referenceImageUrl: string;
  referenceImageList: string[];
}

export interface ShoppingRepresentativeThumbnail extends Record<string, unknown> {
  url: string;
  filePath: string;
  previewDataUrl: string;
  provider: 'collected-image';
  heading: string;
  isThumbnail: true;
  isShoppingRepresentativeThumbnail: true;
  preserveOriginal: true;
  disableTextOverlay: true;
  allowText: false;
}

export interface ShoppingAiPublishImagesResult<T> {
  images: T[];
  removedCollectedCount: number;
  removedDuplicateCount: number;
}

/**
 * Generation uses zero-based body indices. The final publish normalizer
 * reserves slot zero for the representative thumbnail and rebases bodies.
 */
export interface ShoppingBodyHeadingSlot<T> {
  heading: T;
  originalIndex: number;
}

export function selectShoppingBodyHeadingSlotsForMode<T>(
  headings: readonly T[] | null | undefined,
  mode: unknown,
): ShoppingBodyHeadingSlot<T>[] {
  const source = [...(headings || [])].map((heading, originalIndex) => ({
    heading,
    originalIndex,
  }));
  const normalizedMode = String(mode || 'all');
  if (normalizedMode === 'none' || normalizedMode === 'thumbnail-only') return [];
  if (normalizedMode !== 'odd-only' && normalizedMode !== 'even-only') return source;

  return source.filter(slot => {
    const oneBasedBodySlot = slot.originalIndex + 1;
    return normalizedMode === 'odd-only'
      ? oneBasedBodySlot % 2 === 1
      : oneBasedBodySlot % 2 === 0;
  });
}

export function selectShoppingBodyHeadingsForMode<T>(
  headings: readonly T[] | null | undefined,
  mode: unknown,
): T[] {
  return selectShoppingBodyHeadingSlotsForMode(headings, mode).map(slot => slot.heading);
}

export interface ShoppingAiBatchItem {
  heading?: unknown;
  isThumbnail?: boolean;
  originalIndex?: unknown;
}

export interface ShoppingAiBatchPlanOptions<T extends ShoppingAiBatchItem> {
  items: readonly T[] | null | undefined;
  headingImageMode: unknown;
  representative: unknown;
  representativeUrl?: unknown;
  postTitle?: unknown;
}

export interface ShoppingAiBatchPlan<T extends ShoppingAiBatchItem> {
  bodyItems: T[];
  representativeThumbnail: ShoppingRepresentativeThumbnail;
}

/**
 * Builds the same shopping image layout for every publishing flow. The
 * representative original always owns thumbnail slot zero, even when the
 * generated article has no explicit introduction item.
 */
export function createShoppingAiBatchPlan<T extends ShoppingAiBatchItem>(
  options: ShoppingAiBatchPlanOptions<T>,
): ShoppingAiBatchPlan<T> {
  const allItems = [...(options.items || [])];
  const thumbnailItem = allItems.find(item => item?.isThumbnail === true);
  const indexedBodyItems = allItems
    .filter(item => item?.isThumbnail !== true)
    .map((item, originalIndex) => ({ ...item, originalIndex }) as T);
  const bodyItems = selectShoppingBodyHeadingsForMode(
    indexedBodyItems,
    options.headingImageMode,
  );

  return {
    bodyItems,
    representativeThumbnail: createShoppingRepresentativeThumbnail(
      options.representative,
      thumbnailItem?.heading || options.postTitle,
      options.representativeUrl,
    ),
  };
}

export interface ShoppingAiBodySlot {
  heading?: unknown;
  title?: unknown;
  text?: unknown;
  originalHeading?: unknown;
  originalIndex?: unknown;
}

function normalizeShoppingBodySlotHeading(candidate: unknown): string {
  if (typeof candidate === 'string') {
    return candidate.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }
  if (!candidate || typeof candidate !== 'object') return '';
  const slot = candidate as ShoppingAiBodySlot;
  return String(slot.heading || slot.title || slot.text || slot.originalHeading || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function normalizeShoppingBodySlotIndex(candidate: unknown): number | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const value = Number((candidate as ShoppingAiBodySlot).originalIndex);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Prepared shopping images may be reused only when they still belong to the
 * exact current heading slots. Count-only checks can silently reuse an odd
 * batch after the user switches to even placement.
 */
export function doShoppingAiBodySlotsMatch(
  preparedImages: readonly unknown[] | null | undefined,
  expectedSlots: readonly unknown[] | null | undefined,
): boolean {
  const prepared = [...(preparedImages || [])];
  const expected = [...(expectedSlots || [])];
  if (prepared.length !== expected.length) return false;

  return expected.every((expectedSlot, index) => {
    const preparedSlot = prepared[index];
    const preparedHeading = normalizeShoppingBodySlotHeading(preparedSlot);
    const expectedHeading = normalizeShoppingBodySlotHeading(expectedSlot);
    if (!preparedHeading || !expectedHeading || preparedHeading !== expectedHeading) return false;

    const expectedIndex = normalizeShoppingBodySlotIndex(expectedSlot);
    if (expectedIndex === null) return true;
    return normalizeShoppingBodySlotIndex(preparedSlot) === expectedIndex;
  });
}

export interface ReferenceSafeImageRequestPart {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function isShoppingReferenceImageEngine(engine: unknown): boolean {
  return SHOPPING_REFERENCE_IMAGE_ENGINE_SET.has(String(engine || '').trim());
}

export function isShoppingSelectableReferenceEngine(
  engine: unknown,
): engine is ShoppingSelectableReferenceEngine {
  return SHOPPING_SELECTABLE_REFERENCE_ENGINE_SET.has(String(engine || '').trim());
}

export function isShoppingReferenceGenerationSelectionSupported(
  provider: unknown,
  model?: unknown,
): boolean {
  const rawProvider = String(provider || '').trim();
  const normalizedProvider = rawProvider === 'gpt-image-2' ? 'openai-image' : rawProvider;
  const normalizedModel = rawProvider === 'gpt-image-2'
    ? 'gpt-image-2'
    : String(model || '').trim();

  if (!isShoppingReferenceImageEngine(normalizedProvider)) return false;
  if (normalizedProvider === 'openai-image') return normalizedModel === 'gpt-image-2';
  return true;
}

export function assertShoppingReferenceGenerationSelectionSupported(
  provider: unknown,
  model?: unknown,
): void {
  if (isShoppingReferenceGenerationSelectionSupported(provider, model)) return;

  const normalizedProvider = String(provider || '').trim() || 'unknown';
  const normalizedModel = String(model || '').trim();
  if (normalizedProvider === 'openai-image' || normalizedProvider === 'gpt-image-2') {
    throw new Error(
      `SHOPPING_REFERENCE_MODEL_UNSUPPORTED: 쇼핑커넥트 대표이미지 기반 AI 생성은 덕테이프 gpt-image-2만 지원합니다. `
      + `현재 OpenAI 이미지 모델: ${normalizedModel || '선택되지 않음'}. gpt-image-2를 선택해주세요.`,
    );
  }

  throw new Error(
    `SHOPPING_REFERENCE_PROVIDER_UNSUPPORTED: "${normalizedProvider}"는 쇼핑 대표이미지 기반 AI 생성을 지원하지 않습니다. `
    + '나노바나나2, 나노바나나 프로, 덕테이프(gpt-image-2), 리더스 나노바나나프로 무제한 중 하나를 선택해주세요.',
  );
}

export function canUseReferenceFreeImageFallback(isShoppingConnect: unknown): boolean {
  return isShoppingConnect !== true;
}

export interface ShoppingAiReferenceAvailability {
  isShoppingConnect: boolean;
  useAiImage: boolean;
  subImageMode: unknown;
  referenceCount: number;
}

export interface ShoppingImageGenerationPolicy {
  isShoppingConnectCollected: boolean;
  shouldGenerateAi: boolean;
  shouldUseShoppingReferenceAi: boolean;
}

export function assertShoppingAiReferenceAvailable(
  input: ShoppingAiReferenceAvailability,
): void {
  const requiresReference = input.isShoppingConnect === true
    && input.useAiImage === true
    && String(input.subImageMode || '').trim() !== 'collected';
  if (requiresReference && (!Number.isFinite(input.referenceCount) || input.referenceCount <= 0)) {
    throw new Error(
      'SHOPPING_REFERENCE_IMAGE_REQUIRED: Shopping AI image generation requires a collected representative product image.',
    );
  }
}

export function resolveShoppingImageGenerationPolicy(
  input: ShoppingAiReferenceAvailability,
): ShoppingImageGenerationPolicy {
  assertShoppingAiReferenceAvailable(input);
  const isShoppingConnectCollected = input.isShoppingConnect === true
    && String(input.subImageMode || '').trim() === 'collected';
  const shouldGenerateAi = input.useAiImage === true && !isShoppingConnectCollected;
  return {
    isShoppingConnectCollected,
    shouldGenerateAi,
    shouldUseShoppingReferenceAi: shouldGenerateAi && input.isShoppingConnect === true,
  };
}

export function buildReferenceSafeFallbackParts<T extends ReferenceSafeImageRequestPart>(
  parts: readonly T[] | null | undefined,
  fallbackText: unknown,
  requireReferenceImage: boolean,
): ReferenceSafeImageRequestPart[] {
  if (!requireReferenceImage) {
    return [{ text: String(fallbackText || '').trim() }];
  }

  const clonedParts = (parts || []).map(part => ({
    ...part,
    ...(part.inlineData ? { inlineData: { ...part.inlineData } } : {}),
  }));
  const hasReferenceImage = clonedParts.some(part => (
    typeof part.inlineData?.data === 'string' && part.inlineData.data.length > 0
  ));

  if (!hasReferenceImage) {
    throw new Error(
      'SHOPPING_REFERENCE_FALLBACK_BLOCKED: 대표 상품 이미지가 유지되지 않은 폴백 요청을 차단했습니다.',
    );
  }

  return clonedParts;
}

export function resolveShoppingRepresentativeReference<T>(
  images: readonly T[] | null | undefined,
  preferredReference?: T | null,
): ShoppingRepresentativeReference<T> {
  const preferredReferenceUrl = extractShoppingReferenceSource(preferredReference);
  const prioritizedImages = preferredReferenceUrl
    ? [preferredReference as T, ...(images || [])]
    : [...(images || [])];
  const validImages = prioritizedImages.filter(image => !!extractShoppingReferenceSource(image));
  const uniqueImages = deduplicateReferenceImages(validImages);
  const representative = preferredReferenceUrl
    ? uniqueImages.find(image => (
        extractShoppingReferenceSource(image) === preferredReferenceUrl
        || extractReferenceImageUrl(image) === preferredReferenceUrl
      )) || null
    : selectRepresentativeReferenceImage(uniqueImages);
  const referenceUrl = extractShoppingReferenceSource(representative);
  const orderedImages = representative
    ? [representative, ...uniqueImages.filter(image => image !== representative)]
    : uniqueImages;

  return {
    images: orderedImages,
    representative,
    referenceUrl,
  };
}

export function resolveShoppingCollectedImagePlacement<T>(
  images: readonly T[] | null | undefined,
  preferredReference?: T | null,
): ShoppingCollectedImagePlacement<T> {
  const resolved = resolveShoppingRepresentativeReference(images, preferredReference);
  return {
    ...resolved,
    subheadingImages: resolved.images.slice(1),
  };
}

function isRemoteOrInlineReference(source: string): boolean {
  return /^(?:https?:\/\/|data:image\/)/i.test(source);
}

function normalizeLocalReferencePath(source: string): string {
  if (!/^file:\/\//i.test(source)) return source;
  const withoutScheme = decodeURIComponent(source.replace(/^file:\/\//i, ''));
  return /^\/[a-z]:[\\/]/i.test(withoutScheme) ? withoutScheme.slice(1) : withoutScheme;
}

export async function resolveUsableShoppingReferenceSource(
  candidate: unknown,
  checkFileExists?: (filePath: string) => Promise<boolean>,
): Promise<string> {
  const sources = getShoppingReferenceSources(candidate);
  if (!checkFileExists) return sources[0] || '';

  for (const source of sources) {
    if (isRemoteOrInlineReference(source)) return source;
    try {
      if (await checkFileExists(normalizeLocalReferencePath(source))) return source;
    } catch {
      // A stale or inaccessible local copy should not hide a usable remote original.
    }
  }
  return '';
}

export function createShoppingRepresentativeThumbnail(
  representative: unknown,
  heading: unknown,
  sourceOverride?: unknown,
): ShoppingRepresentativeThumbnail {
  const referenceUrl = extractReferenceImageUrl(sourceOverride)
    || extractShoppingReferenceSource(representative);
  if (!referenceUrl) {
    throw new Error(
      'SHOPPING_REPRESENTATIVE_THUMBNAIL_REQUIRED: 대표 상품 이미지가 없어 원본 썸네일을 만들 수 없습니다.',
    );
  }

  const metadata = representative && typeof representative === 'object'
    ? { ...(representative as Record<string, unknown>) }
    : {};

  return {
    ...metadata,
    url: referenceUrl,
    filePath: referenceUrl,
    previewDataUrl: referenceUrl,
    provider: 'collected-image',
    heading: String(heading || '').trim() || '쇼핑 대표 썸네일',
    isThumbnail: true,
    isShoppingRepresentativeThumbnail: true,
    preserveOriginal: true,
    disableTextOverlay: true,
    allowText: false,
  };
}

export interface ShoppingCollectedPublishImagesOptions<T, H> {
  images: readonly T[] | null | undefined;
  headings: readonly H[] | null | undefined;
  headingImageMode: unknown;
  postTitle: unknown;
  preferredReference?: T | null;
}

export interface ShoppingCollectedBodyImage extends Record<string, unknown> {
  url: string;
  filePath: string;
  previewDataUrl: string;
  provider: 'collected-image';
  heading: string;
  originalIndex: number;
  isThumbnail: false;
  isCollectedImage: true;
  preserveOriginal: true;
  disableTextOverlay: true;
  allowText: false;
}

function readShoppingHeadingLabel(heading: unknown): string {
  if (typeof heading === 'string') return heading.trim();
  if (!heading || typeof heading !== 'object') return '';
  const record = heading as Record<string, unknown>;
  return String(record.title || record.heading || record.text || '').trim();
}

/**
 * Collected mode is a zero-generation path. It preserves the representative
 * as thumbnail slot zero and places only the remaining crawler originals in
 * deterministic order. It never duplicates the representative to fill gaps.
 */
export function createShoppingCollectedPublishImages<T, H>(
  options: ShoppingCollectedPublishImagesOptions<T, H>,
): Array<ShoppingRepresentativeThumbnail | ShoppingCollectedBodyImage> {
  const placement = resolveShoppingCollectedImagePlacement(
    options.images,
    options.preferredReference,
  );
  const thumbnail = createShoppingRepresentativeThumbnail(
    placement.representative,
    options.postTitle,
    placement.referenceUrl,
  );
  const headingSlots = selectShoppingBodyHeadingSlotsForMode(
    options.headings,
    options.headingImageMode,
  );
  const bodyImages = placement.subheadingImages
    .slice(0, headingSlots.length)
    .map((candidate, index): ShoppingCollectedBodyImage => {
      const sourceCandidates = getShoppingReferenceSourceCandidates(candidate);
      // A saved local copy may have been moved or deleted between collection
      // and a later publish. Prefer the retained crawler URL for body slots.
      const source = sourceCandidates.find(item => !item.allowLocalFile)?.source
        || sourceCandidates[0]?.source
        || '';
      const metadata = candidate && typeof candidate === 'object'
        ? { ...(candidate as Record<string, unknown>) }
        : {};
      const headingSlot = headingSlots[index];
      return {
        ...metadata,
        url: source,
        filePath: source,
        previewDataUrl: source,
        provider: 'collected-image',
        heading: readShoppingHeadingLabel(headingSlot?.heading) || `소제목 ${index + 1}`,
        originalIndex: headingSlot?.originalIndex ?? index,
        isThumbnail: false,
        isCollectedImage: true,
        preserveOriginal: true,
        disableTextOverlay: true,
        allowText: false,
      };
    })
    .filter(image => Boolean(image.url));

  return [thumbnail, ...bodyImages];
}

function extractShoppingPublishOutputIdentity(candidate: unknown): string {
  if (typeof candidate === 'string') return buildReferenceImageIdentity(candidate);
  if (!candidate || typeof candidate !== 'object') return '';
  const image = candidate as Record<string, unknown>;
  const stableHash = String(image.sha256 || image.contentHash || image.imageHash || '').trim();
  if (stableHash) return buildReferenceImageIdentity({ contentHash: stableHash });
  for (const field of ['savedToLocal', 'filePath', 'previewDataUrl', 'url', 'src'] as const) {
    const identity = buildReferenceImageIdentity(image[field]);
    if (identity) return identity;
  }
  return '';
}

function isCollectedShoppingOutput(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const image = candidate as Record<string, unknown>;
  const source = String(image.source || '').trim().toLowerCase();
  const provider = String(image.provider || '').trim().toLowerCase();
  return image.isCollectedImage === true
    || source === 'collected'
    || provider === 'collected'
    || provider === 'collected-image';
}

/**
 * Final shopping-AI boundary: the representative original is the only
 * collected image allowed in publish output. Body slots accept unique AI
 * results only; collected gallery images remain reference inputs.
 */
export function resolveShoppingAiPublishImages<T>(
  representativeThumbnail: T | null | undefined,
  generatedImages: readonly T[] | null | undefined,
  collectedImages: readonly unknown[] | null | undefined,
): ShoppingAiPublishImagesResult<T> {
  const collectedIdentities = new Set<string>();
  for (const candidate of collectedImages || []) {
    for (const source of getShoppingReferenceSources(candidate)) {
      const identity = buildReferenceImageIdentity(source);
      if (identity) collectedIdentities.add(identity);
    }
  }

  const images: T[] = representativeThumbnail ? [representativeThumbnail] : [];
  const seenGenerated = new Set<string>();
  let removedCollectedCount = 0;
  let removedDuplicateCount = 0;

  for (const candidate of generatedImages || []) {
    if (candidate === representativeThumbnail) continue;
    const image = candidate as unknown as Record<string, unknown>;
    if (image?.isShoppingRepresentativeThumbnail === true || image?.isThumbnail === true) {
      removedCollectedCount += 1;
      continue;
    }

    const identity = extractShoppingPublishOutputIdentity(candidate);
    if (isCollectedShoppingOutput(candidate) || (identity && collectedIdentities.has(identity))) {
      removedCollectedCount += 1;
      continue;
    }
    if (identity && seenGenerated.has(identity)) {
      removedDuplicateCount += 1;
      continue;
    }
    if (identity) seenGenerated.add(identity);
    images.push(candidate);
  }

  return { images, removedCollectedCount, removedDuplicateCount };
}

export function applyShoppingRepresentativeReference<T extends object>(
  items: readonly T[],
  referenceUrl: string,
): Array<T & ShoppingReferenceFields> {
  const normalizedReferenceUrl = String(referenceUrl || '').trim();
  if (!normalizedReferenceUrl) {
    throw new Error('SHOPPING_REFERENCE_IMAGE_REQUIRED: 대표 상품 이미지가 없어 AI 이미지 생성을 시작할 수 없습니다.');
  }

  return items.map(item => ({
    ...item,
    referenceImagePath: normalizedReferenceUrl,
    referenceImageUrl: normalizedReferenceUrl,
    referenceImageList: [normalizedReferenceUrl],
  }));
}

export function buildShoppingReferencePrompt(
  basePrompt: unknown,
  heading: unknown,
  allowText: boolean = false,
): string {
  const normalizedBasePrompt = String(basePrompt || '').trim();
  const normalizedHeading = String(heading || '').trim() || 'the current article section';

  return [
    normalizedBasePrompt,
    'Use the uploaded reference image as the sole product identity anchor.',
    'Render the exact same product and preserve its shape, proportions, colors, materials, logo, labels, packaging, and distinctive details.',
    `Create a new realistic scene that specifically visualizes this article section: "${normalizedHeading}".`,
    'Adapt only the setting, camera angle, lighting, and natural usage context to the section topic.',
    'Do not replace, redesign, recolor, distort, or invent another product.',
    allowText
      ? 'Do not add unrelated text, watermarks, borders, or unrelated products.'
      : 'Do not copy the complete source-photo composition. Do not add text, captions, watermarks, borders, or unrelated products.',
  ].filter(Boolean).join(' ');
}
