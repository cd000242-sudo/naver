/*
 * 곧 뜰 숏텐츠 후보 읽기(2026-10-30 사장님 "곧 뜰 숏텐츠를 우리 숏텐츠에 접목").
 * 앱이 10분마다 /data/shortents-upcoming.json 으로 올린다 — 실시간 급상승어 중 아직 숏텐츠에 없는 말을 뉴스 최신순으로 잰 숫자와
 * 적중 장부(후보로 올린 말이 나중에 숏텐츠에 떴는지)뿐이다. 확률 · 점수는 없다. 순서는 앱이 정한 그대로.
 * 모양이 틀린 칸은 버리고, 기사 링크는 http(s) 만 살린다. 파일이 없거나 깨졌으면 빈 결과.
 */
export const UPCOMING_STALE_MINUTES = 30;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function httpUrl(v) {
  if (typeof v !== 'string' || v.length > 2000) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

const EMPTY = () => ({ builtAt: null, measured: null, rule: null, candidates: [], hitRate: null });

function parseSample(s) {
  if (!s || typeof s !== 'object') return null;
  const title = str(s.title, 200);
  if (!title) return null;
  return { title, press: str(s.press, 80) || null, publishedAt: str(s.publishedAt, 40) || null, link: httpUrl(s.link) };
}

function parseCandidate(c) {
  if (!c || typeof c !== 'object') return null;
  const keyword = str(c.keyword, 80);
  if (!keyword) return null;
  return {
    keyword,
    sources: Array.isArray(c.sources) ? c.sources.map((s) => str(s, 20)).filter(Boolean).slice(0, 6) : [],
    articles90: count(c.articles90),
    recent20: count(c.recent20),
    press: count(c.press),
    firstArticleAt: str(c.firstArticleAt, 40) || null,
    exclusive: c.exclusive === true,
    capped: c.capped === true,
    samples: (Array.isArray(c.samples) ? c.samples : []).map(parseSample).filter(Boolean).slice(0, 3),
  };
}

function parseHitRate(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const flagged = count(h.flagged);
  const matched = count(h.matched);
  if (flagged === null || matched === null) return null;
  return {
    days: count(h.days) ?? 7,
    flagged,
    matched,
    avgLeadMin: count(h.avgLeadMin),
    recent: (Array.isArray(h.recent) ? h.recent : [])
      .map((r) => (r && typeof r === 'object' && str(r.keyword, 80) && str(r.hitKeyword, 80)
        ? { keyword: str(r.keyword, 80), hitKeyword: str(r.hitKeyword, 80), hitAt: str(r.hitAt, 40) || null, leadMin: count(r.leadMin) }
        : null))
      .filter(Boolean)
      .slice(0, 10),
  };
}

export function parseShortentsUpcoming(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.candidates)) return EMPTY();
  const r = raw.rule && typeof raw.rule === 'object' ? raw.rule : null;
  return {
    builtAt: str(raw.builtAt, 40) || null,
    measured: count(raw.measured),
    rule: r ? { windowMin: count(r.windowMin), recentMin: count(r.recentMin), minArticles: count(r.minArticles), minPress: count(r.minPress) } : null,
    candidates: raw.candidates.map(parseCandidate).filter(Boolean),
    hitRate: parseHitRate(raw.hitRate),
  };
}

export async function loadShortentsUpcoming(fetcher = fetch) {
  try {
    const res = await fetcher('/data/shortents-upcoming.json', { cache: 'no-cache' });
    if (!res || !res.ok) return EMPTY();
    return parseShortentsUpcoming(await res.json());
  } catch {
    return EMPTY();
  }
}

/** builtAt 으로부터 몇 분 지났나. 10분 갱신이라 30분 넘으면 앱이 꺼져 있었다고 본다. */
export function upcomingFreshness(builtAt, now = Date.now()) {
  const built = Date.parse(builtAt || '');
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(built) || !Number.isFinite(nowMs)) return { minutes: null, stale: true };
  const minutes = Math.max(0, Math.floor((nowMs - built) / 60000));
  return { minutes, stale: minutes > UPCOMING_STALE_MINUTES };
}
