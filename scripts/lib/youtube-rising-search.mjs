/**
 * Per-genre search collection for the "떡상 영상 보드" (2026-11-10). Pure decisions + a `client` that is injected
 * (see youtube-rising-fetch.mjs), so the quota rules can be tested without the network.
 *
 * Quota rule: search.list is expensive (100 units), so a search round happens at most once per SEARCH_REFRESH_MS.
 * Between rounds the ids found last time are kept on the board (items carry `genre`) and only their numbers are
 * asked again with videos.list (1 unit per 50 ids).
 */
import { boardItems } from './youtube-rising-core.mjs';
import { GENRES, SEARCH_CARRY_MAX_MS, SEARCH_REFRESH_MS, SEARCH_WINDOW_MS } from './youtube-rising-genres.mjs';

const KNOWN_GENRES = new Set(GENRES.map((genre) => genre.id));
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ageOf = (previous, now) => now - Date.parse(previous?.searchedAt);

/** reuse = the previous search is younger than 6 h; search = ask again (also: never searched, unreadable or future time). */
export function planSearch(previous, now) {
  const age = ageOf(previous, now);
  return age >= 0 && age < SEARCH_REFRESH_MS ? { action: 'reuse' } : { action: 'search' };
}

/** Search ids kept on a previous board (`items` and `more`): items with a known genre (an old-format board has none). */
export function carriedEntries(previous) {
  return boardItems(previous)
    .filter((item) => item && VIDEO_ID.test(String(item.videoId)) && KNOWN_GENRES.has(item.genre))
    .map((item) => ({ videoId: item.videoId, genre: item.genre }));
}

/** Chart items first (a video found by both keeps its chart data and gains the genre), then search-only items. */
export function mergeSources(chartItems, searchItems) {
  const genreById = new Map(searchItems.filter(Boolean).map((item) => [item.videoId, item.genre || '']));
  const chart = chartItems.filter(Boolean).map((item) => ({ ...item, genre: genreById.get(item.videoId) || '', source: 'chart' }));
  const charted = new Set(chart.map((item) => item.videoId));
  return [...chart, ...searchItems.filter((item) => item && !charted.has(item.videoId)).map((item) => ({ ...item, source: 'search' }))];
}

/** Ids → fresh numbers, each item tagged with its genre and source 'search'. */
async function withNumbers(client, entries) {
  if (entries.length === 0) return [];
  const genreById = new Map(entries.map((entry) => [entry.videoId, entry.genre]));
  const items = await client.fetchVideos(entries.map((entry) => entry.videoId));
  return items.filter((item) => genreById.has(item.videoId)).map((item) => ({ ...item, genre: genreById.get(item.videoId), source: 'search' }));
}

const firstGenreWins = (entries) => {
  const seen = new Set();
  return entries.filter((entry) => !seen.has(entry.videoId) && seen.add(entry.videoId));
};

/**
 * → { items, searchedAt, searched }. `searchedAt` moves forward only when a round produced usable items; when every
 * search failed the previous search items go on and `searchedAt` stays as it was (null when there never was one).
 * A genre whose search failed keeps its previous ids. Search ids older than SEARCH_CARRY_MAX_MS are not carried.
 */
export async function gatherSearchItems(client, previous, now) {
  const age = ageOf(previous, now);
  const carried = age >= 0 && age < SEARCH_CARRY_MAX_MS ? carriedEntries(previous) : [];
  const kept = { searchedAt: typeof previous?.searchedAt === 'string' ? previous.searchedAt : null, searched: false };
  if (planSearch(previous, now).action === 'reuse') return { items: await withNumbers(client, carried), ...kept };

  const publishedAfter = new Date(now - SEARCH_WINDOW_MS).toISOString();
  const rounds = [];
  for (const genre of GENRES) rounds.push({ genre: genre.id, ids: await client.searchGenre(genre, publishedAfter) });
  const failed = new Set(rounds.filter((round) => round.ids === null).map((round) => round.genre));
  if (failed.size === GENRES.length) return { items: await withNumbers(client, carried), ...kept };

  const fresh = rounds.flatMap((round) => (round.ids || []).map((videoId) => ({ videoId, genre: round.genre })));
  const items = await withNumbers(client, firstGenreWins([...fresh, ...carried.filter((entry) => failed.has(entry.genre))]));
  return items.length > 0 ? { items, searchedAt: new Date(now).toISOString(), searched: true } : { items, ...kept };
}
