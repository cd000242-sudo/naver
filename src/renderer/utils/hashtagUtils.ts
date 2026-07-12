const HASHTAG_SEPARATOR = /[\s,]+/u;

/** Converts persisted or form hashtag values into a fresh string array. */
export function normalizeHashtags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];

  return values.flatMap((item) => {
    if (typeof item !== 'string') return [];

    return item
      .split(HASHTAG_SEPARATOR)
      .map((hashtag) => hashtag.trim())
      .filter(Boolean);
  });
}
