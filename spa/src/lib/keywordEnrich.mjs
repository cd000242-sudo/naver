/*
 * 검색어 덧붙이기 읽기(2026-10-20 사장님 "시즌키워드도 오늘의 글감도 마찬가지").
 * 앱 레포 scripts/keyword-enrich.cjs(keyword-enrich.yml)가 대표 검색어마다 쌓는다 — 그래프(데이터랩 주별) · (시즌) 검색량 · 문서수 ·
 * 지식인 질문 · 이 글이 해결할 문제 · 행동 키워드 제목. 두 판은 원래 자료를 그대로 쓰고 이 파일을 검색어로 찾아 붙인다.
 * 모양이 틀린 칸은 버리고, 파일이 없으면 빈 Map(덧붙일 칸이 안 보일 뿐).
 */
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v, n, max) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
export const enrichKey = (query) => String(query || '').replace(/\s+/g, '').toLowerCase();
const VERDICTS = new Set(['new', 'rising', 'season-soon', 'steady', 'cooling', 'past-peak', 'unknown']);
const HOT = new Set(['new', 'rising', 'season-soon']);

function parseDemand(d) {
  if (!d || typeof d !== 'object' || !VERDICTS.has(d.verdict)) return undefined;
  return {
    verdict: d.verdict, label: str(d.label, 30), fact: str(d.fact, 200),
    recentChangePct: typeof d.recentChangePct === 'number' ? d.recentChangePct : null,
    lastYearNextPct: typeof d.lastYearNextPct === 'number' ? d.lastYearNextPct : null,
    series: Array.isArray(d.series) ? d.series.filter((x) => typeof x === 'number' && Number.isFinite(x)).slice(-26) : [],
    asOf: str(d.asOf, 10) || null,
  };
}

export function parseKeywordEnrich(store) {
  const out = new Map();
  const entries = store && typeof store === 'object' && store.entries && typeof store.entries === 'object' && !Array.isArray(store.entries) ? store.entries : {};
  for (const [query, e] of Object.entries(entries)) {
    if (!e || typeof e !== 'object') continue;
    const kinQuestions = (Array.isArray(e.kinQuestions) ? e.kinQuestions : [])
      .filter((q) => typeof q?.link === 'string' && /^https:\/\/kin\.naver\.com\//.test(q.link) && str(q.title, 160))
      .slice(0, 3)
      .map((q) => ({ title: str(q.title, 160), link: q.link, views: num(q.views), answers: num(q.answers), askedAt: str(q.askedAt, 20) }));
    const measure = e.measure && typeof e.measure === 'object' ? { searchVolume: num(e.measure.searchVolume), documentCount: num(e.measure.documentCount) } : undefined;
    out.set(enrichKey(query), {
      query: str(query, 60),
      demand: parseDemand(e.demand),
      measure,
      kinQuestions,
      solves: strs(e.solves, 3, 200),
      actionTitles: strs(e.actionTitles, 3, 120),
    });
  }
  return out;
}

export const isHotEnrich = (entry) => HOT.has(entry?.demand?.verdict);

/** 시즌 표시 묶음 — 지금 뜨는 소재 → 이번 달 · 다음 달(★) → 나머지. 같은 묶음 안에서만 섞는다. */
export function seasonalOrderTier(entry, planningPriority) {
  return (isHotEnrich(entry) ? 0 : 2) + (planningPriority ? 0 : 1);
}

export async function loadKeywordEnrich(fetcher = fetch) {
  try {
    const res = await fetcher('/data/keyword-enrich.json', { cache: 'no-cache' });
    return res.ok ? parseKeywordEnrich(await res.json()) : new Map();
  } catch {
    return new Map();
  }
}
