// 2026-10-29 사장님 "제휴 황금키워드도 카테고리별로 있을꺼아냐 그걸 분류해서 황금키워드를 찾아줘야지" —
// 앱 레포 affiliate-golden-keywords.cjs 가 카테고리 대표어의 연관어를 재서 /data/affiliate-golden-keywords.json 으로 낸다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryGoldenTop, loadCategoryGolden, matchOwnProduct, mergeCategorySummary, parseCategoryGolden } from '../src/lib/affiliateCategoryGolden.mjs';

const store = {
  schemaVersion: 1, builtAt: '2026-10-29T22:30:00Z', source: 'naver-searchad+blog-search', minVolume: 100,
  categories: {
    가전디지털: { seeds: ['가습기'], measured: 50, keywords: [
      { keyword: '가습기 세척', volume: 900, docs: 120, docRatio: 0.13, grade: 'S', seed: '가습기' },
      { keyword: '가습기 추천', volume: 5000, docs: 9000, docRatio: 1.8, grade: 'B', seed: '가습기' },   // 문서가 더 많다 — 버린다
      { keyword: '가습기 필터', volume: 60, docs: 10, docRatio: 0.16, grade: 'A', seed: '가습기' },      // 검색 100 미만 — 버린다
      { keyword: '가습기 소독', volume: 1200, docs: 0, docRatio: 0, grade: 'S', seed: '가습기' },         // 문서수 0 = 미측정 — 버린다
      { keyword: '초음파 가습기', volume: 2000, docs: 1200, docRatio: 0.6, grade: 'A', seed: '가습기' },
    ] },
    식품: { seeds: ['콩과자'], keywords: [{ keyword: '콩과자 추천', volume: 400, docs: 300, docRatio: 0.75, grade: 'B', seed: '콩과자' }] },
    '<script>': { keywords: 'x' },
  },
};

test('읽기: 잰 숫자로 다시 판정한다 — 파일의 등급 · 비율을 믿지 않고, 황금(문서 < 검색 · 검색 100+)만 남긴다', () => {
  const parsed = parseCategoryGolden(store);
  assert.equal(parsed.builtAt, '2026-10-29T22:30:00Z');
  const appliance = parsed.byCategory.get('가전디지털');
  assert.deepEqual(appliance.map((k) => [k.keyword, k.grade]), [['가습기 세척', 'S'], ['초음파 가습기', 'A']]);
  assert.ok(Math.abs(appliance[0].docRatio - 120 / 900) < 1e-9);
  assert.deepEqual(parsed.byCategory.get('식품').map((k) => k.grade), ['B']);
  assert.equal(parsed.byCategory.has('<script>'), false);
});

test('모양이 틀린 파일은 빈 결과', () => {
  for (const bad of [null, 'x', { categories: [] }, { categories: null }]) assert.equal(parseCategoryGolden(bad).byCategory.size, 0);
});

test('전체 보기는 카테고리를 섞어 문서÷검색 낮은 순 상위 N', () => {
  const { byCategory } = parseCategoryGolden(store);
  assert.deepEqual(categoryGoldenTop(byCategory, '전체', 2).map((k) => [k.keyword, k.category]), [['가습기 세척', '가전디지털'], ['초음파 가습기', '가전디지털']]);
  assert.deepEqual(categoryGoldenTop(byCategory, '식품', 10).map((k) => k.keyword), ['콩과자 추천']);
  assert.deepEqual(categoryGoldenTop(byCategory, '없는칸', 10), []);
});

test('카테고리 칩 합치기: 황금 상품이 없어도 황금 검색어가 있는 카테고리는 칩에 나온다', () => {
  const { byCategory } = parseCategoryGolden(store);
  const merged = mergeCategorySummary([{ category: '패션', count: 1, top: null }], byCategory);
  assert.deepEqual(merged.map((s) => [s.category, s.count, s.keywords]), [['가전디지털', 0, 2], ['식품', 0, 1], ['패션', 1, 0]]);
});

test('파일이 없거나 실패하면 빈 결과', async () => {
  assert.equal((await loadCategoryGolden(async () => ({ ok: false }))).byCategory.size, 0);
  assert.equal((await loadCategoryGolden(async () => { throw new Error('net'); })).byCategory.size, 0);
  assert.equal((await loadCategoryGolden(async () => ({ ok: true, json: async () => store }))).byCategory.size, 2);
});

test('내 상품 검색어: 대표어를 뺀 말이 내 제휴 상품 이름에 있으면 그 상품 — 일반 수식어 · 다른 브랜드는 null', () => {
  const names = ['에어메이드 가열 살균 가습기 열풍 건조', '케어팟 큐브 프로 X55V'];
  assert.equal(matchOwnProduct('에어메이드가습기', '가습기', names), names[0]);
  assert.equal(matchOwnProduct('케어팟 가습기', '가습기', names), names[1]);
  assert.equal(matchOwnProduct('조지루시가습기', '가습기', names), null);
  assert.equal(matchOwnProduct('가습기 추천', '가습기', names), null);
  assert.equal(matchOwnProduct('가습기', '가습기', names), null);
  assert.equal(matchOwnProduct('새우젖육젖', '새우젓', names), null);
});
