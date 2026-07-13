export type ReferenceImageCandidate = string | Record<string, unknown>;

const HTTP_URL_RE = /^https?:\/\//i;
const REVIEW_SOURCE_RE = /review|user|ugc|comment|후기|리뷰/i;
const PRODUCT_SOURCE_RE = /gallery|product|main|primary|representative|official|detail|상품|대표|추가이미지/i;
const UI_ASSET_RE = /(?:^|[\/_-])(logo|icon|sprite|badge|avatar|profile|banner)(?:[\/_\-.]|$)/i;

export function extractReferenceImageUrl(candidate: unknown): string {
  if (typeof candidate === 'string') {
    const value = candidate.trim();
    return HTTP_URL_RE.test(value) ? value : '';
  }
  if (!candidate || typeof candidate !== 'object') return '';

  const image = candidate as Record<string, unknown>;
  const values = [
    image.referenceImageUrl,
    image.originalUrl,
    image.url,
    image.filePath,
    image.thumbnailUrl,
    image.savedToLocal,
    image.referenceImagePath,
    image.src,
  ];
  for (const value of values) {
    const url = extractReferenceImageUrl(value);
    if (url) return url;
  }
  return '';
}

function normalizeVariantStem(pathname: string): string {
  const slashIndex = pathname.lastIndexOf('/');
  const directory = slashIndex >= 0 ? pathname.slice(0, slashIndex + 1) : '';
  const filename = slashIndex >= 0 ? pathname.slice(slashIndex + 1) : pathname;
  const dotIndex = filename.lastIndexOf('.');
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex).toLowerCase() : '';
  const normalizedStem = stem.replace(
    /(?:[_-](?:thumb(?:nail)?|small|medium|large|orig(?:inal)?|origin|w\d+|h\d+|\d{2,5}x\d{2,5}))+$/i,
    '',
  );
  return `${directory}${normalizedStem}${extension}`;
}

export function buildReferenceImageIdentity(candidate: unknown): string {
  if (candidate && typeof candidate === 'object') {
    const image = candidate as Record<string, unknown>;
    const stableHash = String(image.sha256 || image.contentHash || image.imageHash || '').trim().toLowerCase();
    if (stableHash) return `hash:${stableHash}`;
    const stableId = String(image.originalImageId || image.assetId || '').trim().toLowerCase();
    if (stableId) return `id:${stableId}`;
  }

  const rawUrl = extractReferenceImageUrl(candidate);
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const normalizedPath = normalizeVariantStem(decodeURIComponent(parsed.pathname)).replace(/\/{2,}/g, '/');
    return `${parsed.hostname.toLowerCase()}${normalizedPath}`.toLowerCase();
  } catch {
    return normalizeVariantStem(rawUrl.split(/[?#]/, 1)[0]).toLowerCase();
  }
}

export function deduplicateReferenceImages<T>(images: readonly T[] | null | undefined): T[] {
  const result: T[] = [];
  const seen = new Set<string>();

  for (const image of images || []) {
    const identity = buildReferenceImageIdentity(image);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(image);
  }
  return result;
}

function representativeScore(candidate: unknown, index: number): number {
  if (!candidate || typeof candidate !== 'object') return index === 0 ? 5 : 0;
  const image = candidate as Record<string, unknown>;
  const source = [image.source, image.type, image.kind, image.role, image.category].filter(Boolean).join(' ');
  const url = extractReferenceImageUrl(candidate);
  let score = Math.max(0, 10 - index);

  if (image.isRepresentative === true || image.isPrimary === true || image.isMain === true || image.primary === true) {
    score += 100;
  }
  if (PRODUCT_SOURCE_RE.test(source)) score += 35;
  if (REVIEW_SOURCE_RE.test(source) || /image\.nmv|checkout\.phinf/i.test(url)) score -= 60;
  if (UI_ASSET_RE.test(url)) score -= 100;
  return score;
}

export function selectRepresentativeReferenceImage<T>(images: readonly T[] | null | undefined): T | null {
  const unique = deduplicateReferenceImages(images);
  if (unique.length === 0) return null;

  return unique.reduce<{ candidate: T; score: number }>((best, candidate, index) => {
    const score = representativeScore(candidate, index);
    return score > best.score ? { candidate, score } : best;
  }, { candidate: unique[0], score: representativeScore(unique[0], 0) }).candidate;
}

