const HASHTAG_SEPARATOR = /[\s,]+/u;

/** Converts persisted or form hashtag values into a fresh string array. */
export function normalizeHashtags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => {
    if (typeof item !== 'string') return [];

    return item
      .split(HASHTAG_SEPARATOR)
      // [v2.11.140d] Canonical form is WITHOUT '#'. The UI now displays tags with a
      // '#' prefix, so strip it here to keep the display→parse round trip stable
      // (otherwise republish would double-prefix to "##tag").
      .map((hashtag) => hashtag.trim().replace(/^#+/u, ''))
      .filter(Boolean);
  });
}
