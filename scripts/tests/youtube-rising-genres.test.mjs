// [2026-11-27] Genre table of the "떡상 영상 보드": rows say how they search (q, categoryId, duration), a changed table
// searches at once (genresKey), and the quota note matches the table. Fake fetch / fake client only — no real API call.
// Loaded by youtube-rising-more.test.mjs -> floor -> youtube-rising.test.mjs (the deploy workflow runs that one file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_REBUILD_MS, boardItems, buildRisingBoard } from '../lib/youtube-rising-core.mjs';
import { BOARD_MAX_ITEMS, GENRES, GENRES_KEY, GENRE_CAP, GENRE_FLOOR, SEARCH_REFRESH_MS, genresKeyOf, normalizeGenres } from '../lib/youtube-rising-genres.mjs';
import { boardOptionsOf, carriedEntries, gatherSearchItems, planSearch } from '../lib/youtube-rising-search.mjs';
import { RUN_BUDGET_MS, createBudget, createYoutubeClient } from '../lib/youtube-rising-fetch.mjs';

const NOW = Date.parse('2026-11-27T09:00:00Z');
const MIN = 60_000;
const AFTER = '2026-11-20T09:00:00.000Z';
const ago = (minutes) => new Date(NOW - minutes * MIN).toISOString();
const vid = (n) => `v${String(n).padStart(10, '0')}`;
const found = (n, genre) => ({ videoId: vid(n), genre, source: 'search', viewCount: 100 });
const board = (extra = {}) => ({ schemaVersion: 1, builtAt: ago(30), items: [], ...extra });
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** A source file with its comment line breaks (` * `) folded into spaces, so a sentence is found even when it wraps. */
const flat = (path) => read(path).replace(/\s*\r?\n\s*\*?\s*/g, ' ');

const EXPECTED = [
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
  { id: 'house', name: '집·건축', q: '집 인테리어 #shorts', duration: 'short' },
];

test('genre table: 15 rows, exact ids / names / search fields in this order, unique ids, frozen', () => {
  assert.equal(GENRES.length, 15);
  assert.deepEqual(GENRES, EXPECTED);
  assert.equal(new Set(GENRES.map((g) => g.id)).size, GENRES.length);
  assert.ok(GENRES.every((g) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id) && /[가-힣]/.test(g.name)));
  assert.ok(Object.isFrozen(GENRES) && GENRES.every((g) => Object.isFrozen(g)));
  assert.ok(!GENRES.some((g) => g.categoryId === '17' || /축구|야구/.test(g.q || '')), 'no sports row (owner decision 2026-11-27)');
  assert.deepEqual(GENRES.at(-1), { id: 'house', name: '집·건축', q: '집 인테리어 #shorts', duration: 'short' }, 'house stays as it was, and last');
});

test('table validation: a broken row throws a clear error naming the row; a good row gets duration "short" by default', () => {
  const good = { id: 'ok-1', name: '이름', q: '검색' };
  assert.deepEqual(normalizeGenres([good]), [{ ...good, duration: 'short' }]);
  assert.deepEqual(good, { id: 'ok-1', name: '이름', q: '검색' }, 'the input row is not mutated');
  assert.deepEqual(normalizeGenres([{ id: 'c', name: '분류', categoryId: '24' }]), [{ id: 'c', name: '분류', categoryId: '24', duration: 'short' }]);
  const bad = (row, pattern) => assert.throws(() => normalizeGenres([good, row]), pattern);
  bad({ id: 'a', name: '이름' }, /row 1 \("a"\).*needs q or categoryId/);
  bad({ id: 'a', name: '이름', q: '   ' }, /row 1 \("a"\).*q must be a non-empty string/);
  bad({ id: 'a', name: '이름', q: 5 }, /q must be a non-empty string/);
  bad({ id: 'a', name: '이름', categoryId: 'abc' }, /categoryId must be digits/);
  bad({ id: 'a', name: '이름', categoryId: 24 }, /categoryId must be digits/);
  bad({ id: 'a', name: '이름', q: '검색', duration: 'any' }, /duration must be one of short, medium, long/);
  bad({ id: 'a', name: '이름', q: '검색', duration: 'Long' }, /duration must be one of/);
  bad({ id: 'ok-1', name: '이름', q: '다른 검색' }, /row 1 \("ok-1"\).*duplicate id/);
  for (const id of ['', 'Ent', 'ent_issue', 'a b', '-a', 'a-', 'a--b', 7, undefined]) bad({ id, name: '이름', q: '검색' }, /id must be lowercase letters, digits and hyphens/);
  bad({ id: 'a', name: '', q: '검색' }, /name must be a non-empty string/);
  bad({ id: 'a', q: '검색' }, /name must be a non-empty string/);
  bad({ id: 'a', name: '이름', q: '검색', durations: 'long' }, /unknown field "durations"/);
  bad(null, /row 1 .*must be an object/);
  bad('ent', /must be an object/);
  for (const table of [[], null, undefined, 'x']) assert.throws(() => normalizeGenres(table), /non-empty array/);
});

/** The search request a genre row builds, as the query parameters YouTube would see (fake fetch). */
async function searchParamsOf(genre) {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { status: 200, ok: true, json: async () => ({ items: [] }) }; };
  const client = createYoutubeClient({ key: 'K', fetchImpl, budget: createBudget(60_000) });
  assert.deepEqual(await client.searchGenre(genre, AFTER), []);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith('https://www.googleapis.com/youtube/v3/search?'));
  return Object.fromEntries(new URL(urls[0]).searchParams);
}
const BASE = { part: 'id', type: 'video', order: 'viewCount', regionCode: 'KR', relevanceLanguage: 'ko', maxResults: '50', publishedAfter: AFTER, key: 'K' };
const byId = (id) => GENRES.find((g) => g.id === id);

test('genre table: movie and comedy search by Korean text, not by category number; the two long rows follow their parents', () => {
  for (const genre of [byId('movie'), byId('comedy')]) assert.ok(!('categoryId' in genre) && /[가-힣]/.test(genre.q), `${genre.id}: Korean q, no categoryId`);
  const ids = GENRES.map((g) => g.id);
  assert.equal(ids.indexOf('drama-long'), ids.indexOf('drama') + 1);
  assert.equal(ids.indexOf('movie-long'), ids.indexOf('movie') + 1);
  assert.deepEqual([byId('drama-long').duration, byId('movie-long').duration], ['long', 'long']);
  assert.deepEqual(GENRES.filter((g) => g.q === undefined).map((g) => g.id), ['ent', 'ent-long'], 'only the 연예·예능 rows still search by category number alone');
});

test('search request: a q row sends q and its duration, and no category', async () => {
  assert.deepEqual(await searchParamsOf(byId('ent-issue')), { ...BASE, videoDuration: 'medium', q: '연예 이슈' });
  assert.deepEqual(await searchParamsOf(byId('movie')), { ...BASE, videoDuration: 'medium', q: '영화 리뷰' });
  assert.deepEqual(await searchParamsOf(byId('comedy')), { ...BASE, videoDuration: 'medium', q: '개그 코미디' });
  assert.deepEqual(await searchParamsOf(byId('drama-long')), { ...BASE, videoDuration: 'long', q: '드라마 몰아보기' });
  assert.deepEqual(await searchParamsOf(byId('movie-long')), { ...BASE, videoDuration: 'long', q: '영화 결말포함' });
});

test('search request: a categoryId row sends videoCategoryId and its duration, and no q', async () => {
  assert.deepEqual(await searchParamsOf(byId('ent')), { ...BASE, videoDuration: 'medium', videoCategoryId: '24' });
  assert.deepEqual(await searchParamsOf(byId('ent-long')), { ...BASE, videoDuration: 'long', videoCategoryId: '24' });
});

test('search request: a row with both q and categoryId sends both', async () => {
  const [both] = normalizeGenres([{ id: 'both', name: '둘 다', q: '연예 이슈', categoryId: '24', duration: 'long' }]);
  assert.deepEqual(await searchParamsOf(both), { ...BASE, videoDuration: 'long', videoCategoryId: '24', q: '연예 이슈' });
});

test('search request: house is exactly what it was (short, #shorts query); a row without duration still means short', async () => {
  assert.deepEqual(await searchParamsOf(byId('house')), { ...BASE, videoDuration: 'short', q: '집 인테리어 #shorts' });
  assert.deepEqual(await searchParamsOf({ id: 'old', name: '옛 행', q: '꿀팁 #shorts' }), { ...BASE, videoDuration: 'short', q: '꿀팁 #shorts' });
});

test('search request: every table row sends its own duration, and q / category only when it has them', async () => {
  for (const genre of GENRES) {
    const expected = { ...BASE, videoDuration: genre.duration, ...(genre.q ? { q: genre.q } : {}), ...(genre.categoryId ? { videoCategoryId: genre.categoryId } : {}) };
    assert.deepEqual(await searchParamsOf(genre), expected, genre.id);
  }
});

test('genresKey: short, stable, follows ids + q + categoryId + duration (and their order), not the shown name', () => {
  assert.match(GENRES_KEY, /^[0-9a-f]{12}$/);
  assert.equal(genresKeyOf(GENRES), GENRES_KEY);
  assert.equal(genresKeyOf(EXPECTED.map((row) => ({ ...row }))), GENRES_KEY, 'a copy of the table gives the same key');
  assert.equal(genresKeyOf([{ id: 'a', name: '가', q: 'b', duration: 'short' }]), 'd4ed044163b4', 'pinned: the recipe must not drift');
  assert.equal(genresKeyOf([{ id: 'a', name: '다른 이름', q: 'b' }]), 'd4ed044163b4', 'name is not part of it; a missing duration reads as short');
  assert.notEqual(GENRES_KEY, '3b009c2ed2b3', 'the table changed (2026-11-28), so the key moved off the 13-row table\'s key');
  const patched = (index, patch) => GENRES.map((genre, n) => (n === index ? { ...genre, ...patch } : genre));
  const changed = [
    patched(0, { id: 'ent-issue-2' }), patched(0, { q: '연예 뉴스' }), patched(1, { categoryId: '25' }), patched(1, { q: '예능' }),
    patched(0, { duration: 'long' }), patched(GENRES.length - 1, { duration: 'medium' }), GENRES.slice(1), [...GENRES, { id: 'extra', name: '추가', q: '추가' }],
    [GENRES[1], GENRES[0], ...GENRES.slice(2)],
  ];
  for (const table of changed) assert.notEqual(genresKeyOf(table), GENRES_KEY);
  assert.equal(new Set(changed.map((table) => genresKeyOf(table))).size, changed.length, 'each change gives its own key');
  assert.equal(genresKeyOf(patched(0, { name: '완전히 다른 이름' })), GENRES_KEY);
});

test('genresKey is written into the board header (null when not given)', () => {
  assert.equal(buildRisingBoard([], null, NOW, { genresKey: GENRES_KEY }).genresKey, GENRES_KEY);
  assert.equal(buildRisingBoard([], null, NOW).genresKey, null);
  assert.equal(buildRisingBoard([], null, NOW, { genresKey: 42 }).genresKey, null, 'only a string is written');
  assert.match(read('../youtube-rising.mjs'), /buildRisingBoard\(items, previous, now, boardOptionsOf\(search, previous\)\)/, 'the entry script passes the key through boardOptionsOf');
});

test('search plan: the previous board must carry today\'s genresKey to be reused; different or missing key searches at once', () => {
  const young = (extra) => board({ searchedAt: ago(10), ...extra });
  assert.deepEqual(planSearch(young({ genresKey: GENRES_KEY }), NOW), { action: 'reuse' });
  assert.deepEqual(planSearch(young({ genresKey: 'oldoldoldold' }), NOW), { action: 'search' });
  assert.deepEqual(planSearch(young(), NOW), { action: 'search' }, 'no key (a board from before this change)');
  assert.deepEqual(planSearch(young({ genresKey: null }), NOW), { action: 'search' });
  assert.deepEqual(planSearch(board({ searchedAt: ago(400), genresKey: GENRES_KEY }), NOW), { action: 'search' }, 'same key but older than 6 hours');
  assert.deepEqual(planSearch(board({ searchedAt: ago(-60), genresKey: GENRES_KEY }), NOW), { action: 'search' }, 'a future time is not trusted');
  assert.deepEqual(planSearch(null, NOW), { action: 'search' });
});

function fakeClient({ search = {} } = {}) {
  const calls = { search: [], videos: [] };
  return {
    calls,
    searchGenre: async (genre) => { calls.search.push(genre.id); return search[genre.id] ?? null; },
    fetchVideos: async (ids) => { calls.videos.push(ids); return ids.map((videoId) => ({ videoId, viewCount: 1 })); },
  };
}

test('a changed table searches every genre at once even when the last search was 10 minutes ago', async () => {
  const items = [found(1, 'ent-issue'), found(2, 'house')];
  const oldKey = board({ searchedAt: ago(10), genresKey: 'oldoldoldold', items });
  const noKey = board({ searchedAt: ago(10), items });
  for (const previous of [oldKey, noKey]) {
    const client = fakeClient({ search: { drama: [vid(7)] } });
    const out = await gatherSearchItems(client, previous, NOW);
    assert.deepEqual(client.calls.search, GENRES.map((g) => g.id));
    assert.deepEqual([out.searched, out.searchedAt], [true, new Date(NOW).toISOString()]);
    assert.equal(boardOptionsOf(out, previous).genresKey, GENRES_KEY, 'a good round settles the key');
  }
  const same = fakeClient();
  await gatherSearchItems(same, board({ searchedAt: ago(10), genresKey: GENRES_KEY, items }), NOW);
  assert.equal(same.calls.search.length, 0, 'same table, young search: no search call');
});

test('a failed round does not settle the key: the next deploy searches again; a good round does', async () => {
  const previous = board({ searchedAt: ago(10), genresKey: 'oldoldoldold', items: [found(2, 'house')] });
  const failed = await gatherSearchItems(fakeClient(), previous, NOW);
  assert.equal(failed.searched, false);
  const options = boardOptionsOf(failed, previous);
  assert.equal(options.genresKey, 'oldoldoldold');
  assert.deepEqual(planSearch(buildRisingBoard([], previous, NOW, options), NOW), { action: 'search' });
  assert.equal(boardOptionsOf(failed, board()).genresKey, null);
  assert.equal(boardOptionsOf(failed, null).genresKey, null);
  const good = await gatherSearchItems(fakeClient({ search: { issue: [vid(3)] } }), previous, NOW);
  const settled = buildRisingBoard([], previous, NOW, boardOptionsOf(good, previous));
  assert.deepEqual([settled.genresKey, settled.searchedAt], [GENRES_KEY, new Date(NOW).toISOString()]);
  assert.deepEqual(planSearch(settled, NOW + 5 * MIN), { action: 'reuse' });
  assert.deepEqual(boardOptionsOf(good, previous), { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP, genreFloor: GENRE_FLOOR, searchedAt: good.searchedAt, genresKey: GENRES_KEY });
});

test('entries of genres that are no longer in the table are not carried over, not even to ask for fresh numbers', async () => {
  const removed = ['tips', 'animal', 'shopping', 'travel', 'knowledge', 'mystery', 'history', 'ghost'];
  const items = [...removed.map((genre, n) => found(10 + n, genre)), found(1, 'house'), found(2, 'ent-issue'), found(3, 'drama')];
  assert.deepEqual(carriedEntries(board({ items })), [
    { videoId: vid(1), genre: 'house' }, { videoId: vid(2), genre: 'ent-issue' }, { videoId: vid(3), genre: 'drama' },
  ]);
  const client = fakeClient();
  const out = await gatherSearchItems(client, board({ searchedAt: ago(400), genresKey: 'oldoldoldold', items }), NOW);
  assert.deepEqual(client.calls.videos, [[vid(1), vid(2), vid(3)]], 'every search failed: only genres of today\'s table keep their ids');
  assert.deepEqual(out.items.map((item) => item.genre), ['house', 'ent-issue', 'drama']);
});

test('board room: every genre search result (15 x 50 = 750) fits in the 1000 slots, and a big popular chart cannot push any of it out', () => {
  assert.equal(GENRE_FLOOR, GENRE_CAP, 'the floor is the cap: what a genre search found stays');
  assert.ok(GENRES.length * GENRE_CAP <= BOARD_MAX_ITEMS, `${GENRES.length} x ${GENRE_CAP} <= ${BOARD_MAX_ITEMS}`);
  const raw = GENRES.flatMap((genre, g) => Array.from({ length: GENRE_CAP }, (_, n) => ({
    videoId: `g${String(g).padStart(2, '0')}${String(n).padStart(8, '0')}`, genre: genre.id, source: 'search', viewCount: 1000 + n, publishedAt: ago(600),
  })));
  const options = { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP, genreFloor: GENRE_FLOOR };
  const alone = boardItems(buildRisingBoard(raw, null, NOW, options));
  assert.equal(alone.length, GENRES.length * GENRE_CAP, 'not one of the 750 search items is cut');
  const chart = Array.from({ length: 600 }, (_, n) => ({ videoId: `c${String(n).padStart(10, '0')}`, genre: '', source: 'chart', viewCount: 5_000_000 - n * 100, publishedAt: ago(600) }));
  const built = boardItems(buildRisingBoard([...chart, ...raw], null, NOW, options));
  assert.equal(built.length, BOARD_MAX_ITEMS, 'faster chart videos fill only the 250 slots the genres do not need');
  for (const genre of GENRES) assert.equal(built.filter((item) => item.genre === genre.id).length, GENRE_CAP, genre.id);
  assert.equal(built.filter((item) => item.source === 'chart').length, BOARD_MAX_ITEMS - GENRES.length * GENRE_CAP);
});

/** The quota arithmetic of today's table, worked out from the code (not typed in): the notes in the sources must say the same. */
function quotaFacts() {
  const round = GENRES.length * 100;
  const roundsPerDay = Math.floor(24 * 60 * MIN / SEARCH_REFRESH_MS);
  const chartCalls = read('../youtube-rising.mjs').match(/const CATEGORIES = \[([^\]]*)\]/)[1].split(',').length;
  const idCalls = Math.ceil((GENRES.length * 50) / 50);
  const rebuild = chartCalls + idCalls;
  const listing = Math.floor(24 * 60 * MIN / MIN_REBUILD_MS) * rebuild;
  const worstDay = round * roundsPerDay + listing;
  return { round, roundsPerDay, chartCalls, idCalls, rebuild, listing, worstDay, changeDay: worstDay + round, requests: chartCalls + GENRES.length + idCalls + 1 };
}

test('quota note: every number in it follows from the table (round = rows x 100)', () => {
  const note = flat('../lib/youtube-rising-genres.mjs');
  const fmt = (n) => n.toLocaleString('en-US');
  const { round, roundsPerDay, chartCalls, idCalls, rebuild, listing, worstDay, changeDay } = quotaFacts();
  assert.deepEqual([round, roundsPerDay, chartCalls, idCalls, rebuild, listing, worstDay, changeDay], [1500, 4, 14, 15, 29, 1653, 7653, 9153]);
  for (const text of [`${GENRES.length} genres`, fmt(round), fmt(round * roundsPerDay), `${chartCalls} chart calls`, `${idCalls} search-id calls`, `${rebuild} units`, fmt(listing), fmt(worstDay), fmt(changeDay), `about ${fmt(10_000 - changeDay)} units`]) {
    assert.ok(note.includes(text), `the quota note says "${text}"`);
  }
  assert.ok(changeDay < 10_000, 'even the day of the change stays under the 10,000 shared units');
  assert.doesNotMatch(note, /1,100|4,400|5,800|25 units|11 search-id|11 genres/, 'no number of the old 11-row table is left');
  assert.doesNotMatch(note, /1,300|5,200|6,739|8,039|1,539|27 units|13 search-id|13 genres|1,960|5,300/, 'no number of the old 13-row table is left');
});

test('time note: youtube-rising-fetch.mjs counts the same requests as the table does', () => {
  const { chartCalls, idCalls, requests } = quotaFacts();
  assert.ok(flat('../lib/youtube-rising-fetch.mjs').includes(`${chartCalls} chart + ${GENRES.length} search + up to ${idCalls + 1} videos.list calls (~${requests} x 0.3-0.5 s`), 'the time note counts the same requests');
  assert.ok(requests * 500 <= RUN_BUDGET_MS / 4, `${requests} requests at 0.5 s stay well inside the ${RUN_BUDGET_MS / 1000} s budget`);
});
