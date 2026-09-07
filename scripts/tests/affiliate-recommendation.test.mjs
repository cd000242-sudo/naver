import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAffiliateRecommendation, compareAffiliateRecommendations, selectAffiliateCandidate, verifiedProductEvidence, validateEvidenceTitle, measuredSearchVolume } from '../../spa/src/lib/affiliateRecommendation.mjs';

const now = '2026-09-06T03:00:00.000Z';
const collectedAt = '2026-09-06T02:00:00.000Z';
const measurement = (query, overrides = {}) => ({ query, serpQuery:query, monthlySearches: 300, documentCount: 100, serpTop: { sampled: 10, exact: 1, partial: 3 }, measuredAt: collectedAt, source: 'naver-searchad+blog-search', ...overrides });
const product = (overrides = {}) => ({ name: '오아 클린이워터B 휴대용 무선 구강세정기', keyword: '오아 구강세정기', brand: '오아', keywordEvidence: [measurement('오아 구강세정기')], ...overrides });
const assess = (item, options = {}) => assessAffiliateRecommendation(item, { now, collectedAt, ...options });

test('ready requires fresh same-product demand and the same-query SERP evidence', () => {
  const result = assess(product());
  assert.equal(result.status, 'ready');
  assert.equal(result.demand.query, '오아 구강세정기');
  assert.equal(result.competition.query, result.demand.query);
  assert.equal(result.meaning, '근거 통과 작성 후보 — 성과 보장 아님');
});
test('broad jangjorim demand is not a golden product recommendation', () => {
  const result = assess(product({ name: '아침애 메추리알 장조림 1kg', keyword: '아침애 장조림', keywordEvidence: [measurement('장조림', { monthlySearches: 7930, documentCount: 975742 })] }));
  assert.equal(result.status, 'excluded');
  assert.ok(result.reasons.includes('competition-saturated'));
});
test('unknown demand is distinct from verified zero demand', () => {
  const unknown = assess(product({ keywordEvidence: [measurement('오아 구강세정기', { monthlySearches: null })] }));
  const zero = assess(product({ keywordEvidence: [measurement('오아 구강세정기', { monthlySearches: 0 })] }));
  assert.equal(unknown.status, 'research');
  assert.equal(unknown.demand.status, 'unknown');
  assert.equal(unknown.demand.monthlySearches, null);
  assert.equal(zero.status, 'excluded');
  assert.equal(zero.demand.monthlySearches, 0);
});
test('search API null, partial and less-than-ten rows never become measured zero', () => {
  assert.equal(measuredSearchVolume({ pcSearchVolume: null, mobileSearchVolume: null }), null);
  assert.equal(measuredSearchVolume({ pcSearchVolume: 500, mobileSearchVolume: null }), null);
  assert.equal(measuredSearchVolume({ pcSearchVolume: 0, mobileSearchVolume: 20, pcSearchVolumeLt10: true }), null);
  assert.equal(measuredSearchVolume({ pcSearchVolume: 0, mobileSearchVolume: 0 }), 0);
  assert.equal(measuredSearchVolume({ pcSearchVolume: 10, mobileSearchVolume: 20 }), 30);
});
test('legacy metrics, mixed queries, stale products and stale metrics cannot be ready', () => {
  assert.equal(assess(product({ keywordEvidence: [], needKeyword: '오아 구강세정기', needVolume: 500, needDocs: 20 })).status, 'research');
  assert.equal(assess(product({ keywordEvidence: [measurement('오아 구강세정기', { serpQuery: '장조림' })] })).status, 'research');
  assert.equal(assess(product(), { collectedAt: '2026-08-21T00:00:00Z' }).status, 'research');
  assert.equal(assess(product({ keywordEvidence: [measurement('오아 구강세정기', { measuredAt: '2026-08-21T00:00:00Z' })] })).status, 'research');
});
test('brand alone and another model are not same-product proof', () => {
  assert.equal(assess(product({ keywordEvidence: [measurement('오아')] })).status, 'research');
  assert.equal(assess(product({ keywordEvidence: [measurement('오아 클린이워터C')] })).status, 'excluded');
  assert.equal(assess(product({ keywordEvidence: [measurement('구강세정기 추천')] })).status, 'research');
  assert.equal(assess(product({name:'삼성 갤럭시 S25 울트라',keyword:'갤럭시 S25',keywordEvidence:[measurement('갤럭시 S2')]})).status,'excluded');
  assert.equal(assess(product({name:'삼성 갤럭시 S25 울트라',keyword:'갤럭시 S25',keywordEvidence:[measurement('갤럭시S2')]})).status,'excluded');
});
test('missing query provenance and insufficient title samples never pass', () => {
  for (const overrides of [{serpQuery:undefined},{serpQuery:''},{documentCount:0,serpTop:{sampled:0,exact:0}},{documentCount:3,serpTop:{sampled:3,exact:0}}]) {
    assert.equal(assess(product({keywordEvidence:[measurement('오아 구강세정기',overrides)]})).status,'research');
  }
});
test('family demand is explicitly scoped, not assigned to a particular model', () => {
  assert.equal(assess(product()).relevance.scope,'product-family');
});
test('selection and sorting put verified relevant opportunity before huge broad volume', () => {
  const item = product({ keywordEvidence: [measurement('구강세정기', { monthlySearches: 100000 }), measurement('오아 구강세정기')] });
  assert.equal(selectAffiliateCandidate(item, { now, collectedAt }).query, '오아 구강세정기');
  const ready = { recommendation: assess(product()) };
  const research = { needVolume: 100000, recommendation: assess(product({ keywordEvidence: [] })) };
  assert.ok(compareAffiliateRecommendations(ready, research) < 0);
});
test('unvalidated, negative and malformed metrics never make an opportunity', () => {
  for (const value of [-1, NaN, Infinity, '500']) {
    const result = assess(product({ keywordEvidence: [measurement('오아 구강세정기', { monthlySearches: value })] }));
    assert.equal(result.status, 'research');
    assert.equal(result.demand.status, 'unknown');
  }
  assert.equal(assess(product({ keywordEvidence: [measurement('오아 구강세정기', { serpTop: null })] })).status, 'research');
});
test('screening boundaries and unknown product identity stay explicit', () => {
  const result = overrides => assess(product({keywordEvidence:[measurement('오아 구강세정기',overrides)]}));
  assert.ok(result({monthlySearches:20}).reasons.includes('demand-below-screening-minimum'));
  assert.ok(result({serpTop:{sampled:10,exact:3}}).reasons.includes('direct-competition-needs-review'));
  assert.equal(result({serpTop:{sampled:10,exact:6}}).status,'excluded');
  assert.equal(result({source:'invented'}).demand.status,'unknown');
  assert.equal(result({measuredAt:'2027-01-01T00:00:00Z'}).status,'research');
  assert.equal(assess(product({name:''})).relevance.status,'unknown');
  assert.equal(compareAffiliateRecommendations({},{}),0);
});
test('product-name price and search-volume are not official product-body evidence', () => {
  assert.deepEqual(verifiedProductEvidence(product({ price: 10000 }), { now }), []);
  assert.deepEqual(verifiedProductEvidence(product({ productEvidence: [{ id: 'name', sourceType: 'product-name', sourceUrl: 'https://example.com/product', excerpt: '저소음', verifiedAt: collectedAt }] }), { now }), []);
  for (const sourceUrl of ['https://localhost./private','https://a.local./private','https://127.0.0.1/private']) {
    assert.deepEqual(verifiedProductEvidence(product({productEvidence:[{id:'spec',sourceType:'official-product',sourceUrl,excerpt:'배터리 최대 10시간 표기',verifiedAt:collectedAt}]}),{now}),[]);
  }
});
const evidenceItem = () => product({ productEvidence: [{ id: 'spec-1', sourceType: 'official-product', sourceUrl: 'https://oa.co.kr/product/1', excerpt: '물통 용량 200ml. 구성: 본체, 충전 케이블.', verifiedAt: collectedAt }] });
test('AI title must cite actual official excerpts, not merely valid-looking ids', () => {
  const valid = { title: '오아 구강세정기 물통 용량 200ml 표기 확인', axis: '물통 용량 200ml', whyClick: '구매 전 공식 표기 확인', claims: [{ text: '물통 용량 200ml', evidenceId: 'spec-1', quote: '물통 용량 200ml' }] };
  assert.equal(validateEvidenceTitle(evidenceItem(), valid, { now })?.status, 'verified');
  assert.equal(validateEvidenceTitle(product(), valid, { now }), null);
  assert.equal(validateEvidenceTitle(evidenceItem(), { ...valid, claims: [{ ...valid.claims[0], evidenceId: 'invented' }] }, { now }), null);
  assert.equal(validateEvidenceTitle(evidenceItem(), { ...valid, title: '오아 구강세정기 소음 걱정 없이 하루 만에 잇몸 개선' }, { now }), null);
  assert.equal(validateEvidenceTitle(evidenceItem(), { ...valid, claims: [{ text: '물통 용량 300ml', evidenceId: 'spec-1', quote: '물통 용량 300ml' }] }, { now }), null);
});
