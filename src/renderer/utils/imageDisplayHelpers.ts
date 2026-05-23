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
 * Missing blobs trigger in-memory cleanup: blobId field is removed so the renderer
 * stops trying to materialize them. previewDataUrl is preserved if it was a data: URL
 * (independent of the blob — survives blob loss).
 *
 * Legacy images without blobId are NOT touched (they go through Phase 6 migration).
 *
 * @param posts Array of post objects (mutates in place when blob missing).
 * @returns Number of missing blobs (for metric reporting).
 */
export async function validateBlobReferences(posts: any[]): Promise<number> {
  const api = (window as any).electronAPI;
  if (!api?.blobs?.hasMany) return 0;

  const blobIds: string[] = [];
  const refs: Array<{ img: any }> = [];

  for (const post of posts) {
    for (const img of (post.images || []) as any[]) {
      const blobId = typeof img?.blobId === 'string' ? img.blobId : '';
      if (blobId) {
        blobIds.push(blobId);
        refs.push({ img });
      }
    }
  }

  if (blobIds.length === 0) return 0;

  let existsArr: boolean[];
  try {
    existsArr = await api.blobs.hasMany(blobIds);
  } catch (e) {
    console.warn('[postListUI] blob hasMany failed (ignored):', e);
    return 0;
  }

  let missingCount = 0;
  for (let i = 0; i < refs.length; i++) {
    if (!existsArr[i]) {
      // Blob missing on disk — remove blobId so extractDisplayUrl falls back to
      // previewDataUrl (if data: URL) or shows the empty placeholder.
      delete refs[i].img.blobId;
      missingCount++;
    }
  }
  return missingCount;
}
