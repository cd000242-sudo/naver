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
 */
export const BOARD_SCHEMA_VERSION = 1;
export const MAX_ITEMS = 200;
export const MIN_REBUILD_MS = 25 * 60_000;
export const CARRY_FORWARD_MAX_MS = 6 * 60 * 60_000;
const RETENTION_MAX_MS = 30 * 24 * 60 * 60_000;
const MIN_DELTA_MS = 15 * 60_000;
const SHORT_MAX_SEC = 180;

/** Korean names for the categories the board asks for (KR region). */
export const CATEGORY_NAMES = {
  1: '영화·애니', 2: '자동차', 10: '음악', 15: '동물', 17: '스포츠', 19: '여행', 20: '게임', 22: '인물·일상',
  23: '코미디', 24: '엔터테인먼트', 25: '뉴스·정치', 26: '노하우·스타일', 27: '교육', 28: '과학기술',
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

/** One API video resource → one board item, or null when the id is not a YouTube video id. */
export function normalizeVideo(resource, categoryName) {
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
    categoryName: text(categoryName || CATEGORY_NAMES[snippet.categoryId] || '', 20),
    viewCount: count(resource.statistics?.viewCount),
    likeCount: count(resource.statistics?.likeCount),
    commentCount: count(resource.statistics?.commentCount),
    description: text(snippet.description, 300),
  };
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

/** Deduplicate, attach views per hour (delta against the previous deploy when it was seen there), sort, cap. */
export function buildRisingBoard(rawItems, previous, now) {
  const prior = readPreviousBoard(previous, now);
  const previousAt = prior ? Date.parse(prior.builtAt) : NaN;
  const previousById = new Map((prior?.items || []).map((item) => [item.videoId, item]));
  const seen = new Set();
  const items = rawItems.filter((item) => item && !seen.has(item.videoId) && seen.add(item.videoId))
    .map((item) => ({ ...item, ...velocityOf(item, previousById.get(item.videoId), previousAt, now) }))
    .sort((a, b) => (b.viewsPerHour ?? -1) - (a.viewsPerHour ?? -1))
    .slice(0, MAX_ITEMS);
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    builtAt: new Date(now).toISOString(),
    source: 'youtube-data-api',
    region: 'KR',
    attribution: 'YouTube 인기 차트 (YouTube Data API)',
    windowMin: prior ? Math.round((now - previousAt) / 60_000) : null,
    items,
  };
}
