// SPEC-IMAGE-MODEL-001 Phase 3 — storage normalization for image objects.
// Strips absolute paths from display fields (previewDataUrl, url) to prevent
// cross-PC ENOENT errors. Absolute filePath remains in the dedicated field for
// backward compatibility and will be migrated to blob-id in Phase 6.

export interface NormalizedStorageImage {
  heading: string;
  provider: string;
  filePath: string;
  previewDataUrl: string;
  url: string;
  thumbnail: string;
  savedToLocal: boolean;
  isThumbnail?: boolean;
  // blob fields (SPEC Phase 2) — preserved when present
  blobId?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  byteSize?: number;
  sha256?: string;
  createdAt?: number;
}

/**
 * Returns the value if it is safe for browser <img src> usage — i.e., a base64 data URL
 * or a remote http(s) URL. Anything else (file://, Windows absolute path, POSIX absolute path)
 * is discarded to prevent cross-PC ENOENT errors.
 */
function safeDisplayUrl(s: unknown): string {
  if (typeof s !== 'string' || !s) return '';
  if (s.startsWith('data:image/')) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  // file://, drive letter (C:\...), POSIX absolute (/foo/bar), unknown -> discard
  return '';
}

/**
 * Normalizes a raw image object for localStorage persistence.
 * Display fields (previewDataUrl, url) are restricted to safe URLs only.
 * Blob fields from SPEC Phase 2 are preserved when present.
 */
export function normalizeImageForStorage(img: any): NormalizedStorageImage {
  // Display fields: only safe URLs (data: or http(s):). NEVER absolute paths.
  const previewDataUrl =
    safeDisplayUrl(img?.previewDataUrl) ||
    safeDisplayUrl(img?.url) ||
    '';
  const url =
    safeDisplayUrl(img?.url) ||
    safeDisplayUrl(img?.link) ||
    safeDisplayUrl(img?.previewDataUrl) ||
    '';

  const out: NormalizedStorageImage = {
    heading: String(img?.heading || ''),
    provider: String(img?.provider || img?.source || img?.engine || 'unknown'),
    filePath: typeof img?.filePath === 'string' ? img.filePath : '',
    previewDataUrl,
    url,
    thumbnail: String(img?.thumbnail || ''),
    savedToLocal: !!img?.savedToLocal,
  };

  // Preserve optional flags only when present.
  if (img?.isThumbnail !== undefined) out.isThumbnail = !!img.isThumbnail;

  // Preserve blob fields (SPEC Phase 2) — these are the future-proof identifiers.
  if (typeof img?.blobId === 'string' && img.blobId) {
    out.blobId = img.blobId;
    out.sha256 = img.sha256;
    out.byteSize = img.byteSize;
    out.mimeType = img.mimeType;
    out.width = img.width;
    out.height = img.height;
    out.createdAt = img.createdAt;
  }

  return out;
}
