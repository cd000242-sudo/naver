/**
 * Genre table and limits for the per-genre Shorts search of the "떡상 영상 보드" (2026-11-10). One data list: add,
 * rename or drop a genre here only — the search, the board header (genres) and the per-genre cap all read this table.
 *
 * Quota (YouTube Data API, 10,000 units/day shared with other features): search.list costs 100 units, so one search
 * round = GENRES.length x 100 = 1,100. A round runs at most once per SEARCH_REFRESH_MS (6 h) = at most 4 a day =
 * 4,400 units. videos.list costs 1 unit per call (50 ids): a rebuild is 14 chart calls + at most 11 search-id calls
 * = 25 units, and a rebuild needs a previous board older than 25 minutes (<= 57 a day) -> at most ~1,400 units.
 * Worst case ~5,800 units/day; a normal day with a handful of deploys is ~4,500.
 */
export const GENRES = Object.freeze([
  { id: 'tips', name: '꿀팁', q: '꿀팁 #shorts' },
  { id: 'funny', name: '예능·웃긴', q: '웃긴영상 #shorts' },
  { id: 'animal', name: '동물', q: '강아지 고양이 #shorts' },
  { id: 'movie', name: '영화·드라마', q: '영화리뷰 결말포함 #shorts' },
  { id: 'shopping', name: '쇼핑·추천템', q: '추천템 #shorts' },
  { id: 'travel', name: '여행', q: '여행 #shorts' },
  { id: 'knowledge', name: '1분 지식', q: '1분 지식 #shorts' },
  { id: 'house', name: '집·건축', q: '집 인테리어 #shorts' },
  { id: 'story', name: '사연·감동', q: '사연 감동 #shorts' },
  { id: 'mystery', name: '미스터리', q: '미스터리 #shorts' },
  { id: 'history', name: '역사', q: '역사 #shorts' },
].map((genre) => Object.freeze(genre)));

/** A search round is repeated only when the previous one is at least this old (quota). */
export const SEARCH_REFRESH_MS = 6 * 60 * 60_000;
/** Each search asks for videos published within this window. */
export const SEARCH_WINDOW_MS = 7 * 24 * 60 * 60_000;
/** Search ids are carried over (re-fetched for fresh numbers) only while their search is younger than this. */
export const SEARCH_CARRY_MAX_MS = SEARCH_WINDOW_MS;
/** No genre may fill more than this many board slots. */
export const GENRE_CAP = 50;
/** The fastest this-many items of every genre stay on the board even when the popular chart alone would fill it. */
export const GENRE_FLOOR = 20;
/** Board size once the search is in (chart-only callers keep MAX_ITEMS). */
export const BOARD_MAX_ITEMS = 600;
