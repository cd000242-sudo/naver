import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCoupangDiscovery, compareCoupangDiscovery, coupangProductUrl } from '../../spa/src/lib/coupangDiscovery.mjs';

const now = Date.parse('2026-09-07T07:00:00Z');
const product = (changes = {}) => ({
  name: '브랜드 무타공 자석 부착식 욕실 수납 선반', keyword: '브랜드 선반',
  source: '생활용품', bestRank: 2, measuredAt: '2026-09-07T06:00:00Z',
  price: 17900, url: 'https://link.coupang.com/a/test', searchVolume: 0, documentCount: 100000,
  ...changes,
});
const assess = changes => assessCoupangDiscovery(product(changes), { now });

test('search weakness never rejects a fresh practical discovery candidate', () => {
  for (const searchVolume of [0, null, 10, 10000]) {
    const result = assess({ searchVolume });
    assert.equal(result.status, 'candidate');
    assert.equal(result.salesVerified, false);
    assert.equal(result.noveltyVerified, false);
    assert.match(result.sourceLabel, /목록 2번째/);
    assert.match(result.cues[0].quote, /무타공/);
    assert.match(result.cues[0].question, /설치/);
  }
});
test('marketing adjectives and ordinary products are kept for inspection, not promoted', () => {
  for (const name of ['대박 신박한 꿀템 인기 상품', '브랜드 생수 2L 12개', '브랜드 자동차 장난감', '브랜드 무선 이어폰']) {
    assert.equal(assess({ name }).status, 'inspect', name);
  }
});
test('a functional feature must be paired with a matching product use, not substring coincidence', () => {
  for (const name of ['브랜드 접이식 수납 바구니', '브랜드 틈새 청소 브러시', '브랜드 자동급수 화분', '브랜드 자석 부착식 케이블 정리 홀더']) {
    assert.equal(assess({ name }).status, 'candidate', name);
  }
  for (const name of ['브랜드 접이식 건강식품', '브랜드 자동 자동차 장난감', '브랜드 자석 과학 실험 교구', '브랜드 무타공 꽃무늬 양말']) {
    assert.equal(assess({ name }).status, 'inspect', name);
  }
});
test('expired, future, missing timestamps and invalid price or source cannot qualify', () => {
  for (const changes of [
    { measuredAt: '2026-09-05T06:59:59Z' }, { measuredAt: '2026-09-07T07:01:00Z' },
    { measuredAt: undefined }, { measuredAt: 'bad' }, { price: null }, { price: 0 },
    { price: -1 }, { price: '1000' }, { source: '판매자가 인기라고 주장' },
    { bestRank: 0 }, { bestRank: 1.5 }, { bestRank: undefined },
  ]) assert.equal(assess(changes).status, 'inspect', JSON.stringify(changes));
  assert.equal(assess({ measuredAt: '2026-09-05T07:00:00Z' }).status, 'candidate');
});
test('goldbox placement is promotion evidence, never sales or popularity verification', () => {
  const result = assess({ source: '골드박스 특가', bestRank: 1 });
  assert.equal(result.status, 'candidate');
  assert.match(result.sourceLabel, /특가 목록/);
  assert.equal(result.salesVerified, false);
  assert.doesNotMatch(result.sourceLabel, /판매|인기|위/);
});
test('unsafe links cannot qualify or become clickable', () => {
  for (const url of ['javascript:alert(1)', 'http://www.coupang.com/a', 'https://coupang.com.evil.test/a', 'https://user:pass@coupang.com/a', 'https://localhost/a', 'bad']) {
    assert.equal(coupangProductUrl(url), null);
    assert.equal(assess({ url }).status, 'inspect');
  }
  assert.equal(coupangProductUrl('https://www.coupang.com/vp/products/123'), 'https://www.coupang.com/vp/products/123');
});
test('discovery sorting is deterministic and independent from search volume', () => {
  const items = [product({ name: '일반 생수', searchVolume: 50000 }), product({ source: '골드박스 특가', bestRank: 1 }), product()];
  const entries = items.map(row => ({ row, discovery: assessCoupangDiscovery(row, { now }) }));
  const sorted = [...entries].sort(compareCoupangDiscovery);
  assert.deepEqual(sorted.map(entry => entry.row), [items[2], items[1], items[0]]);
  assert.equal(compareCoupangDiscovery(entries[2], entries[2]), 0);
  assert.deepEqual(items.map(row => row.searchVolume), [50000, 0, 0]);
});
test('missing input remains inspectable and does not manufacture evidence', () => {
  const result = assessCoupangDiscovery(null, { now });
  assert.equal(result.status, 'inspect');
  assert.deepEqual(result.cues, []);
  assert.ok(result.reasons.length > 0);
  assert.equal(result.sourceLabel, '수집 출처 확인 필요');
});
