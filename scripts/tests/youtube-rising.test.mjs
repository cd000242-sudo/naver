// [2026-11-03] LDB "떡상 영상 보드" — the YouTube popular chart with a measured views-per-hour.
// Built at Pages deploy time (never committed: YouTube API data may not be kept over 30 days, and this repo is public).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SCHEMA_VERSION, CARRY_FORWARD_MAX_MS, MIN_REBUILD_MS, boardItems, buildRisingBoard, classifyForm, normalizeVideo,
  parseIsoDuration, planRebuild, readPreviousBoard,
} from '../lib/youtube-rising-core.mjs';
import { BOARD_MAX_ITEMS, GENRES, GENRE_CAP, SEARCH_REFRESH_MS, SEARCH_WINDOW_MS } from '../lib/youtube-rising-genres.mjs';
import { carriedEntries, gatherSearchItems, mergeSources, planSearch } from '../lib/youtube-rising-search.mjs';
import { createBudget, createYoutubeClient } from '../lib/youtube-rising-fetch.mjs'; import './youtube-rising-floor.test.mjs';

const NOW = Date.parse('2026-11-03T13:00:00Z');
const MIN = 60_000;
const video = (id, extra = {}) => ({
  id,
  snippet: { title: `제목 ${id}`, channelTitle: '채널', channelId: 'UCabc', publishedAt: new Date(NOW - 10 * 60 * MIN).toISOString(),
    categoryId: '24', description: '설명 '.repeat(200), thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
  statistics: { viewCount: '36000', likeCount: '1200', commentCount: '80' },
  contentDetails: { duration: 'PT41S' },
  player: { embedWidth: '203', embedHeight: '360' },
  ...extra,
});

test('ISO 8601 durations', () => {
  assert.equal(parseIsoDuration('PT41S'), 41);
  assert.equal(parseIsoDuration('PT1M5S'), 65);
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
  assert.equal(parseIsoDuration('P1DT1S'), 86401);
  assert.equal(parseIsoDuration('P0D'), 0);
  assert.equal(parseIsoDuration(''), null);
  assert.equal(parseIsoDuration('garbage'), null);
});

test('form: short = at most 180 s and a vertical player; long = longer or horizontal; unknown stays empty', () => {
  assert.equal(classifyForm(41, 203, 360), 'short');
  assert.equal(classifyForm(180, 203, 360), 'short');
  assert.equal(classifyForm(181, 203, 360), 'long', 'over three minutes is never a Short');
  assert.equal(classifyForm(95, 360, 203), 'long', 'a short horizontal trailer is not a Short');
  assert.equal(classifyForm(41, null, null), '', 'no player size: do not guess');
  assert.equal(classifyForm(null, 203, 360), '');
  assert.equal(classifyForm(900, null, null), 'long');
});

test('normalizeVideo keeps the title as is, caps text, and only accepts i.ytimg thumbnails and valid ids', () => {
  const item = normalizeVideo(video('abcDEF123_-'));
  assert.equal(item.videoId, 'abcDEF123_-');
  assert.equal(item.url, 'https://www.youtube.com/shorts/abcDEF123_-');
  assert.equal(item.title, '제목 abcDEF123_-');
  assert.equal(item.form, 'short');
  assert.equal(item.durationSec, 41);
  assert.equal(item.categoryName, '엔터테인먼트');
  assert.equal(item.viewCount, 36000);
  assert.ok(item.description.length <= 300);
  assert.equal(normalizeVideo(video('bad id!')), null);
  const offsite = video('abcDEF123_-');
  offsite.snippet.thumbnails.medium.url = 'https://evil.example/x.jpg';
  assert.equal(normalizeVideo(offsite).thumbnail, '');
  const long = video('abcDEF123_-', { contentDetails: { duration: 'PT12M' }, player: { embedWidth: '360', embedHeight: '203' } });
  assert.equal(normalizeVideo(long).url, 'https://www.youtube.com/watch?v=abcDEF123_-');
  const hidden = video('abcDEF123_-', { statistics: { viewCount: '500' } });
  assert.equal(normalizeVideo(hidden).likeCount, null, 'hidden counts stay null, never 0');
});

test('categoryName always follows the video\'s own categoryId, never the chart it was asked from', () => {
  // 2026-11-03 first live board: the 26 (노하우·스타일) chart returned videos filed under 22, 15, 2 …, and the board
  // labelled all of them 노하우·스타일 — the LDB filter then listed the same name many times.
  const filedUnder22 = video('ddddddddddd');
  filedUnder22.snippet.categoryId = '22';
  assert.equal(normalizeVideo(filedUnder22).categoryName, '인물·일상');
  assert.equal(normalizeVideo(filedUnder22).categoryId, '22');
  assert.equal(normalizeVideo.length, 1, 'no chart-name argument to pass by mistake');
  const unknown = video('eeeeeeeeeee');
  unknown.snippet.categoryId = '99';
  assert.equal(normalizeVideo(unknown).categoryName, '');
});

test('velocity: delta against the previous deploy, average since upload otherwise, never negative', () => {
  const previous = { schemaVersion: 1, builtAt: new Date(NOW - 60 * MIN).toISOString(), items: [
    { videoId: 'aaaaaaaaaaa', viewCount: 30000 },
    { videoId: 'ccccccccccc', viewCount: 99999 },
  ] };
  const raw = [
    normalizeVideo(video('aaaaaaaaaaa')),
    normalizeVideo(video('bbbbbbbbbbb')),
    normalizeVideo(video('ccccccccccc')),
  ];
  const board = buildRisingBoard(raw, previous, NOW);
  assert.equal(board.schemaVersion, BOARD_SCHEMA_VERSION);
  assert.equal(board.windowMin, 60);
  const byId = Object.fromEntries(board.items.map((i) => [i.videoId, i]));
  assert.deepEqual([byId.aaaaaaaaaaa.viewsPerHour, byId.aaaaaaaaaaa.velocity], [6000, 'delta']);
  assert.deepEqual([byId.bbbbbbbbbbb.viewsPerHour, byId.bbbbbbbbbbb.velocity], [3600, 'average'], '36,000 views in 10 hours');
  assert.deepEqual([byId.ccccccccccc.viewsPerHour, byId.ccccccccccc.velocity], [null, ''], 'a count that went down is not a speed');
  assert.deepEqual(board.items.map((i) => i.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'], 'fastest first, unknown last');
  assert.match(board.attribution, /YouTube/);
});

test('duplicates across category calls collapse to one item; at most 200 items', () => {
  const raw = Array.from({ length: 260 }, (_, n) => normalizeVideo(video(`v${String(n).padStart(10, '0')}`)));
  const board = buildRisingBoard([...raw, raw[0], raw[1]], null, NOW);
  assert.equal(board.items.length, 200);
  assert.equal(new Set(board.items.map((i) => i.videoId)).size, 200);
  assert.equal(board.windowMin, null);
});

test('rebuild plan: reuse a board built within 25 minutes, otherwise call the API; carry forward at most 6 hours', () => {
  const at = (minutes) => ({ schemaVersion: 1, builtAt: new Date(NOW - minutes * MIN).toISOString(), items: [] });
  assert.equal(MIN_REBUILD_MS, 25 * MIN);
  assert.equal(CARRY_FORWARD_MAX_MS, 6 * 60 * MIN);
  assert.deepEqual(planRebuild(at(10), NOW, true), { action: 'reuse' });
  assert.deepEqual(planRebuild(at(40), NOW, true), { action: 'fetch' });
  assert.deepEqual(planRebuild(null, NOW, true), { action: 'fetch' });
  assert.deepEqual(planRebuild(at(40), NOW, false), { action: 'reuse' }, 'no key: keep the recent board');
  assert.deepEqual(planRebuild(at(7 * 60), NOW, false), { action: 'skip' }, 'no key and old board: publish nothing');
});

test('readPreviousBoard accepts only a well-formed recent board', () => {
  assert.equal(readPreviousBoard(null, NOW), null);
  assert.equal(readPreviousBoard({ schemaVersion: 2, builtAt: new Date(NOW).toISOString(), items: [] }, NOW), null);
  assert.equal(readPreviousBoard({ schemaVersion: 1, builtAt: 'nope', items: [] }, NOW), null);
  assert.equal(readPreviousBoard({ schemaVersion: 1, builtAt: new Date(NOW - 31 * 24 * 60 * MIN).toISOString(), items: [] }, NOW), null, 'never keep data past 30 days');
  assert.ok(readPreviousBoard({ schemaVersion: 1, builtAt: new Date(NOW - 30 * MIN).toISOString(), items: [] }, NOW));
});

// [2026-11-10] Per-genre Shorts search on the board. Fake client / fake fetch only — no real API call is ever made.
const HOUR = 60 * MIN;
const vid = (n) => `v${String(n).padStart(10, '0')}`;
const ago = (minutes) => new Date(NOW - minutes * MIN).toISOString();
const board = (extra = {}) => ({ schemaVersion: 1, builtAt: ago(30), items: [], ...extra });
const found = (n, genre) => ({ videoId: vid(n), genre, source: 'search', viewCount: 100 });
const speedy = (n, genre, views) => ({ ...normalizeVideo(video(vid(n), { statistics: { viewCount: String(views) } })), genre, source: genre ? 'search' : 'chart' });
const OPTIONS = { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP };
/** Fake client: `search` maps genre id -> ids (a genre that is missing fails); fetchVideos answers every id except `gone`. */
function fakeClient({ search = {}, gone = [] } = {}) {
  const calls = { search: [], videos: [] };
  return {
    calls,
    searchGenre: async (genre, after) => { calls.search.push([genre.id, after]); return search[genre.id] ?? null; },
    fetchVideos: async (ids) => { calls.videos.push(ids); return ids.filter((id) => !gone.includes(id)).map((id) => normalizeVideo(video(id))); },
  };
}

test('genre table is one data list; refresh 6 h, window 7 days, genre cap 50, board cap 600', () => {
  assert.deepEqual(GENRES.map((g) => g.id), ['tips', 'funny', 'animal', 'movie', 'shopping', 'travel', 'knowledge', 'house', 'story', 'mystery', 'history']);
  assert.ok(GENRES.every((g) => /[가-힣]/.test(g.name) && g.q.endsWith(' #shorts')));
  assert.equal(GENRES[0].q, '꿀팁 #shorts');
  assert.deepEqual([SEARCH_REFRESH_MS, SEARCH_WINDOW_MS, GENRE_CAP, BOARD_MAX_ITEMS], [6 * HOUR, 7 * 24 * HOUR, 50, 600]);
});

test('search plan: reuse inside 6 hours; search at 6 hours, older, never (old-format board), unreadable or future', () => {
  const at = (minutes) => board({ searchedAt: ago(minutes) });
  assert.deepEqual(planSearch(at(359), NOW), { action: 'reuse' });
  for (const previous of [at(360), at(420), at(-60), board(), board({ searchedAt: 'nope' }), null]) assert.deepEqual(planSearch(previous, NOW), { action: 'search' });
});

test('carried entries: items with a known genre and a valid id; an old-format board carries none', () => {
  const items = [found(1, 'tips'), found(2, 'ghost'), { videoId: vid(3) }, { videoId: 'bad', genre: 'funny' }, { ...found(4, 'funny'), source: 'chart' }];
  assert.deepEqual(carriedEntries(board({ items })), [{ videoId: vid(1), genre: 'tips' }, { videoId: vid(4), genre: 'funny' }]);
  assert.deepEqual([carriedEntries(board({ items: [{ videoId: vid(3), viewCount: 5 }] })), carriedEntries(null)], [[], []]);
});

test('gather inside 6 hours: no search call, the same ids get fresh numbers, searchedAt is kept', async () => {
  const client = fakeClient();
  const out = await gatherSearchItems(client, board({ searchedAt: ago(120), items: [found(1, 'tips'), found(2, 'funny')] }), NOW);
  assert.equal(client.calls.search.length, 0);
  assert.deepEqual(client.calls.videos, [[vid(1), vid(2)]]);
  assert.deepEqual(out.items.map((i) => [i.videoId, i.genre, i.source]), [[vid(1), 'tips', 'search'], [vid(2), 'funny', 'search']]);
  assert.deepEqual([out.searchedAt, out.searched], [ago(120), false]);
});

test('gather after 6 hours / never / old format: one search per genre in table order, 7-day window, first genre wins a shared id', async () => {
  for (const previous of [null, board(), board({ searchedAt: ago(400) })]) {
    const client = fakeClient({ search: { tips: [vid(1), vid(2)], funny: [vid(2), vid(3)] } });
    const out = await gatherSearchItems(client, previous, NOW);
    assert.deepEqual(client.calls.search.map(([id]) => id), GENRES.map((g) => g.id));
    assert.ok(client.calls.search.every(([, after]) => after === new Date(NOW - SEARCH_WINDOW_MS).toISOString()));
    assert.deepEqual(client.calls.videos, [[vid(1), vid(2), vid(3)]]);
    assert.deepEqual(out.items.map((i) => i.genre), ['tips', 'tips', 'funny']);
    assert.deepEqual([out.searchedAt, out.searched], [new Date(NOW).toISOString(), true]);
  }
});

test('gather: a failed genre keeps its previous ids, the other genres use the new search; searchedAt is renewed', async () => {
  const previous = board({ searchedAt: ago(400), items: [found(8, 'animal'), found(9, 'tips')] });
  const client = fakeClient({ search: { tips: [vid(1)] } });
  const out = await gatherSearchItems(client, previous, NOW);
  assert.deepEqual(client.calls.videos, [[vid(1), vid(8)]], 'tips searched anew (9 dropped); animal failed (8 kept)');
  assert.equal(out.searchedAt, new Date(NOW).toISOString());
});

test('gather: every search fails (quota) -> previous search items go on with fresh numbers, searchedAt is not renewed', async () => {
  const previous = board({ searchedAt: ago(400), items: [found(1, 'tips'), found(2, 'funny')] });
  const client = fakeClient();
  const out = await gatherSearchItems(client, previous, NOW);
  assert.equal(client.calls.search.length, GENRES.length, 'each genre is still tried');
  assert.deepEqual(client.calls.videos, [[vid(1), vid(2)]]);
  assert.deepEqual([out.items.length, out.searchedAt, out.searched], [2, ago(400), false]);
  assert.deepEqual(await gatherSearchItems(fakeClient(), null, NOW), { items: [], searchedAt: null, searched: false });
  const stale = board({ searchedAt: ago(8 * 24 * 60), items: [found(1, 'tips')] });
  assert.equal((await gatherSearchItems(fakeClient(), stale, NOW)).items.length, 0, 'a search older than 7 days is not carried');
});

test('gather: numbers that cannot be fetched after a good search do not renew searchedAt', async () => {
  const out = await gatherSearchItems(fakeClient({ search: { tips: [vid(1)] }, gone: [vid(1)] }), board({ searchedAt: ago(400) }), NOW);
  assert.deepEqual([out.items.length, out.searchedAt, out.searched], [0, ago(400), false]);
});

test('merge: the same video keeps its chart data and gains the genre; source says where it came from; inputs untouched', () => {
  const chart = [normalizeVideo(video(vid(1))), { ...normalizeVideo(video(vid(2))), title: 'chart title' }].map(Object.freeze);
  const search = [{ ...normalizeVideo(video(vid(2))), genre: 'funny', source: 'search' }, { ...normalizeVideo(video(vid(3))), genre: 'tips', source: 'search' }].map(Object.freeze);
  const merged = mergeSources(Object.freeze(chart), Object.freeze(search));
  assert.deepEqual(merged.map((i) => [i.videoId, i.genre, i.source]), [[vid(1), '', 'chart'], [vid(2), 'funny', 'chart'], [vid(3), 'tips', 'search']]);
  assert.equal(merged[1].title, 'chart title');
});

test('board: per-genre cap keeps the fastest of each genre; total cap 600; no options = the old 200', () => {
  const tips = Array.from({ length: 70 }, (_, n) => speedy(n, 'tips', 1000 + n * 100));
  const funny = Array.from({ length: 30 }, (_, n) => speedy(100 + n, 'funny', 90000 + n * 100));
  const items = boardItems(buildRisingBoard([...tips, ...funny], null, NOW, OPTIONS));
  const of = (genre) => items.filter((i) => i.genre === genre);
  assert.deepEqual([of('tips').length, of('funny').length], [50, 30]);
  assert.equal(Math.min(...of('tips').map((i) => i.viewCount)), 3000, 'the 20 slowest tips are cut (steps of 100 keep views/hour distinct)');
  const many = Array.from({ length: 650 }, (_, n) => speedy(1000 + n, '', 100 + n));
  assert.equal(boardItems(buildRisingBoard(many, null, NOW, OPTIONS)).length, 600);
  assert.equal(buildRisingBoard(many, null, NOW).items.length, 200);
});

test('new board fields are additions only: schemaVersion stays 1, old fields keep their names', () => {
  const raw = [speedy(1, 'tips', 900), speedy(2, 'tips', 800), speedy(3, 'funny', 700), speedy(4, '', 600)];
  const out = buildRisingBoard(raw, null, NOW, { searchedAt: ago(90) });
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.searchedAt, ago(90));
  assert.deepEqual(out.genres, [{ id: 'tips', name: '꿀팁', count: 2 }, { id: 'funny', name: '예능·웃긴', count: 1 }]);
  for (const key of ['builtAt', 'source', 'region', 'attribution', 'windowMin', 'items', 'more']) assert.ok(key in out, key);
  assert.deepEqual([out.items[0].genre, out.items[0].source, out.items[3].genre, out.items[3].source], ['tips', 'search', '', 'chart']);
  assert.equal(buildRisingBoard([], null, NOW).searchedAt, null);
});

test('an old-format previous board (no genre, source, searchedAt, genres) works end to end', async () => {
  const previous = { schemaVersion: 1, builtAt: ago(60), items: [{ videoId: vid(1), viewCount: 30000 }] };
  const search = await gatherSearchItems(fakeClient({ search: { tips: [vid(1), vid(2)] } }), previous, NOW);
  const out = buildRisingBoard(mergeSources([], search.items), previous, NOW, { ...OPTIONS, searchedAt: search.searchedAt });
  const byId = Object.fromEntries(out.items.map((i) => [i.videoId, i]));
  assert.deepEqual([out.windowMin, byId[vid(1)].viewsPerHour, byId[vid(1)].velocity, byId[vid(2)].velocity], [60, 6000, 'delta', 'average']);
  assert.deepEqual(out.genres, [{ id: 'tips', name: '꿀팁', count: 2 }]);
});

const reply = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });
function fakeFetch(answer) {
  const urls = [];
  const fn = async (url) => { urls.push(url); return answer(new URL(url).searchParams); };
  return Object.assign(fn, { urls });
}
const clientOf = (fetchImpl, extra = {}) => {
  const logs = [];
  return { logs, client: createYoutubeClient({ key: 'SECRET-KEY-9', fetchImpl, log: (m) => logs.push(m), budget: createBudget(60_000), ...extra }) };
};

test('client.fetchVideos asks 50 ids per call with the agreed parts and drops ids YouTube did not return', async () => {
  const fetchImpl = fakeFetch((p) => reply({ items: p.get('id').split(',').filter((id) => id !== vid(5)).map((id) => video(id)) }));
  const items = await clientOf(fetchImpl).client.fetchVideos(Array.from({ length: 120 }, (_, n) => vid(n)));
  assert.deepEqual(fetchImpl.urls.map((u) => new URL(u).searchParams.get('id').split(',').length), [50, 50, 20]);
  const p = new URL(fetchImpl.urls[0]).searchParams;
  assert.deepEqual([p.get('part'), p.get('maxWidth'), p.get('key')], ['snippet,statistics,contentDetails,player', '360', 'SECRET-KEY-9']);
  assert.equal(items.length, 119);
});

test('client.searchGenre sends the agreed query; failures give null and the log never holds the key, URL or error text', async () => {
  const after = '2026-10-27T13:00:00.000Z';
  const ok = fakeFetch(() => reply({ items: [{ id: { videoId: vid(1) } }, { id: { videoId: 'bad' } }, { id: { videoId: vid(1) } }, { id: { videoId: vid(2) } }] }));
  assert.deepEqual(await clientOf(ok).client.searchGenre(GENRES[0], after), [vid(1), vid(2)]);
  assert.ok(ok.urls[0].startsWith('https://www.googleapis.com/youtube/v3/search?'));
  assert.deepEqual(Object.fromEntries(new URL(ok.urls[0]).searchParams), { part: 'id', type: 'video', order: 'viewCount', videoDuration: 'short',
    regionCode: 'KR', relevanceLanguage: 'ko', maxResults: '50', publishedAfter: after, q: '꿀팁 #shorts', key: 'SECRET-KEY-9' });
  const quota = clientOf(fakeFetch(() => reply({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403)));
  const boom = clientOf(async () => { throw Object.assign(new Error('https://x/?key=SECRET-KEY-9'), { name: 'TimeoutError' }); });
  assert.equal(await quota.client.searchGenre(GENRES[0], after), null);
  assert.equal(await boom.client.searchGenre(GENRES[0], after), null);
  assert.match(quota.logs.join(), /403 · quotaExceeded/);
  assert.doesNotMatch([...quota.logs, ...boom.logs].join('\n'), /SECRET-KEY-9|googleapis|꿀팁/);
});

test('time budget: no request once the run budget is spent; the chart request keeps its old shape', async () => {
  let t = 0;
  const budget = createBudget(100_000, () => t);
  assert.equal(budget.timeoutFor(15_000), 15_000);
  t = 95_000;
  assert.equal(budget.timeoutFor(15_000), 5_000);
  t = 100_000;
  assert.equal(budget.timeoutFor(15_000), 0);
  const spent = fakeFetch(() => reply({ items: [] }));
  const late = clientOf(spent, { budget }).client;
  assert.deepEqual([await late.searchGenre(GENRES[0], 'x'), await late.fetchVideos([vid(1)]), await late.fetchChart('')], [null, [], []]);
  assert.equal(spent.urls.length, 0);
  const chart = fakeFetch(() => reply({ items: [video(vid(1)), video('bad id!')] }));
  assert.equal((await clientOf(chart).client.fetchChart('24')).length, 1);
  const p = new URL(chart.urls[0]).searchParams;
  assert.deepEqual([p.get('chart'), p.get('regionCode'), p.get('maxResults'), p.get('videoCategoryId')], ['mostPopular', 'KR', '50', '24']);
});
