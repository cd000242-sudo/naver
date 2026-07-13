import {
  deduplicateReferenceImages,
  extractReferenceImageUrl,
  selectRepresentativeReferenceImage,
} from './referenceImagePolicy.js';

export const SHOPPING_REFERENCE_IMAGE_ENGINES = [
  'nano-banana',
  'nano-banana-2',
  'nano-banana-pro',
  'openai-image',
  'dropshot',
] as const;

export type ShoppingReferenceImageEngine = typeof SHOPPING_REFERENCE_IMAGE_ENGINES[number];

export const SHOPPING_SELECTABLE_REFERENCE_ENGINES = [
  'nano-banana-2',
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
