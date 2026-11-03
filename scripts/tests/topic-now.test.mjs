import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDailyTrends } from '../lib/naver-datalab.mjs';
import { DATALAB_DAILY_CAP, PER_TOPIC, TOPIC_NAMES, buildBoard, fillDays, hasMeasurements, isDue, kstDateKey, pickCandidates, trendWindow, usedToday } from '../lib/topic-now-core.mjs';

const NOW = Date.parse('2026-11-03T01:00:00Z'); // KST 2026-11-03 10:00
const DAY = 86_400_000;
const iso = days => new Date(NOW - days * DAY).toISOString();

test('32 topics and the Korea-time trend window (14 complete days ending yesterday)', () => {
  assert.equal(TOPIC_NAMES.length, 32);
  assert.equal(kstDateKey(Date.parse('2026-11-02T16:00:00Z')), '2026-11-03', 'after 15:00 UTC it is already the next day in Korea');
  assert.deepEqual(trendWindow(NOW), { startDate: '2026-10-20', endDate: '2026-11-02' });
});

test('runs at most once an hour and counts DataLab calls per Korean day', () => {
  assert.equal(isDue(null, NOW), true);
  assert.equal(isDue({ builtAt: iso(20 / 1440) }, NOW), false, 'built 20 minutes ago');
  assert.equal(isDue({ builtAt: iso(56 / 1440) }, NOW), true);
  assert.equal(usedToday({ usage: { date: '2026-11-03', datalabCalls: 64 } }, NOW), 64);
  assert.equal(usedToday({ usage: { date: '2026-11-02', datalabCalls: 800 } }, NOW), 0, 'a new Korean day starts from zero');
  assert.ok(DATALAB_DAILY_CAP < 1000);
});

test('candidates: fresh preemption seats first, then NOW briefs with few head-on titles, then picks by volume/docs; 5 per topic; no duplicates', () => {
  const preemption = { rows: [
    { keyword: '소카 렌터카 요금', topic: '자동차', tier: 'top3', measuredAt: iso(3), searchVolume: 1950, documentCount: 357 },
    { keyword: '카니발 풀체인지', topic: '자동차', tier: 'page1-weak', measuredAt: iso(5) },
    { keyword: '오래된 빈자리', topic: '자동차', tier: 'top3', measuredAt: iso(40) },
    { keyword: '경합 말', topic: '자동차', tier: 'contested', measuredAt: iso(1) },
  ] };
  const briefs = { briefs: [
    { coreKeyword: '신차 개발 기간', field: '자동차', timing: 'NOW', serpFacing: 1 },
    { coreKeyword: '포화 글감', field: '자동차', timing: 'NOW', serpFacing: 9 },
    { coreKeyword: '다음 주 글감', field: '자동차', timing: 'NEXT', serpFacing: 0 },
  ] };
  const picks = { topics: [{ topic: '자동차', rows: [
    { keyword: '큰말', searchVolume: 90000, documentCount: 900000 }, { keyword: '황금말', searchVolume: 5000, documentCount: 100 },
    { keyword: '소카렌터카 요금', searchVolume: 1, documentCount: 1 }, { keyword: '셋째', searchVolume: 300, documentCount: 100 },
  ] }, { topic: '없는 주제', rows: [{ keyword: 'x' }] }] };
  const input = { picks, preemption, briefs };
  const before = JSON.stringify(input);
  const car = pickCandidates(input, { now: NOW }).filter(row => row.topic === '자동차');
  assert.deepEqual(car.map(row => `${row.source}:${row.keyword}`), ['preemption:소카 렌터카 요금', 'preemption:카니발 풀체인지', 'brief:신차 개발 기간', 'picks:황금말', 'picks:셋째']);
  assert.equal(car.length, PER_TOPIC);
  assert.equal(JSON.stringify(input), before, 'inputs are not modified');
  assert.deepEqual(pickCandidates({}, { now: NOW }), []);
});

test('fillDays keeps one value per day and leaves days DataLab did not return as null (never 0)', () => {
  const window = { startDate: '2026-10-30', endDate: '2026-11-02' };
  assert.deepEqual(fillDays([{ period: '2026-10-30', ratio: 10 }, { period: '2026-11-01', ratio: 30 }, { period: '2026-11-02', ratio: 50 }], window), [10, null, 30, 50]);
  assert.deepEqual(fillDays([], window), [], 'nothing returned → no series at all');
});

test('DataLab: 5 groups per call, stops at the cap, keeps going after a failed call, no call without keys', async () => {
  const env = { NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret' };
  const sent = [];
  let call = 0;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body.keywordGroups.map(g => g.groupName));
    call += 1;
    if (call === 2) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ results: body.keywordGroups.map((g, i) => ({ title: g.groupName, data: [{ period: '2026-11-01', ratio: 10 + i }, { period: '2026-11-02', ratio: 20 + i }] })) }) };
  };
  const keywords = Array.from({ length: 12 }, (_, i) => `키워드 ${i}`);
  const out = await fetchDailyTrends(keywords, { startDate: '2026-11-01', endDate: '2026-11-02', env, fetchImpl, gapMs: 0 });
  assert.deepEqual(sent.map(group => group.length), [5, 5, 2]);
  assert.equal(out.calls, 3); assert.equal(out.error, 'HTTP 429');
  assert.deepEqual(out.trends.get('키워드0'), [10, 20]);
  assert.equal(out.trends.has('키워드5'), false, 'the failed call measured nothing');
  assert.deepEqual(out.trends.get('키워드10'), [10, 20]);
  const capped = await fetchDailyTrends(keywords, { startDate: '2026-11-01', endDate: '2026-11-02', env, fetchImpl: async (u, init) => ({ ok: true, json: async () => ({ results: [] }) }), gapMs: 0, maxCalls: 1 });
  assert.equal(capped.calls, 1); assert.equal(capped.error, 'quota-cap');
  const noKeys = await fetchDailyTrends(keywords, { startDate: '2026-11-01', endDate: '2026-11-02', env: {}, fetchImpl: async () => { throw new Error('must not call'); } });
  assert.deepEqual([noKeys.calls, noKeys.error], [0, 'no-keys']);
});

test('board: only measured values (null when Naver gave nothing), and an all-empty run is not published', () => {
  const window = { startDate: '2026-10-20', endDate: '2026-11-02' };
  const candidates = [{ keyword: '소카 렌터카 요금', topic: '자동차', source: 'preemption', tier: 'top3' }, { keyword: '못 잰 말', topic: '자동차', source: 'picks' }];
  const board = buildBoard({
    now: NOW, candidates, window, usage: { date: '2026-11-03', datalabCalls: 33 }, status: { datalab: 'ok' },
    measurements: { volumes: new Map([['소카렌터카요금', 1950]]), docs: new Map([['소카렌터카요금', 357]]), trends: new Map([['소카렌터카요금', [1, 2, 3]]]) },
  });
  assert.deepEqual(board.rows[0], { keyword: '소카 렌터카 요금', topic: '자동차', source: 'preemption', tier: 'top3', searchVolume: 1950, documentCount: 357, daily: { end: '2026-11-02', points: [1, 2, 3] }, measuredAt: '2026-11-03T01:00:00.000Z' });
  assert.deepEqual([board.rows[1].searchVolume, board.rows[1].documentCount, board.rows[1].daily], [null, null, null]);
  assert.equal(board.builtAt, '2026-11-03T01:00:00.000Z');
  assert.equal(hasMeasurements(board), true);
  assert.equal(hasMeasurements(buildBoard({ now: NOW, candidates, window, usage: {}, status: {}, measurements: {} })), false);
});
