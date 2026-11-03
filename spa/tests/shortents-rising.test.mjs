/**
 * 숏텐츠 급상승 칸 — 앱이 30분마다 올리는 /data/shortents-rising.json 읽기.
 * 모양 검증 · 나쁜 URL 버리기 · 신선도(90분) · 순서 보존.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShortentsRising, loadShortentsRising, freshness, STALE_MINUTES } from '../src/lib/shortentsRising.mjs';

const topic = (over) => ({
  keyword: '경기도 신규택지 공급', category: '경제', summary: '요약', title: '제목', channel: 'KBS',
  articleUrl: 'https://n.news.naver.com/a/1', searchUrl: 'https://m.search.naver.com/search.naver?query=x',
  rank: 2, prevRank: null, rankDelta: null, isNew: true, firstSeenAt: '2026-10-29T01:00:00.000Z',
  windowsSeen: 1, streak: 1, status: 'new', docs: 1234, docsMeasuredAt: '2026-10-29T01:05:00.000Z', ...over,
});
const file = (topics) => ({ schemaVersion: 1, builtAt: '2026-10-29T01:10:00.000Z', source: 'naver-mobile-home-shortents-now',
  latest: { publishTime: '2026-10-29T01:00:00.000Z', periodStart: 'a', periodEnd: 'b' }, windows: 12, topics });

test('정상 파일 — 칸을 그대로 읽는다', () => {
  const r = parseShortentsRising(file([topic()]));
  assert.equal(r.topics.length, 1);
  assert.equal(r.topics[0].keyword, '경기도 신규택지 공급');
  assert.equal(r.topics[0].docs, 1234);
  assert.equal(r.topics[0].status, 'new');
  assert.equal(r.builtAt, '2026-10-29T01:10:00.000Z');
  assert.equal(r.latest.publishTime, '2026-10-29T01:00:00.000Z');
});

test('순서 보존 — 앱이 준 순서를 다시 정렬하지 않는다', () => {
  const r = parseShortentsRising(file([topic({ keyword: 'c', rank: 9 }), topic({ keyword: 'a', rank: 1 }), topic({ keyword: 'b', rank: 5 })]));
  assert.deepEqual(r.topics.map((t) => t.keyword), ['c', 'a', 'b']);
});

test('틀린 칸 — 검색어 없는 토픽은 버리고 숫자·상태는 안전하게', () => {
  const r = parseShortentsRising(file([
    topic({ keyword: '' }), null, 'x', topic({ keyword: 'ok', rank: 'abc', docs: -3, status: 'weird', windowsSeen: NaN }),
  ]));
  assert.equal(r.topics.length, 1);
  const t = r.topics[0];
  assert.equal(t.rank, null);
  assert.equal(t.docs, null);
  assert.equal(t.status, 'new');
  assert.equal(t.windowsSeen, null);
});

test('나쁜 URL — naver.com 계열 https/http 만, 나머지는 링크 없음', () => {
  const r = parseShortentsRising(file([
    topic({ keyword: 'a', articleUrl: 'javascript:alert(1)', searchUrl: 'https://evil.com/?x=naver.com' }),
    topic({ keyword: 'b', articleUrl: 'https://notnaver.com/x', searchUrl: 'https://naver.com.evil.kr/' }),
    topic({ keyword: 'c', articleUrl: 'http://news.naver.com/x', searchUrl: 'https://m.search.naver.com/s' }),
  ]));
  assert.equal(r.topics[0].articleUrl, null);
  assert.equal(r.topics[0].searchUrl, null);
  assert.equal(r.topics[1].articleUrl, null);
  assert.equal(r.topics[1].searchUrl, null);
  assert.equal(r.topics[2].articleUrl, 'http://news.naver.com/x');
  assert.equal(r.topics[2].searchUrl, 'https://m.search.naver.com/s');
});

test('문자열 길이 상한', () => {
  const r = parseShortentsRising(file([topic({ summary: '가'.repeat(2000), keyword: '나'.repeat(500) })]));
  assert.ok(r.topics[0].summary.length <= 300);
  assert.ok(r.topics[0].keyword.length <= 80);
});

test('빈 파일 · 이상한 입력 — 빈 결과', () => {
  for (const raw of [null, undefined, {}, [], 'x', { topics: 'no' }, file([])]) {
    const r = parseShortentsRising(raw);
    assert.deepEqual(r.topics, []);
  }
});

test('신선도 — 분 단위, 90분 넘으면 stale', () => {
  const built = '2026-10-29T01:00:00.000Z';
  const at = (min) => new Date(Date.parse(built) + min * 60000);
  assert.deepEqual(freshness(built, at(10)), { minutes: 10, stale: false });
  assert.equal(freshness(built, at(STALE_MINUTES)).stale, false);
  assert.equal(freshness(built, at(91)).stale, true);
  assert.equal(freshness(built, at(180)).minutes, 180);
  assert.equal(freshness(built, at(-5)).minutes, 0);
  assert.equal(freshness('', at(1)).stale, true);
  assert.equal(freshness(null, at(1)).minutes, null);
});

test('불러오기 — 성공·실패·HTTP 오류', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => file([topic()]) }; };
  const r = await loadShortentsRising(ok);
  assert.equal(r.topics.length, 1);
  assert.equal(calls[0][0], '/data/shortents-rising.json');
  assert.equal(calls[0][1].cache, 'no-cache');
  assert.deepEqual((await loadShortentsRising(async () => ({ ok: false, status: 404 }))).topics, []);
  assert.deepEqual((await loadShortentsRising(async () => { throw new Error('net'); })).topics, []);
  assert.deepEqual((await loadShortentsRising(async () => ({ ok: true, json: async () => { throw new Error('bad'); } }))).topics, []);
});

// 2026-10-29 사장님 "카테고리별로 나눠주고" — 분야별 묶음. 가장 빠른 토픽이 든 분야가 먼저, 분야 안 순서는 원래(빠른 순) 그대로.
test('분야별 묶기 — 첫 등장 순서대로 분야를 세우고, 분야 없음은 기타로 맨 뒤', async () => {
  const { groupByCategory } = await import('../src/lib/shortentsRising.mjs');
  const topics = [
    { keyword: 'a', category: '경제' }, { keyword: 'b', category: '엔터' }, { keyword: 'c', category: '' },
    { keyword: 'd', category: '경제' }, { keyword: 'e', category: '엔터' },
  ];
  assert.deepEqual(groupByCategory(topics).map((g) => [g.category, g.topics.map((t) => t.keyword).join('')]), [['경제', 'ad'], ['엔터', 'be'], ['기타', 'c']]);
  assert.deepEqual(groupByCategory([]), []);
});
