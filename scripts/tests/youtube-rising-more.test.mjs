// [2026-11-10] "떡상 영상 보드" head/tail split: `items` keeps the fastest 200 (the already installed extension reads exactly that
// many and reports the rest as "dropped"), everything after them goes into the new `more` array (up to 600 in total).
// Loaded by youtube-rising-floor.test.mjs -> youtube-rising.test.mjs (the deploy workflow runs that one file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/youtube-rising-core.mjs';
import { BOARD_MAX_ITEMS, GENRE_CAP, GENRE_FLOOR } from '../lib/youtube-rising-genres.mjs';
import { carriedEntries, gatherSearchItems } from '../lib/youtube-rising-search.mjs';

const { buildRisingBoard, readPreviousBoard } = core;
const NOW = Date.parse('2026-11-10T09:00:00Z');
const MIN = 60_000;
const TEN_HOURS_AGO = new Date(NOW - 10 * 60 * MIN).toISOString();
const id = (prefix, n) => `${prefix}${String(n).padStart(10, '0')}`;
const item = (videoId, viewCount, genre) => ({ videoId, viewCount, publishedAt: TEN_HOURS_AGO, genre, source: genre ? 'search' : 'chart' });
const OPTIONS = { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP, genreFloor: GENRE_FLOOR };
const chartOf = (count) => Array.from({ length: count }, (_, n) => item(id('c', n), 1_000_000 - n * 100, ''));
const ago = (minutes) => new Date(NOW - minutes * MIN).toISOString();
const found = (videoId, genre) => ({ videoId, genre, source: 'search', viewCount: 100 });
const previousOf = (extra = {}) => ({ schemaVersion: 1, builtAt: ago(60), items: [], ...extra });

test('head/tail split: 600 items -> items = fastest 200, more = the other 400, one continuous fastest-first order', () => {
  const chart = chartOf(700);
  const built = buildRisingBoard(chart, null, NOW, OPTIONS);
  assert.equal(built.items.length, 200);
  assert.equal(built.more.length, 400);
  const order = [...built.items, ...built.more].map((entry) => entry.videoId);
  assert.deepEqual(order, chart.slice(0, 600).map((entry) => entry.videoId));
  assert.equal(new Set(order).size, 600, 'no video is in both arrays');
  assert.equal(built.schemaVersion, 1);
});

test('head/tail split: 200 or fewer items give an empty more; no options keeps the old 200-item board', () => {
  const small = buildRisingBoard(chartOf(150), null, NOW, OPTIONS);
  assert.deepEqual([small.items.length, small.more], [150, []]);
  const chartOnly = buildRisingBoard(chartOf(300), null, NOW);
  assert.deepEqual([chartOnly.items.length, chartOnly.more], [200, []]);
  assert.deepEqual(chartOnly.items.map((entry) => entry.videoId), chartOf(300).slice(0, 200).map((entry) => entry.videoId));
});

test('head/tail split: genre floor and genres count the whole board, not only the head 200', () => {
  const tips = [
    ...Array.from({ length: 10 }, (_, n) => item(id('t', n), 2_000_000 - n, 'tips')),
    ...Array.from({ length: 15 }, (_, n) => item(id('s', n), 2_000 - n * 10, 'tips')),
  ];
  const history = Array.from({ length: 30 }, (_, n) => item(id('h', n), 3_000 - n * 100, 'history'));
  const built = buildRisingBoard([...chartOf(700), ...tips, ...history], null, NOW, OPTIONS);
  const all = [...built.items, ...built.more];
  assert.equal(all.length, BOARD_MAX_ITEMS);
  const countIn = (list, genre) => list.filter((entry) => entry.genre === genre).length;
  assert.deepEqual([countIn(built.items, 'tips'), countIn(built.more, 'tips')], [10, 10], 'the genre spans both arrays');
  assert.deepEqual([countIn(built.items, 'history'), countIn(built.more, 'history')], [0, 20], 'a slow genre keeps its 20 in more');
  assert.deepEqual(built.genres, [{ id: 'tips', name: '꿀팁', count: 20 }, { id: 'history', name: '역사', count: 20 }]);
  const speeds = all.map((entry) => entry.viewsPerHour);
  assert.deepEqual(speeds, [...speeds].sort((a, b) => b - a));
});

test('previous board: a video that sat in `more` still gets a measured (delta) speed', () => {
  const previous = previousOf({ items: [{ videoId: id('a', 1), viewCount: 4_000 }], more: [{ videoId: id('b', 1), viewCount: 1_000 }] });
  const built = buildRisingBoard([item(id('a', 1), 5_000, ''), item(id('b', 1), 1_500, ''), item(id('n', 1), 800, '')], previous, NOW);
  const byId = Object.fromEntries(built.items.map((entry) => [entry.videoId, entry]));
  assert.deepEqual([byId[id('a', 1)].velocity, byId[id('a', 1)].viewsPerHour], ['delta', 1_000]);
  assert.deepEqual([byId[id('b', 1)].velocity, byId[id('b', 1)].viewsPerHour], ['delta', 500], 'gained 500 over one hour');
  assert.equal(byId[id('n', 1)].velocity, 'average', 'a video seen nowhere falls back to the upload average');
  assert.equal(built.windowMin, 60);
});

test('previous board: carried search entries and numbers come from items and more together', async () => {
  const previous = previousOf({ searchedAt: ago(120), items: [found(id('p', 1), 'tips')], more: [found(id('p', 2), 'funny'), { videoId: id('p', 3) }, found('bad', 'tips')] });
  assert.deepEqual(carriedEntries(previous), [{ videoId: id('p', 1), genre: 'tips' }, { videoId: id('p', 2), genre: 'funny' }]);
  const asked = [];
  const client = { fetchVideos: async (ids) => { asked.push(ids); return ids.map((videoId) => ({ videoId, viewCount: 1 })); }, searchGenre: async () => null };
  const reused = await gatherSearchItems(client, previous, NOW);
  assert.deepEqual(asked, [[id('p', 1), id('p', 2)]]);
  assert.deepEqual(reused.items.map((entry) => [entry.videoId, entry.genre]), [[id('p', 1), 'tips'], [id('p', 2), 'funny']]);
  const failedRound = await gatherSearchItems(client, { ...previous, searchedAt: ago(400) }, NOW);
  assert.deepEqual(failedRound.items.map((entry) => entry.videoId), [id('p', 1), id('p', 2)], 'every search failed -> ids in more are carried on');
  assert.equal(failedRound.searched, false);
});

test('previous board: an old-format board (no `more`) or a broken `more` is read as items only', () => {
  const items = [found(id('p', 1), 'tips')];
  for (const more of [undefined, null, 'text', 42, { 0: found(id('p', 2), 'funny') }]) {
    const previous = previousOf({ items, ...(more === undefined ? {} : { more }) });
    assert.deepEqual(core.boardItems(previous), items);
    assert.deepEqual(carriedEntries(previous), [{ videoId: id('p', 1), genre: 'tips' }]);
    assert.equal(readPreviousBoard(previous, NOW), previous, 'still a usable previous board');
    assert.equal(buildRisingBoard([item(id('p', 1), 6_000, 'tips')], { ...previous, items: [{ videoId: id('p', 1), viewCount: 1_000 }] }, NOW).items[0].velocity, 'delta');
  }
  assert.deepEqual([core.boardItems(null), core.boardItems({}), core.boardItems({ items: 'x' })], [[], [], []]);
  assert.equal(readPreviousBoard(previousOf({ items, more: [found(id('p', 2), 'funny')] }), NOW).more.length, 1);
});

test('splitBoard: re-cuts any board into head 200 + more, keeps the order and the other fields, never mutates', () => {
  const entries = chartOf(600).map((entry, n) => ({ ...entry, viewsPerHour: 600 - n }));
  const oneArray = { schemaVersion: 1, builtAt: ago(5), genres: [], items: entries };
  const split = core.splitBoard(oneArray);
  assert.deepEqual([split.items.length, split.more.length], [200, 400]);
  assert.deepEqual([...split.items, ...split.more], entries);
  assert.deepEqual([split.schemaVersion, split.builtAt, split.genres], [1, oneArray.builtAt, []]);
  assert.equal(oneArray.items.length, 600, 'input is untouched');
  assert.equal('more' in oneArray, false);
  const again = core.splitBoard(split);
  assert.deepEqual([again.items, again.more], [split.items, split.more]);
  assert.deepEqual(core.splitBoard({ ...oneArray, items: entries.slice(0, 10), more: 'x' }).more, []);
});
