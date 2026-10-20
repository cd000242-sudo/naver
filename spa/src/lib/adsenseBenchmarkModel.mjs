/**
 * 애드센스 고수 벤치마크 화면 모델(2026-10-07). 판은 앱 레포 scripts/adsense-benchmarks.cjs 가 만든다 —
 * 여기서는 거르고 · 세고 · 실측 통계를 문장으로 옮기기만 한다(지어낸 수치 없음).
 */

import { shuffleWithinTiers } from './hourlyShuffle.mjs';

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/*
 * 플랫폼(2026-10-20 사장님 "워드프레스랑 티스토리, 블로그스팟 구분 — 각각 성격이 다릅니다. 워드프레스 먼저").
 * 판의 출처 글마다 platform 이 실린다(앱 레포 adsense-benchmarks-core.cjs, 엑셀 '플랫폼' 열 기준).
 * note 는 검색 유입 경로만 적는다 — 수익 · 노출 성과를 말하지 않는다.
 */
export const ADSENSE_PLATFORMS = [
  { key: 'wordpress', label: '워드프레스', note: '독립 도메인 · 구글 검색 유입 중심' },
  { key: 'tistory', label: '티스토리', note: '다음(카카오) · 구글 검색 유입' },
  { key: 'blogspot', label: '블로그스팟', note: '구글 블로거 · 구글 검색 유입 중심' },
];

/** 카드의 플랫폼 — 출처 글들의 플랫폼 모음. */
export function cardPlatforms(card) {
  return new Set((card?.sources || []).map((s) => clean(s?.platform)).filter(Boolean));
}

/** 블로그 수(같은 블로그의 글 여러 개는 1). */
export function blogCount(card) {
  return new Set((card?.sources || []).map((s) => s?.id).filter(Boolean)).size;
}

/** 거르기 — mode 'star'(고수 3곳 이상) · 분야 · 검색어(키워드 · 제목 · 출처 글 제목). */
export function filterAdsenseCards(cards, { mode = 'all', category = '', query = '', platform = '', nowMs = Date.now() } = {}) {
  const q = clean(query).toLowerCase().replace(/\s+/g, '');
  return (Array.isArray(cards) ? cards : []).filter((c) => {
    if (platform && !cardPlatforms(c).has(platform)) return false;
    if (mode === 'low' && adsenseCompetition(c, nowMs).tier !== 0) return false;
    if (mode === 'star' && !c.recommended) return false;
    if (category && c.category !== category) return false;
    if (!q) return true;
    const hay = [c.metrics?.query, c.keyword, c.title, ...(c.sources || []).map((s) => s?.title)].map((v) => clean(v).toLowerCase().replace(/\s+/g, '')).join(' ');
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

// 앱과 같은 수요 대비 문서 경쟁 기준. 광고가·발행 수는 동률에서만 비교한다.
export function adsenseCompetition(card, nowMs = Date.now()) {
  const m = card?.metrics || {};
  const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const ratio = positive(m.searchVolume) && positive(m.documentCount) ? m.documentCount / m.searchVolume : null;
  const age = nowMs - Date.parse(m.measuredAt);
  if (!String(m.query || '').trim() || !Number.isFinite(age)) return { tier: 4, ratio, label: '실측 확인 필요' };
  if (age < 0 || age >= 7 * 86400000) return { tier: 5, ratio, label: '재측정 필요' };
  if (ratio === null) return { tier: 4, ratio, label: m.documentCount === 0 ? '문서 0건 재확인' : '실측 확인 필요' };
  if (ratio > 5) return { tier: 3, ratio, label: '문서 경쟁 높음' };
  if (m.searchVolume < 100) return { tier: 2, ratio, label: '검색 수요 적음' };
  return ratio <= 1 ? { tier: 0, ratio, label: '낮은 문서 경쟁' } : { tier: 1, ratio, label: '문서 경쟁 비교' };
}

export function rankAdsenseCards(cards, nowMs = Date.now()) {
  const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : -1;
  return (Array.isArray(cards) ? cards : []).map((c) => ({ card: c, competition: adsenseCompetition(c, nowMs) }))
    .sort((a, b) => a.competition.tier - b.competition.tier
      || (a.competition.ratio ?? Infinity) - (b.competition.ratio ?? Infinity)
      || number(b.card.metrics?.searchVolume) - number(a.card.metrics?.searchVolume)
      || number(b.card.metrics?.bid) - number(a.card.metrics?.bid)
      || blogCount(b.card) - blogCount(a.card)
      || String(a.card.id).localeCompare(String(b.card.id)))
    .map((entry) => entry.card);
}

/*
 * 지금 쓰면 트래픽이 오나(2026-10-20) — 판의 card.demand 는 앱 레포 adsense-benchmarks-trend.cjs 가 데이터랩 주별 실측으로 붙인다
 * (지금 오르는 중 · 곧 시즌 · 꾸준함 · 식는 중 · 피크 지남). 화면은 그 판정으로 순서를 정하고 '지금 써야 할 키워드'를 고른다.
 */
// 'new' = 데이터랩 기록이 최근 몇 주부터 시작된 새로 뜬 말(아이폰듀오 · 태풍 등, 2026-10-20 실측)
const HOT_VERDICTS = new Set(['new', 'rising', 'season-soon']);
const isHot = (card) => HOT_VERDICTS.has(card?.demand?.verdict);

/** 표시 묶음 — 경쟁 등급이 먼저, 같은 등급 안에서는 지금 오르는 · 곧 시즌 소재가 앞 묶음. */
export function adsenseOrderTier(card, nowMs = Date.now()) {
  return adsenseCompetition(card, nowMs).tier * 2 + (isHot(card) ? 0 : 1);
}

/** 순위대로 세운 뒤 같은 묶음 안에서만 섞는다(사장님 선택 '같은 등급 안에서만'). 원본은 바꾸지 않는다. */
export function shuffleAdsenseCards(cards, nowMs = Date.now(), seed = 0) {
  return shuffleWithinTiers(rankAdsenseCards(cards, nowMs), (c) => adsenseOrderTier(c, nowMs), seed);
}

/** 지금 써야 할 키워드 — 오르는 중 · 곧 시즌이면서 경쟁 등급 0~1(실측 · 검색 100 이상 · 문서/검색 5배 이하). 급상승 → 경쟁 낮은 순. */
export function adsenseNowPicks(cards, nowMs = Date.now(), limit = 6) {
  const verdictRank = (c) => (c.demand.verdict === 'season-soon' ? 1 : 0);
  return (Array.isArray(cards) ? cards : [])
    .filter((c) => isHot(c) && adsenseCompetition(c, nowMs).tier <= 1)
    .map((c) => ({ c, ratio: adsenseCompetition(c, nowMs).ratio ?? Infinity }))
    .sort((a, b) => verdictRank(a.c) - verdictRank(b.c) || a.ratio - b.ratio || (b.c.metrics?.searchVolume || 0) - (a.c.metrics?.searchVolume || 0))
    .slice(0, Math.max(0, limit))
    .map((x) => x.c);
}
