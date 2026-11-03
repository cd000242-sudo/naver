// [2026-11-03] LDB "떡상 영상 보드" — the YouTube popular chart with a measured views-per-hour.
// Built at Pages deploy time (never committed: YouTube API data may not be kept over 30 days, and this repo is public).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SCHEMA_VERSION, CARRY_FORWARD_MAX_MS, MIN_REBUILD_MS, buildRisingBoard, classifyForm, normalizeVideo,
  parseIsoDuration, planRebuild, readPreviousBoard,
} from '../lib/youtube-rising-core.mjs';

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
