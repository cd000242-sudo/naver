export interface ScheduledPostCandidate {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly [key: string]: unknown;
}

export type ScheduledPostLookupReason =
  | 'exact-id'
  | 'exact-title'
  | 'normalized-title'
  | 'post-id-not-found'
  | 'title-not-found'
  | 'invalid-post-list';

export interface ScheduledPostLookupResult<T extends ScheduledPostCandidate> {
  readonly post: T | null;
  readonly reason: ScheduledPostLookupReason;
}

function isUsablePostId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'null' && normalized !== 'undefined';
}

function normalizeTitle(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '');
}

/**
 * A scheduled publish must never silently substitute another generated post.
 * A supplied ID is authoritative; title matching is allowed only when no ID
 * exists and requires exact or punctuation-insensitive equality.
 */
export function selectScheduledPostCandidate<T extends ScheduledPostCandidate>(
  posts: readonly T[] | unknown,
  postId: unknown,
  title: unknown,
): ScheduledPostLookupResult<T> {
  if (!Array.isArray(posts)) return { post: null, reason: 'invalid-post-list' };

  if (isUsablePostId(postId)) {
    const exactId = posts.find((post) => String(post?.id ?? '') === postId.trim()) ?? null;
    return exactId
      ? { post: exactId, reason: 'exact-id' }
      : { post: null, reason: 'post-id-not-found' };
  }

  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle) return { post: null, reason: 'title-not-found' };

  const exactTitle = posts.find((post) => String(post?.title ?? '').trim() === trimmedTitle) ?? null;
  if (exactTitle) return { post: exactTitle, reason: 'exact-title' };

  const normalizedTitle = normalizeTitle(trimmedTitle);
  if (!normalizedTitle) return { post: null, reason: 'title-not-found' };
  const normalizedMatch = posts.find(
    (post) => normalizeTitle(post?.title) === normalizedTitle,
  ) ?? null;

  return normalizedMatch
    ? { post: normalizedMatch, reason: 'normalized-title' }
    : { post: null, reason: 'title-not-found' };
}

/** Parses the app's local YYYY-MM-DD HH:mm schedule format with round-trip validation. */
export function parseScheduledDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0'] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  const roundTrips = date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute
    && date.getSeconds() === second;

  return roundTrips ? date : null;
}
