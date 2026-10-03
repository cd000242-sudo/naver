import test from 'node:test';
import assert from 'node:assert/strict';
import { realtimeSources } from '../../spa/src/lib/realtimeSources.mjs';

test('keeps provider rankings isolated and does not invent source publication timestamps', () => {
  const sources = realtimeSources({sourceBatchAt: 100, checkedAt: 200, items: [{rank: 3, keyword: '시그널'}]}, {checkedAt: 999, lanes: {
    popular: {updatedAt: 300, items: [{rank: 2, keyword: '네이트'}]},
    daum: {updatedAt: 400, sourceUpdatedAt: 350, items: [{rank: 1, keyword: '다음'}]},
    google: {updatedAt: 500, items: [{rank: 8, keyword: '구글', approxTraffic: '2,000+'}]},
  }});
  assert.deepEqual(sources.map(s => s.items.map(i => [i.rank, i.keyword])), [[[3,'시그널']], [[2,'네이트']], [[1,'다음']], [[8,'구글']]]);
  assert.equal(sources[1].sourceAt, null);
  assert.equal(sources[1].checkedAt, 300);
  assert.equal(sources[2].sourceAt, 350);
  assert.equal(sources[3].items[0].approxTraffic, '2,000+');
});

test('missing provider remains unavailable, without borrowing other providers or request timestamps', () => {
  const sources = realtimeSources(null, {checkedAt: 999, lanes: {popular: {updatedAt: 300, items: [{rank: 1, keyword: '네이트'}]}}});
  assert.equal(sources.length, 4);
  assert.deepEqual(sources[2].items, []);
  assert.equal(sources[2].checkedAt, null);
  assert.equal(sources[0].sourceAt, null);
});

test('drops malformed rows without reranking valid source rows', () => {
  const sources = realtimeSources({items: [{rank: 0, keyword: '잘못된 순위'}, {rank: 1, keyword: ''}, {rank: 4, keyword: '유효'}, null]}, null);
  assert.deepEqual(sources[0].items, [{rank: 4, keyword: '유효'}]);
});
