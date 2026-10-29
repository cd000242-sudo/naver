/*
 * 카테고리별 제휴 황금 검색어 읽기(2026-10-29).
 * 사장님 "제휴 황금키워드도 카테고리별로 있을꺼아냐 그걸 분류해서 황금키워드를 찾아줘야지".
 * 앱 레포 scripts/affiliate-golden-keywords.cjs 가 카테고리 대표어의 연관어를 검색광고 · 블로그 검색으로 재서 매일 낸다.
 * 파일의 등급 · 비율은 믿지 않고 잰 숫자(검색량 · 문서수)로 goldenOf 를 다시 돌린다 — 판정 기준은 affiliateGolden.mjs 한 곳.
 */
import { compareGolden, goldenOf } from './affiliateGolden.mjs';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const CATEGORY = /^[가-힣/]{1,12}$/;

/*
 * 내 제휴 상품 검색어 찾기. 실측(10-29)하니 황금으로 남는 말은 거의 '브랜드 + 상품 종류'(에어메이드가습기 · 저압냄비)였다.
 * 브랜드인지 아닌지는 판정할 근거가 없어 표시하지 않는다. 대신 대표어(seed)를 빼고 남는 말(일반 수식어 제외)이
 * 내 제휴 상품 이름에 그대로 있으면 그 상품을 돌려준다 — 그 검색어로 쓰고 바로 그 상품 링크를 거는 짝이다.
 */
const GENERIC = /^(?:추천|비교|순위|후기|리뷰|가격|세척|청소|필터|사용법|방법|원리|전기세|전기요금|소독|냄새|고장|수리|종류|장단점|단점|장점|효과|부작용|만드는법|레시피|보관|보관법|용량|사이즈|세트|선물|가성비|최저가|할인|구매|중고|렌탈|초음파|가열식|복합식|자연기화식|미니|대용량|소형|대형|휴대용|무선|유선|가정용|업소용|아기|신생아|원룸|사무실|차량용|캠핑|겨울|여름|전기|스텐|스테인리스|국산|국내산|유기농|저당|무설탕|남자|여자|여성|남성|아이|어린이|노인|1인|2인|만들기|먹는법|고르는법|하는법)+$/;
const compact = (text) => String(text || '').replace(/\s+/g, '').toLowerCase();
export function matchOwnProduct(keyword, seed, productNames) {
  const rest = seed && compact(keyword).includes(compact(seed)) ? compact(keyword).replace(compact(seed), '') : '';
  if (rest.length < 2 || GENERIC.test(rest)) return null;
  return (productNames || []).find((name) => compact(name).includes(rest)) || null;
}

export function parseCategoryGolden(store) {
  const byCategory = new Map();
  const categories = store && typeof store === 'object' && store.categories && typeof store.categories === 'object' && !Array.isArray(store.categories) ? store.categories : {};
  for (const [category, entry] of Object.entries(categories)) {
    if (!CATEGORY.test(category) || !entry || !Array.isArray(entry.keywords)) continue;
    const keywords = entry.keywords
      .map((k) => ({ ...goldenOf({ keyword: str(k?.keyword, 60), searchVolume: k?.volume, documentCount: k?.docs }), seed: str(k?.seed, 30), category }))
      .filter((k) => k.query && k.golden)
      .map((k) => ({ ...k, keyword: k.query }))
      .sort(compareGolden)
      .slice(0, 30);
    if (keywords.length) byCategory.set(category, keywords);
  }
  const builtAt = str(store?.builtAt, 40);
  return { builtAt: Number.isFinite(Date.parse(builtAt)) ? builtAt : '', byCategory };
}

/** '전체'면 카테고리를 섞어 상위 limit, 아니면 그 카테고리 안에서. */
export function categoryGoldenTop(byCategory, category, limit) {
  const rows = category === '전체' ? [...byCategory.values()].flat() : byCategory.get(category) || [];
  return [...rows].sort(compareGolden).slice(0, limit);
}

/** 상품 칩 요약에 황금 검색어 수를 붙이고, 황금 상품이 없는 카테고리도 검색어가 있으면 칩으로 올린다. 검색어 많은 순, '기타'는 맨 뒤. */
export function mergeCategorySummary(summary, byCategory) {
  const names = [...new Set([...summary.map((s) => s.category), ...byCategory.keys()])];
  return names
    .map((category) => {
      const product = summary.find((s) => s.category === category);
      return { category, count: product?.count ?? 0, top: product?.top ?? byCategory.get(category)?.[0] ?? null, keywords: byCategory.get(category)?.length ?? 0 };
    })
    .sort((a, b) => Number(a.category === '기타') - Number(b.category === '기타') || b.keywords - a.keywords || b.count - a.count);
}

export async function loadCategoryGolden(fetcher = fetch) {
  try {
    const res = await fetcher('/data/affiliate-golden-keywords.json', { cache: 'no-cache' });
    return res.ok ? parseCategoryGolden(await res.json()) : parseCategoryGolden(null);
  } catch {
    return parseCategoryGolden(null);
  }
}
