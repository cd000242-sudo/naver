import test from 'node:test';
import assert from 'node:assert/strict';
import { adsenseCompetition, rankAdsenseCards } from '../src/lib/adsenseBenchmarkModel.mjs';

const NOW = Date.parse('2026-10-15T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const measuredAt = new Date(NOW - DAY).toISOString();
const card = (id, metrics = {}, extra = {}) => ({
  id, keyword: id, recommended: false, priority: 0,
  sources: [{ id: 'blog-a' }],
  metrics: { query: id, searchVolume: 1000, documentCount: 500, bid: 100, measuredAt, ...metrics },
  ...extra,
});
const ids = (cards) => cards.map((c) => c.id);

test('112배 국세환급금은 고수 3곳·높은 입찰가에도 저경쟁 실측 후보 뒤에 온다', () => {
  const refund = card('국세환급금', { searchVolume: 2350, documentCount: 263606, bid: 1460 }, {
    recommended: true, priority: 999, sources: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  });
  const niche = card('구체적인 신청 조건', { searchVolume: 100, documentCount: 90, bid: null });
  assert.equal(adsenseCompetition(refund, NOW).tier, 3);
  assert.equal(adsenseCompetition(refund, NOW).ratio, 263606 / 2350);
  assert.deepEqual(ids(rankAdsenseCards([refund, niche], NOW)), [niche.id, refund.id]);
});

test('수요 100 이상에서 문서/검색량 1배·5배 경계를 적용한다', () => {
  for (const [docs, tier] of [[99, 0], [100, 0], [101, 1], [500, 1], [501, 3]]) {
    const result = adsenseCompetition(card('boundary', { searchVolume: 100, documentCount: docs }), NOW);
    assert.equal(result.tier, tier, `문서 ${docs}`);
    assert.equal(result.ratio, docs / 100);
    assert.equal(typeof result.label, 'string');
    assert.ok(result.label.trim().length > 0);
  }
});

test('낮은 검색 수요는 별도 티어이고 고경쟁이면 고경쟁 티어가 우선한다', () => {
  assert.equal(adsenseCompetition(card('small', { searchVolume: 99, documentCount: 1 }), NOW).tier, 2);
  assert.equal(adsenseCompetition(card('small-five', { searchVolume: 20, documentCount: 100 }), NOW).tier, 2);
  assert.equal(adsenseCompetition(card('small-crowded', { searchVolume: 20, documentCount: 101 }), NOW).tier, 3);
});

test('문서수 미측정·비정상·0은 경쟁이 없는 것으로 간주하지 않는다', () => {
  for (const documentCount of [undefined, null, NaN, Infinity, -Infinity, -1, 0, '10']) {
    const result = adsenseCompetition(card('bad-docs', { documentCount }), NOW);
    assert.equal(result.tier, 4, `문서수 ${String(documentCount)}`);
    assert.equal(result.ratio, null);
  }
});

test('검색량 미측정·비정상·0은 추천 후보로 승격하지 않는다', () => {
  for (const searchVolume of [undefined, null, NaN, Infinity, -Infinity, -1, 0, '1000']) {
    const result = adsenseCompetition(card('bad-volume', { searchVolume }), NOW);
    assert.equal(result.tier, 4, `검색량 ${String(searchVolume)}`);
    assert.equal(result.ratio, null);
  }
});

test('대표 검색어 또는 측정시각이 없거나 잘못되면 확인 필요 티어다', () => {
  for (const query of [undefined, null, '', '   ']) {
    assert.equal(adsenseCompetition(card('bad-query', { query }), NOW).tier, 4);
  }
  for (const date of [undefined, null, '', 'not-a-date']) {
    assert.equal(adsenseCompetition(card('bad-time', { measuredAt: date }), NOW).tier, 4);
  }
  assert.equal(adsenseCompetition({ id: 'missing-metrics' }, NOW).tier, 4);
});

test('7일 미만만 최신 실측이며 정확히 7일·오래된 값·미래 측정은 마지막 티어다', () => {
  for (const [offset, tier] of [[0, 0], [-7 * DAY + 1, 0], [-7 * DAY, 5], [-8 * DAY, 5], [1, 5]]) {
    const result = adsenseCompetition(card('age', { measuredAt: new Date(NOW + offset).toISOString() }), NOW);
    assert.equal(result.tier, tier, `측정시각 오프셋 ${offset}`);
  }
});

test('입찰가 누락·비정상 여부는 경쟁 판정과 비율을 바꾸지 않는다', () => {
  const expected = adsenseCompetition(card('bid'), NOW);
  for (const bid of [undefined, null, NaN, Infinity, -1, 0, 1000000]) {
    const result = adsenseCompetition(card('bid', { bid }), NOW);
    assert.equal(result.tier, expected.tier);
    assert.equal(result.ratio, expected.ratio);
  }
});

test('티어가 먼저이고 각 티어에서는 낮은 문서/검색 비율이 먼저다', () => {
  const cards = [
    card('stale', { measuredAt: new Date(NOW - 8 * DAY).toISOString(), documentCount: 1 }),
    card('unknown', { documentCount: null }),
    card('crowded', { documentCount: 6000 }),
    card('low-demand', { searchVolume: 50, documentCount: 1 }),
    card('review', { documentCount: 2000 }),
    card('less-good', { documentCount: 800, bid: 1000000 }),
    card('best', { documentCount: 100, bid: 1 }),
  ];
  assert.deepEqual(ids(rankAdsenseCards(cards, NOW)), ['best', 'less-good', 'review', 'low-demand', 'crowded', 'unknown', 'stale']);
});

test('비율 동률이면 검색량 → 입찰가 → 서로 다른 고수 수 → id로 결정한다', () => {
  const cards = [
    card('small', { searchVolume: 100, documentCount: 50, bid: 99999 }),
    card('low-bid', { bid: 10 }),
    card('one-blog', { bid: 100 }, { sources: [{ id: 'a' }, { id: 'a' }, { id: 'a' }] }),
    card('z-two-blogs', { bid: 100 }, { sources: [{ id: 'a' }, { id: 'b' }] }),
    card('a-two-blogs', { bid: 100 }, { sources: [{ id: 'a' }, { id: 'b' }] }),
  ];
  assert.deepEqual(ids(rankAdsenseCards(cards, NOW)), ['a-two-blogs', 'z-two-blogs', 'one-blog', 'low-bid', 'small']);
});

test('원본 배열·카드를 변경하지 않으며 같은 입력의 순서는 재실행에도 동일하다', () => {
  const a = card('a', { documentCount: 900 });
  const b = card('b', { documentCount: 100 });
  for (const c of [a, b]) {
    Object.freeze(c.metrics);
    c.sources.forEach(Object.freeze);
    Object.freeze(c.sources);
    Object.freeze(c);
  }
  const input = Object.freeze([a, b]);
  const first = rankAdsenseCards(input, NOW);
  const second = rankAdsenseCards(input, NOW);
  assert.deepEqual(ids(input), ['a', 'b']);
  assert.deepEqual(ids(first), ['b', 'a']);
  assert.deepEqual(ids(second), ids(first));
  assert.notEqual(first, input);
  assert.equal(first[0], b);
});

test('완전 동률 카드는 입력 순서를 유지한다', () => {
  const a = card('same', {}, { marker: 'first' });
  const b = card('same', {}, { marker: 'second' });
  assert.deepEqual(rankAdsenseCards([a, b], NOW).map((c) => c.marker), ['first', 'second']);
  assert.deepEqual(rankAdsenseCards([], NOW), []);
});


test('낮은 경쟁 필터·실측 검색어 검색 후에도 순위를 유지한다', async () => {
  const { filterAdsenseCards } = await import('../src/lib/adsenseBenchmarkModel.mjs');
  const at = Date.parse('2026-10-15T00:00:00Z');
  const make = (id, docs) => ({ id, keyword: '소재', title: '원문', category: '경제', sources: [], metrics: { query: '실측검색어' + id, searchVolume: 1000, documentCount: docs, measuredAt: new Date(at).toISOString() } });
  const sorted = rankAdsenseCards([make('c', 2000), make('b', 400), make('a', 200)], at);
  assert.deepEqual(filterAdsenseCards(sorted, { mode: 'low', nowMs: at }).map((c) => c.id), ['a', 'b']);
  assert.deepEqual(filterAdsenseCards(sorted, { query: '실측검색어b', nowMs: at }).map((c) => c.id), ['b']);
  assert.deepEqual(filterAdsenseCards(sorted, { category: '경제', nowMs: at }).map((c) => c.id), ['a', 'b', 'c']);
});
