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

/** "우리는 이렇게 쓰자" — 고수 제목 실측 통계를 그대로 문장으로. 통계가 없으면 빈 목록. */
export function adsenseWritingAdvice(shape) {
  if (!shape || !shape.count) return [];
  const out = [];
  if (Number.isFinite(shape.lengthMedian)) out.push(`제목 길이는 ${shape.lengthMedian}자 안팎 — 고수 제목 ${shape.count.toLocaleString()}개의 가운데 길이입니다.`);
  if (Number.isFinite(shape.numberPct)) out.push(`숫자가 든 제목이 ${shape.numberPct}% — 금액 · 기간 · 비율처럼 구체적인 숫자를 넣습니다.`);
  if (Number.isFinite(shape.yearPct)) out.push(`연도(2026 등)를 넣은 제목이 ${shape.yearPct}% — 해가 바뀌면 달라지는 정보에만 붙입니다.`);
  if (Number.isFinite(shape.questionPct)) out.push(`질문형 제목이 ${shape.questionPct}% — 검색어 자체가 질문일 때 씁니다.`);
  if (Number.isFinite(shape.bracketPct)) out.push(`괄호·대괄호를 쓴 제목이 ${shape.bracketPct}% — 부제(조건 · 금액 · 날짜)를 묶는 데 씁니다.`);
  return out;
}
