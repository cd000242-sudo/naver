/**
 * Genre table and limits for the per-genre search of the "떡상 영상 보드" (2026-11-10; rows reworked 2026-11-27 toward
 * entertainment / issue / funny / drama / movie videos that are longer than a Short; 2026-11-28: movie and comedy search
 * by Korean text instead of a category number, two long rows added, everything a search found is kept, board 1,000).
 * One data list: add, rename or drop a genre here only — the search, the board header (genres, genresKey) and the
 * per-genre cap all read this table.
 *
 * A row says how it searches: { id, name, q?, categoryId?, duration }. `q` is the search text, `categoryId` the video
 * category (videoCategoryId), `duration` is 'short' (under 4 min) | 'medium' (4-20 min) | 'long' (over 20 min) and
 * defaults to 'short'. A row needs q or categoryId or both. The table is validated once, when this module loads.
 *
 * Quota (YouTube Data API, 10,000 units/day shared with other features): search.list costs 100 units, so one search
 * round = 15 genres x 100 = 1,500. A round runs at most once per SEARCH_REFRESH_MS (6 h) = at most 4 a day =
 * 6,000 units. videos.list costs 1 unit per call (50 ids): a rebuild is 14 chart calls + at most 15 search-id calls
 * (15 genres x 50 ids = 750 ids = 15 calls) = 29 units, and a rebuild needs a previous board older than 25 minutes
 * (<= 57 a day) -> at most 1,653 units.
 * Worst case 7,653 units/day (6,000 + 1,653); a normal day with a handful of deploys is ~6,100.
 * A changed table (genresKey) searches at once: one extra round, +1,500 units on the day of the change, so that
 * day's worst case is 9,153 — still under 10,000, but it leaves only about 847 units for the other features.
 */
import { createHash } from 'node:crypto';

export const DEFAULT_DURATION = 'short';
const DURATIONS = Object.freeze(['short', 'medium', 'long']);
const FIELDS = new Set(['id', 'name', 'q', 'categoryId', 'duration']);
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** The first thing wrong with one table row (`seen` = ids of the rows before it), or '' when the row is fine. */
function problemOf(row, seen) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'must be an object';
  const unknown = Object.keys(row).find((key) => !FIELDS.has(key));
  if (unknown) return `unknown field "${unknown}"`;
  if (typeof row.id !== 'string' || !ID_PATTERN.test(row.id)) return 'id must be lowercase letters, digits and hyphens';
  if (seen.has(row.id)) return 'duplicate id';
  if (!isText(row.name)) return 'name must be a non-empty string';
  if (row.q !== undefined && !isText(row.q)) return 'q must be a non-empty string';
  if (row.categoryId !== undefined && !(typeof row.categoryId === 'string' && /^\d{1,3}$/.test(row.categoryId))) return 'categoryId must be digits in a string';
  if (row.q === undefined && row.categoryId === undefined) return 'needs q or categoryId';
  if (row.duration !== undefined && !DURATIONS.includes(row.duration)) return `duration must be one of ${DURATIONS.join(', ')}`;
  return '';
}

/** Table → new frozen rows with `duration` filled in; throws a clear error naming the first broken row. Input is untouched. */
export function normalizeGenres(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('youtube-rising genres: the table must be a non-empty array');
  const seen = new Set();
  return rows.map((row, index) => {
    const problem = problemOf(row, seen);
    if (problem) throw new Error(`youtube-rising genres: row ${index} ("${String(row?.id ?? '').slice(0, 40)}"): ${problem}`);
    seen.add(row.id);
    return Object.freeze({
      id: row.id,
      name: row.name,
      ...(row.q !== undefined ? { q: row.q } : {}),
      ...(row.categoryId !== undefined ? { categoryId: row.categoryId } : {}),
      duration: row.duration ?? DEFAULT_DURATION,
    });
  });
}

export const GENRES = Object.freeze(normalizeGenres([
  { id: 'ent-issue', name: '연예 이슈', q: '연예 이슈', duration: 'medium' },
  { id: 'ent', name: '연예·예능', categoryId: '24', duration: 'medium' },
  { id: 'ent-long', name: '연예·예능 긴 영상', categoryId: '24', duration: 'long' },
  { id: 'variety', name: '예능 레전드', q: '예능 레전드', duration: 'medium' },
  { id: 'drama', name: '드라마', q: '드라마', duration: 'medium' },
  { id: 'drama-long', name: '드라마 몰아보기', q: '드라마 몰아보기', duration: 'long' },
  { id: 'movie', name: '영화', q: '영화 리뷰', duration: 'medium' },
  { id: 'movie-long', name: '영화 결말포함', q: '영화 결말포함', duration: 'long' },
  { id: 'issue', name: '사건·이슈', q: '이슈 정리', duration: 'medium' },
  { id: 'case', name: '사건·사고', q: '사건 사고', duration: 'medium' },
  { id: 'comedy', name: '개그·코미디', q: '개그 코미디', duration: 'medium' },
  { id: 'funny', name: '웃긴 영상 모음', q: '웃긴 영상 모음', duration: 'medium' },
  { id: 'prank', name: '몰래카메라', q: '몰래카메라', duration: 'medium' },
  { id: 'story', name: '사연·썰', q: '사연 썰', duration: 'medium' },
  /* Unchanged on purpose: another screen of the app takes its house topics from this row. */
  { id: 'house', name: '집·건축', q: '집 인테리어 #shorts', duration: 'short' },
]));

/** Short stable fingerprint of what the table searches (ids + q + categoryId + duration, in order; not the shown name). */
export function genresKeyOf(genres) {
  const rows = genres.map((genre) => [genre.id, genre.q ?? null, genre.categoryId ?? null, genre.duration ?? DEFAULT_DURATION]);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 12);
}
/** Written into the board header; a previous board with another (or no) key is searched again at once. */
export const GENRES_KEY = genresKeyOf(GENRES);

/** A search round is repeated only when the previous one is at least this old (quota). */
export const SEARCH_REFRESH_MS = 6 * 60 * 60_000;
/** Each search asks for videos published within this window. */
export const SEARCH_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** Search ids are carried over (re-fetched for fresh numbers) only while their search is younger than this. */
export const SEARCH_CARRY_MAX_MS = SEARCH_WINDOW_MS;
/** No genre may fill more than this many board slots. */
export const GENRE_CAP = 50;
/** The fastest this-many items of every genre stay on the board even when the popular chart alone would fill it (= GENRE_CAP: all a search found). */
export const GENRE_FLOOR = 50;
/** Board size once the search is in (chart-only callers keep MAX_ITEMS). */
export const BOARD_MAX_ITEMS = 1000;
