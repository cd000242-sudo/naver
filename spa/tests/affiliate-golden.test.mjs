// 2026-10-29 사장님 "제휴황금키워드 또 반대로했네 문서수가 낮고 검색량이 높은 순이라니까" · "카테고리별로 분류해서 황금키워드를 찾아줘야지".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AFFILIATE_GOLDEN_MIN_VOLUME, affiliateCategory, compareGolden, goldenOf, summarizeCategories } from '../src/lib/affiliateGolden.mjs';

const rec = (monthlySearches, documentCount, query = 'q') => ({
  query, demand: { monthlySearches }, competition: { documentCount, ratio: monthlySearches !== null && documentCount !== null ? monthlySearches / Math.max(1, documentCount) : null },
});

test('황금비 = 검색량 ÷ 문서수, 추천 판정이 잰 검색어를 먼저 쓴다', () => {
  const g = goldenOf({ needKeyword: '다른말', needVolume: 9, needDocs: 9 }, rec(3570, 1650, '슈리오 스니커즈'));
  assert.equal(g.query, '슈리오 스니커즈');
  assert.equal(g.volume, 3570);
  assert.equal(g.docs, 1650);
  assert.ok(Math.abs(g.ratio - 3570 / 1650) < 1e-9);
});

test('추천 판정에 수치가 없으면 니즈 → 상품명 검색어 순으로 폴백, 둘 다 없으면 비율 없음', () => {
  assert.equal(goldenOf({ needKeyword: '로봇청소기', needVolume: 1000, needDocs: 500 }, rec(null, null)).ratio, 2);
  assert.equal(goldenOf({ keyword: '콩튀', searchVolume: 30, documentCount: 28 }, null).query, '콩튀');
  assert.equal(goldenOf({ name: '이름만' }, null).ratio, null);
});

test('문서수 0 은 안 잰 값 — 수집 실패가 0으로 찍혀 1등이 되는 함정(선점 판정의 문서수 0 차단과 같다)', () => {
  assert.equal(goldenOf({ keyword: 'x', searchVolume: 300, documentCount: 0 }, null).ratio, null);
  assert.equal(goldenOf({ needKeyword: 'n', needVolume: 500, needDocs: 0, keyword: 'k', searchVolume: 900, documentCount: 300 }, null).ratio, 3);
});

test('정렬: 문서수 낮고 검색량 높은 순(비율 내림차순) — 검색량 높고 문서도 많은 것이 위로 오면 안 된다', () => {
  const big = goldenOf({}, rec(24700, 44383));      // 비율 0.56
  const gold = goldenOf({}, rec(3570, 1650));       // 비율 2.16
  const best = goldenOf({}, rec(1200, 200));        // 비율 6
  const sorted = [big, gold, best].sort(compareGolden);
  assert.deepEqual(sorted.map((g) => g.volume), [1200, 3570, 24700]);
});

test(`검색량 하한(${AFFILIATE_GOLDEN_MIN_VOLUME}) 미만은 비율이 커도 뒤로 — 아무도 안 찾는 말이 1등이 되지 않게`, () => {
  const tiny = goldenOf({}, rec(30, 1));            // 비율 30, 수요 없음
  const real = goldenOf({}, rec(500, 400));         // 비율 1.25
  const none = goldenOf({ name: 'x' }, null);
  assert.deepEqual([none, tiny, real].sort(compareGolden), [real, tiny, none]);
});

test('같은 비율이면 검색량 큰 쪽이 먼저', () => {
  assert.equal([goldenOf({}, rec(200, 100)), goldenOf({}, rec(2000, 1000))].sort(compareGolden)[0].volume, 2000);
});

test('카테고리: 실측 출처가 먼저 — 브랜드커넥트 쇼핑 분류 번호 · 쿠팡 베스트셀러 분류', () => {
  assert.equal(affiliateCategory({ shoppingCategory: '50000003', name: '사과 2kg' }), '가전디지털');
  assert.equal(affiliateCategory({ shoppingCategory: '50000008', name: '아무거나' }), '생활용품');
  assert.equal(affiliateCategory({ source: '헬스/건강식품', name: '사과' }), '건강식품');
  assert.equal(affiliateCategory({ source: '여성패션', name: '티셔츠' }), '패션');
});

test('카테고리: 출처가 없으면 상품명 낱말로 — 실사고 오분류 방지(신발클리너는 패션이 아님, 배수구는 과일 배가 아님)', () => {
  const cases = [
    ['싹클린 신발클리너, 100ml, 4개', '생활용품'],
    ['배수구 만능 트랩, 사이즈 조절, 1개', '생활용품'],
    ['남성 겨울 배색 라인 파일 중목 양말', '패션'],
    ['국내산 홍옥사과, 중소과, 2kg, 1박스', '식품'],
    ['코오롱제약 모로오렌지 유산균, 2g, 30포', '건강식품'],
    ['사운독스 골전도형 오픈형 블루투스 무선 이어폰', '가전디지털'],
    ['라이녹스 클린 마스터 펫 청소기, 12L', '가전디지털'],
    ['포켄스 덴티페어리 클로로필 강아지 덴탈껌, SS', '반려동물'],
    ['메디올가 브라이트닝 크림, 30ml, 3개', '뷰티'],
    ['PN풍년 위더스 통3중 튼튼 냄비 IH, 16cm', '주방용품'],
    ['대용량 이불 정리함, 화이트그레이, 대, 1개', '가구/인테리어'],
    ['플러스셀라 마이엔젤 베이비 비누, 100g', '출산/육아'],
    ['자연진리 나주 신고배, 가정용, 4-7과, 3kg', '식품'],
    ['알 수 없는 물건 XYZ', '기타'],
  ];
  for (const [name, want] of cases) assert.equal(affiliateCategory({ name }), want, name);
  // 골드박스는 분류가 아니라 판매 구획 — 상품명으로 다시 분류한다.
  assert.equal(affiliateCategory({ source: '골드박스 특가', name: '비비고 왕교자, 1.05kg' }), '식품');
});

test('카테고리 요약: 개수 많은 순, 각 카테고리의 1위 황금 검색어를 함께', () => {
  const entries = [
    { category: '식품', golden: goldenOf({}, rec(500, 1000, '사과')) },
    { category: '식품', golden: goldenOf({}, rec(800, 100, '순대')) },
    { category: '뷰티', golden: goldenOf({}, rec(300, 100, '크림')) },
  ];
  const summary = summarizeCategories(entries);
  assert.deepEqual(summary.map((s) => [s.category, s.count, s.top?.query]), [['식품', 2, '순대'], ['뷰티', 1, '크림']]);
});

test('실데이터: 토스·브랜드커넥트 상품 중 기타로 빠지는 비율이 25% 미만', () => {
  const data = JSON.parse(readFileSync(new URL('../public/data/affiliate-campaigns.json', import.meta.url), 'utf8'));
  const items = Object.values(data.sites).flatMap((site) => site.items);
  const other = items.filter((item) => affiliateCategory(item) === '기타');
  assert.ok(other.length / items.length < 0.25, `기타 ${other.length}/${items.length}: ${other.slice(0, 15).map((i) => i.name.slice(0, 20)).join(' | ')}`);
});

test('카테고리 회귀: 실데이터 오분류 사례(2026-10-29 점검)', () => {
  const cases = [
    ['퍼니트 리얼 클렌즈 마시는 샐러드, 30', '식품'],
    ['애슐리 크리스피 핫도그 4종, 80g', '식품'],
    ['도톰 쿠션 양말, 단목, 화이트 5개', '패션'],
    ['디핀다트 구슬아이스크림, 레인보우', '식품'],
    ['끌리젠 가열식 가습기 올스텐 아기 신생아', '가전디지털'],
    ['비트 캡슐세제 울트라콤팩트 실내건조', '생활용품'],
    ['마미케어 율무 효소 클렌저, 50g', '뷰티'],
    ['나주 원황배 가정용, 7-10과, 3kg', '식품'],
    ['공식 애플 에어팟 5 MKFW4KH/A', '가전디지털'],
    ['DMPS 30수 긴팔 니트, 블랙', '패션'],
  ];
  for (const [name, want] of cases) assert.equal(affiliateCategory({ name }), want, name);
});
