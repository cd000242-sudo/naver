/**
 * YouTube popular chart → "떡상 영상 보드" for the LDB extension (2026-11-03). Pure functions only; IO lives in
 * scripts/youtube-rising.mjs.
 *
 * Policy notes (YouTube API Services Developer Policies):
 * - The board is rebuilt at every Pages deploy and is never committed (III.E.4: no API data older than 30 days;
 *   this repository is public, so a commit would keep it forever).
 * - Titles and thumbnails are passed through unchanged; the attribution line names the source (III.F.2).
 * - views-per-hour is a simple calculation over API data only, and the board labels it as ours.
 * - Shorts are told apart with API fields (duration + player aspect), not by probing youtube.com/shorts/.
 * - 2026-11-10: per-genre Shorts search items are added (genre/source per item, searchedAt/genres on the board). These
 *   are additions only — schemaVersion stays 1 and no existing field changes its name or meaning.
 * - 2026-11-10: the board holds up to 600 videos, but `items` keeps only the fastest HEAD_ITEMS (200): the extension that is
 *   already installed reads at most 200 items and reports every further one as "dropped". The rest goes into the new
 *   `more` array (items first, then more = one fastest-first order). Anything that reads a previous board must read both
 *   (boardItems); a board without `more` (old format) reads as items only.
 */
import { GENRES } from './youtube-rising-genres.mjs';

export const BOARD_SCHEMA_VERSION = 1;
export const MAX_ITEMS = 200;
/** How many items the board's `items` array may hold = what the already installed extension reads. The rest goes to `more`. */
export const HEAD_ITEMS = 200;
export const MIN_REBUILD_MS = 25 * 60_000;
export const CARRY_FORWARD_MAX_MS = 6 * 60 * 60_000;
const RETENTION_MAX_MS = 30 * 24 * 60 * 60_000;
const MIN_DELTA_MS = 15 * 60_000;
const SHORT_MAX_SEC = 180;

/** Korean names for the categories the board asks for (KR region). */
export const CATEGORY_NAMES = {
  1: '영화·애니', 2: '자동차', 10: '음악', 15: '동물', 17: '스포츠', 19: '여행', 20: '게임', 22: '인물·일상',
  23: '코미디', 24: '엔터테인먼트', 25: '뉴스·정치', 26: '노하우·스타일', 27: '교육', 28: '과학기술', 29: '비영리·사회',
};

/** ISO 8601 duration (PT1H2M3S, P1DT1S, P0D) → seconds, or null when it cannot be read. */
export function parseIsoDuration(value) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value || ''));
  if (!m || value === 'P' || value === 'PT') return null;
  const [d, h, min, s] = m.slice(1).map((part) => Number(part || 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** 'short' only for ≤180 s with a vertical player; '' when the size is unknown (never guessed). */
export function classifyForm(durationSec, embedWidth, embedHeight) {
  if (!Number.isFinite(durationSec)) return '';
  if (durationSec > SHORT_MAX_SEC) return 'long';
  const w = Number(embedWidth), h = Number(embedHeight);
  if (!(w > 0 && h > 0)) return '';
  return h > w ? 'short' : 'long';
}

const count = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isoTime = (value) => (Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : '');

function thumbnailOf(snippet) {
  const thumbs = snippet?.thumbnails || {};
  const url = String((thumbs.medium || thumbs.high || thumbs.default || {}).url || '');
  return /^https:\/\/i\.ytimg\.com\/[^\s"'<>]+$/.test(url) ? url : '';
}

/**
 * One API video resource → one board item, or null when the id is not a YouTube video id.
 * The category name comes from the video's own snippet.categoryId: a category chart (videoCategoryId=26) also
 * returns videos filed elsewhere, so the requested chart is not the video's category (live board 2026-11-03).
 */
export function normalizeVideo(resource) {
  const videoId = String(resource?.id || '');
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const snippet = resource.snippet || {};
  const durationSec = parseIsoDuration(resource.contentDetails?.duration);
  const form = classifyForm(durationSec, resource.player?.embedWidth, resource.player?.embedHeight);
  return {
    videoId,
    url: form === 'short' ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
    title: text(snippet.title, 200),
    channel: text(snippet.channelTitle, 100),
    channelId: /^UC[A-Za-z0-9_-]{10,40}$/.test(String(snippet.channelId || '')) ? snippet.channelId : '',
    publishedAt: isoTime(snippet.publishedAt),
    thumbnail: thumbnailOf(snippet),
    durationSec,
    form,
    categoryId: text(snippet.categoryId, 4),
    categoryName: text(CATEGORY_NAMES[snippet.categoryId] || '', 20),
    viewCount: count(resource.statistics?.viewCount),
    likeCount: count(resource.statistics?.likeCount),
    commentCount: count(resource.statistics?.commentCount),
    description: text(snippet.description, 300),
  };
}

/** Every item of a board, in board order: `items` then `more`. A missing or non-array `more` (old format) adds nothing. */
export function boardItems(board) {
  const head = Array.isArray(board?.items) ? board.items : [];
  return Array.isArray(board?.more) ? [...head, ...board.more] : [...head];
}

/** The same board cut into the first HEAD_ITEMS in `items` and the rest in `more` (a new object; the input is untouched). */
export function splitBoard(board) {
  const all = boardItems(board);
  return { ...board, items: all.slice(0, HEAD_ITEMS), more: all.slice(HEAD_ITEMS) };
}

/** A previous board is usable only when it is ours (schema 1), well formed and inside the 30-day window. */
export function readPreviousBoard(value, now) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== BOARD_SCHEMA_VERSION || !Array.isArray(value.items)) return null;
  const builtAt = Date.parse(value.builtAt);
  if (!Number.isFinite(builtAt) || builtAt > now || now - builtAt > RETENTION_MAX_MS) return null;
  return value;
}

/** reuse = publish the previous board as is; fetch = call the API; skip = publish no board. */
export function planRebuild(previous, now, hasKey) {
  const age = previous ? now - Date.parse(previous.builtAt) : Infinity;
  if (age < MIN_REBUILD_MS) return { action: 'reuse' };
  if (hasKey) return { action: 'fetch' };
  return age < CARRY_FORWARD_MAX_MS ? { action: 'reuse' } : { action: 'skip' };
}

function velocityOf(item, previousItem, previousAt, now) {
  if (item.viewCount === null) return { viewsPerHour: null, velocity: '' };
  if (previousItem && Number.isFinite(previousItem.viewCount) && now - previousAt >= MIN_DELTA_MS) {
    const gained = item.viewCount - previousItem.viewCount;
    if (gained < 0) return { viewsPerHour: null, velocity: '' };
    return { viewsPerHour: Math.round(gained / ((now - previousAt) / 3_600_000)), velocity: 'delta' };
  }
  const published = Date.parse(item.publishedAt);
  if (!Number.isFinite(published) || published > now) return { viewsPerHour: null, velocity: '' };
  const hours = Math.max(1, (now - published) / 3_600_000);
  return { viewsPerHour: Math.round(item.viewCount / hours), velocity: 'average' };
}

/** Per-genre counts in genre-table order (a genre with no item is left out). */
export function summarizeGenres(items) {
  return GENRES.map(({ id, name }) => ({ id, name, count: items.filter((item) => item.genre === id).length })).filter((genre) => genre.count > 0);
}

/**
 * Keeps at most `genreCap` items per genre (items are already fastest first), then at most `maxItems` overall.
 * The first `genreFloor` items of each genre are reserved: they stay even when faster chart items would fill the board
 * (a slow genre must not vanish). The result keeps the fastest-first order.
 */
function capItems(sorted, maxItems, genreCap, genreFloor) {
  const used = new Map();
  const ranked = sorted.map((item) => {
    if (!item.genre) return { item, rank: Infinity };
    used.set(item.genre, (used.get(item.genre) || 0) + 1);
    return { item, rank: used.get(item.genre) };
  }).filter((entry) => entry.rank === Infinity || entry.rank <= genreCap);
  const reserved = ranked.filter((entry) => entry.rank <= genreFloor).slice(0, maxItems);
  let room = maxItems - reserved.length;
  return ranked.filter((entry) => entry.rank <= genreFloor ? reserved.includes(entry) : room-- > 0).map((entry) => entry.item);
}

/**
 * Deduplicate, attach views per hour (delta against the previous deploy when it was seen there), sort, cap.
 * options (all optional): maxItems (default MAX_ITEMS = chart-only size), genreCap (default none), genreFloor (default 0), searchedAt (ISO of
 * the last per-genre search, written to the board as is). Plain chart callers pass nothing and get the old behavior.
 */
export function buildRisingBoard(rawItems, previous, now, options = {}) {
  const { maxItems = MAX_ITEMS, genreCap = Infinity, genreFloor = 0 } = options;
  const prior = readPreviousBoard(previous, now);
  const previousAt = prior ? Date.parse(prior.builtAt) : NaN;
  const previousById = new Map(boardItems(prior).map((item) => [item.videoId, item]));
  const seen = new Set();
  const sorted = rawItems.filter((item) => item && !seen.has(item.videoId) && seen.add(item.videoId))
    .map((item) => ({ ...item, ...velocityOf(item, previousById.get(item.videoId), previousAt, now) }))
    .sort((a, b) => (b.viewsPerHour ?? -1) - (a.viewsPerHour ?? -1));
  const all = capItems(sorted, maxItems, genreCap, genreFloor);
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    builtAt: new Date(now).toISOString(),
    source: 'youtube-data-api',
    region: 'KR',
    attribution: 'YouTube 인기 차트 (YouTube Data API)',
    windowMin: prior ? Math.round((now - previousAt) / 60_000) : null,
    searchedAt: isoTime(options.searchedAt) || null,
    genres: summarizeGenres(all),
    items: all.slice(0, HEAD_ITEMS),
    more: all.slice(HEAD_ITEMS),
  };
}
