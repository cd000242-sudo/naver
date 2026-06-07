// SPEC-IMAGE-MODEL-001 Phase 4 — safe thumbnail URL extraction (no absolute paths).

/**
 * Returns a browser-safe <img src> string for an image object, or null if none available.
 * Strictly excludes absolute paths and file:// URLs — those would emit ERR_FILE_NOT_FOUND
 * when the file is missing (cross-PC restore, blob migration, etc.).
 *
 * Priority:
 *   1. previewDataUrl (data:image/...;base64,... — Phase 3 normalized)
 *   2. url (http(s):// — remote URL such as Naver CDN)
 *
 * filePath is intentionally NOT used as a thumbnail source. It is preserved on the image
 * object as a legacy fs reference (deprecated in Phase 7).
 */
export function extractDisplayUrl(img: any): string | null {
  if (!img) return null;

  const previewDataUrl = typeof img.previewDataUrl === 'string' ? img.previewDataUrl : '';
  if (previewDataUrl.startsWith('data:image/')) return previewDataUrl;
  if (previewDataUrl.startsWith('http://') || previewDataUrl.startsWith('https://')) return previewDataUrl;

  const url = typeof img.url === 'string' ? img.url : '';
  if (url.startsWith('data:image/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  return null;
}

/**
 * Phase 4 batch validate replacement.
 *
 * For each image with a blobId, asks main process if the blob bytes exist on disk.
 * Missing blobs are stripped from a CLONED copy of posts — the input array and its
 * nested objects are never mutated, so callers that share post references with other
 * code paths stay safe. previewDataUrl on each image survives blob loss because it
 * is an independent data: URL field.
 *
 * Legacy images without blobId are NOT touched (they go through Phase 6 migration).
 *
 * @param posts Array of post objects (read-only, never mutated).
 * @returns { posts: cleaned copy with missing blobIds stripped, missingCount: metric }
 */
export interface ValidateBlobReferencesResult {
  posts: any[];
  missingCount: number;
}

const BLOB_EXISTS_CACHE_TTL_MS = 30_000;
const blobExistsCache = new Map<string, { exists: boolean; checkedAt: number }>();
let lastBlobHasManyRef: unknown = null;

function getCachedBlobExists(blobId: string, now: number): boolean | undefined {
  const cached = blobExistsCache.get(blobId);
  if (!cached) return undefined;
  if (now - cached.checkedAt > BLOB_EXISTS_CACHE_TTL_MS) {
    blobExistsCache.delete(blobId);
    return undefined;
  }
  return cached.exists;
}

export async function validateBlobReferences(posts: any[]): Promise<ValidateBlobReferencesResult> {
  const api = (window as any).electronAPI;
  if (!api?.blobs?.hasMany) return { posts, missingCount: 0 };
  const hasMany = api.blobs.hasMany;
  if (lastBlobHasManyRef !== hasMany) {
    blobExistsCache.clear();
    lastBlobHasManyRef = hasMany;
  }

  const blobIds: string[] = [];
  for (const post of posts) {
    for (const img of (post.images || []) as any[]) {
      const blobId = typeof img?.blobId === 'string' ? img.blobId : '';
      if (blobId) blobIds.push(blobId);
    }
  }

  if (blobIds.length === 0) return { posts, missingCount: 0 };

  const now = Date.now();
  const uniqueBlobIds = Array.from(new Set(blobIds));
  const existsById = new Map<string, boolean>();
  const idsToQuery: string[] = [];

  for (const blobId of uniqueBlobIds) {
    const cached = getCachedBlobExists(blobId, now);
    if (cached === undefined) {
      idsToQuery.push(blobId);
    } else {
      existsById.set(blobId, cached);
    }
  }

  if (idsToQuery.length > 0) {
    let existsArr: boolean[];
    try {
      existsArr = await hasMany(idsToQuery);
    } catch (e) {
      console.warn('[postListUI] blob hasMany failed (ignored):', e);
      return { posts, missingCount: 0 };
    }

    idsToQuery.forEach((blobId, index) => {
      const exists = existsArr[index] !== false;
      existsById.set(blobId, exists);
      blobExistsCache.set(blobId, { exists, checkedAt: now });
    });
  }

  const missingBlobIds = new Set<string>();
  for (const post of posts) {
    for (const img of (post.images || []) as any[]) {
      const blobId = typeof img?.blobId === 'string' ? img.blobId : '';
      if (blobId) {
        if (existsById.get(blobId) === false) missingBlobIds.add(blobId);
      }
    }
  }

  if (missingBlobIds.size === 0) return { posts, missingCount: 0 };

  // Clone only the touched branches — preserve untouched post references.
  const cleaned = posts.map((post) => {
    if (!Array.isArray(post.images)) return post;
    let postNeedsClone = false;
    const cleanedImages = post.images.map((img: any) => {
      if (typeof img?.blobId === 'string' && missingBlobIds.has(img.blobId)) {
        postNeedsClone = true;
        const { blobId: _stripped, ...rest } = img;
        return rest;
      }
      return img;
    });
    return postNeedsClone ? { ...post, images: cleanedImages } : post;
  });

  return { posts: cleaned, missingCount: missingBlobIds.size };
}
