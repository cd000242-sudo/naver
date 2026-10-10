/**
 * 애드센스 고수 벤치마크 화면 모델(2026-10-07). 판은 앱 레포 scripts/adsense-benchmarks.cjs 가 만든다 —
 * 여기서는 거르고 · 세고 · 실측 통계를 문장으로 옮기기만 한다(지어낸 수치 없음).
 */

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/** 블로그 수(같은 블로그의 글 여러 개는 1). */
export function blogCount(card) {
  return new Set((card?.sources || []).map((s) => s?.id).filter(Boolean)).size;
}

/** 거르기 — mode 'star'(고수 3곳 이상) · 분야 · 검색어(키워드 · 제목 · 출처 글 제목). */
export function filterAdsenseCards(cards, { mode = 'all', category = '', query = '' } = {}) {
  const q = clean(query).toLowerCase().replace(/\s+/g, '');
  return (Array.isArray(cards) ? cards : []).filter((c) => {
    if (mode === 'star' && !c.recommended) return false;
    if (category && c.category !== category) return false;
    if (!q) return true;
    const hay = [c.keyword, c.title, ...(c.sources || []).map((s) => s?.title)].map((v) => clean(v).toLowerCase().replace(/\s+/g, '')).join(' ');
    return hay.includes(q);
  });
}

/** 분야 칩 — 카드 많은 순. */
export function adsenseCategories(cards) {
  const counts = new Map();
  for (const c of Array.isArray(cards) ? cards : []) if (c?.category) counts.set(c.category, (counts.get(c.category) || 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/*
 * "고수는 이렇게 썼다" — 고수 제목 실측 통계 + 고수가 실제로 쓴 제목 예(★ 소재 먼저).
 * 2026-10-10 사장님 "하드코딩 — 뻔한 소리": 통계 뒤에 붙던 고정 조언 문장("구체적인 숫자를 넣습니다" 등)을 빼고 실제 제목을 단다.
 * 판정식은 수집기(앱 레포 scripts/adsense-benchmarks-core.cjs titleShape)와 같다. 예가 없으면 수치만, 통계가 없으면 빈 목록.
 */
const SHAPE_TESTS = { year: /20\d\d/, number: /\d/, question: /\?|까$|나요|을까|ㄹ까/, bracket: /[[\](){}【】]/ };
function masterTitles(cards) {
  const sorted = [...(Array.isArray(cards) ? cards : [])].sort((a, b) => Number(Boolean(b?.recommended)) - Number(Boolean(a?.recommended)) || (b?.priority || 0) - (a?.priority || 0));
  // 사이트 주소가 든 '바로가기' 글 제목은 본보기가 아니다(실제 판: "동행복권 홈페이지 바로가기 (www.dhlottery.co.kr)")
  return sorted.flatMap((c) => (Array.isArray(c?.sources) ? c.sources : []).map((s) => (typeof s?.title === 'string' ? s.title.trim() : '')))
    .filter((t) => t && !/https?:|www\.|\.(co\.kr|go\.kr|or\.kr|com|net)\b/i.test(t));
}
export function adsenseWritingAdvice(shape, cards = []) {
  if (!shape || !shape.count) return [];
  const titles = masterTitles(cards);
  const used = new Set();
  const pick = (ok) => { const t = titles.find((x) => !used.has(x) && ok(x)); if (t) used.add(t); return t ? ` · 예: 「${t}」` : ''; };
  const has = (k) => Number.isFinite(shape[k]);
  // 모양별 예를 먼저 고르고 길이 예는 남은 제목에서(같은 제목이 두 줄에 안 겹치게)
  const ex = {
    number: has('numberPct') ? pick((t) => SHAPE_TESTS.number.test(t)) : '',
    year: has('yearPct') ? pick((t) => SHAPE_TESTS.year.test(t)) : '',
    question: has('questionPct') ? pick((t) => SHAPE_TESTS.question.test(t)) : '',
    bracket: has('bracketPct') ? pick((t) => SHAPE_TESTS.bracket.test(t)) : '',
  };
  const out = [];
  if (has('lengthMedian')) out.push(`제목 길이 가운데값 ${shape.lengthMedian}자(고수 제목 ${shape.count.toLocaleString()}개)${pick((t) => Math.abs(t.length - shape.lengthMedian) <= 2)}`);
  if (has('numberPct')) out.push(`숫자가 든 제목 ${shape.numberPct}%${ex.number}`);
  if (has('yearPct')) out.push(`연도(2026 등)를 넣은 제목 ${shape.yearPct}%${ex.year}`);
  if (has('questionPct')) out.push(`질문형 제목 ${shape.questionPct}%${ex.question}`);
  if (has('bracketPct')) out.push(`괄호·대괄호를 쓴 제목 ${shape.bracketPct}%${ex.bracket}`);
  return out;
}
