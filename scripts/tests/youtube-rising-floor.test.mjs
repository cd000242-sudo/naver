// [2026-11-10] Per-genre floor of the "떡상 영상 보드": a slow genre (역사 …) must not vanish behind the popular chart.
// Loaded by youtube-rising.test.mjs (the deploy workflow runs that one file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardItems, buildRisingBoard } from '../lib/youtube-rising-core.mjs';
import { BOARD_MAX_ITEMS, GENRE_CAP, GENRE_FLOOR } from '../lib/youtube-rising-genres.mjs';
import './youtube-rising-more.test.mjs';

const NOW = Date.parse('2026-11-10T09:00:00Z');
const TEN_HOURS_AGO = new Date(NOW - 10 * 3_600_000).toISOString();
const id = (prefix, n) => `${prefix}${String(n).padStart(10, '0')}`;
const item = (videoId, viewCount, genre) => ({ videoId, viewCount, publishedAt: TEN_HOURS_AGO, genre, source: genre ? 'search' : 'chart' });
const OPTIONS = { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP, genreFloor: GENRE_FLOOR };

test('genre floor: the fastest 20 of a slow genre stay on a full board, and the board is still fastest first', () => {
  const chart = Array.from({ length: 700 }, (_, n) => item(id('c', n), 1_000_000 - n * 100, ''));
  const history = Array.from({ length: 30 }, (_, n) => item(id('h', n), 3_000 - n * 100, 'history'));
  const built = buildRisingBoard([...chart, ...history], null, NOW, OPTIONS);
  assert.equal(GENRE_FLOOR, 20);
  const all = boardItems(built);
  assert.equal(all.length, BOARD_MAX_ITEMS);
  const kept = all.filter((entry) => entry.genre === 'history');
  assert.deepEqual(kept.map((entry) => entry.videoId), history.slice(0, 20).map((entry) => entry.videoId));
  assert.deepEqual(built.genres, [{ id: 'history', name: '역사', count: 20 }]);
  const speeds = all.map((entry) => entry.viewsPerHour);
  assert.deepEqual(speeds, [...speeds].sort((a, b) => b - a));
});

test('genre floor: a genre with fewer items than the floor keeps all of them; without the option nothing is reserved', () => {
  const chart = Array.from({ length: 700 }, (_, n) => item(id('c', n), 1_000_000 - n * 100, ''));
  const few = Array.from({ length: 5 }, (_, n) => item(id('m', n), 500 - n * 10, 'mystery'));
  const withFloor = buildRisingBoard([...chart, ...few], null, NOW, OPTIONS);
  assert.equal(boardItems(withFloor).filter((entry) => entry.genre === 'mystery').length, 5);
  assert.equal(boardItems(withFloor).length, BOARD_MAX_ITEMS);
  const noFloor = buildRisingBoard([...chart, ...few], null, NOW, { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP });
  assert.equal(boardItems(noFloor).filter((entry) => entry.genre === 'mystery').length, 0);
});
