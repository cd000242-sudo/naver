const OFFICIAL_PRODUCT_IMAGE_HOSTS = new Set([
  'shop-phinf.pstatic.net',
  'shopping-phinf.pstatic.net',
]);

function normalizeOfficialProductImage(rawUrl: string): { key: string; url: string } | null {
  const value = String(rawUrl || '').trim().replace(/&amp;/g, '&');
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!OFFICIAL_PRODUCT_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    if (!/\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)) return null;

    const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    return {
      key: base.toLowerCase(),
      url: `${base}?type=m1000_pd`,
    };
  } catch {
    return null;
  }
}

/**
 * Merge representative/thumbnail/JSON-LD sources into the official product
 * gallery. Checkout review photos, recommendation cards and proxy hosts are
 * deliberately excluded instead of being mixed into galleryImages.
 */
export function mergeOfficialNaverProductGallery(
  ...sourceGroups: ReadonlyArray<ReadonlyArray<string>>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const group of sourceGroups) {
    for (const rawUrl of group || []) {
      const normalized = normalizeOfficialProductImage(rawUrl);
      if (!normalized || seen.has(normalized.key)) continue;
      seen.add(normalized.key);
      result.push(normalized.url);
    }
  }

  return result;
}
