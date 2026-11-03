/*
 * 숏텐츠 급상승 읽기(2026-10-29 사장님 "숏텐츠 중에서 가장 빠르게 뜨는 키워드를 보여주는 기능").
 * 앱이 30분마다 /data/shortents-rising.json 으로 올린다. 토픽 순서는 앱이 이미 '가장 빠르게 뜨는 순'으로 정했으니 다시 정렬하지 않는다.
 * 모양이 틀린 칸은 버리고, 링크는 naver.com 계열 http(s) 만 살린다. 파일이 없거나 깨졌으면 빈 결과(칸이 안 보일 뿐).
 */
export const STALE_MINUTES = 90;
const STATUSES = new Set(['new', 'rising', 'steady', 'falling']);

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function naverUrl(v) {
  if (typeof v !== 'string' || v.length > 2000) return null;
  let u;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  return host === 'naver.com' || host.endsWith('.naver.com') ? v.trim() : null;
}

const EMPTY = () => ({ builtAt: null, latest: null, windows: null, topics: [] });

function parseTopic(t) {
  if (!t || typeof t !== 'object') return null;
  const keyword = str(t.keyword, 80);
  if (!keyword) return null;
  const isNew = t.isNew === true;
  return {
    keyword,
    category: str(t.category, 20),
    summary: str(t.summary, 300),
    title: str(t.title, 200),
    channel: str(t.channel, 40),
    articleUrl: naverUrl(t.articleUrl),
    searchUrl: naverUrl(t.searchUrl),
    rank: count(t.rank),
    prevRank: count(t.prevRank),
    rankDelta: num(t.rankDelta),
    isNew,
    firstSeenAt: str(t.firstSeenAt, 40) || null,
    windowsSeen: count(t.windowsSeen),
    streak: count(t.streak),
    status: STATUSES.has(t.status) ? t.status : (isNew ? 'new' : 'steady'),
    docs: count(t.docs),
    docsMeasuredAt: str(t.docsMeasuredAt, 40) || null,
  };
}

export function parseShortentsRising(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.topics)) return EMPTY();
  const l = raw.latest && typeof raw.latest === 'object' ? raw.latest : null;
  return {
    builtAt: str(raw.builtAt, 40) || null,
    latest: l ? { publishTime: str(l.publishTime, 40) || null, periodStart: str(l.periodStart, 40) || null, periodEnd: str(l.periodEnd, 40) || null } : null,
    windows: count(raw.windows),
    topics: raw.topics.map(parseTopic).filter(Boolean),
  };
}

export async function loadShortentsRising(fetcher = fetch) {
  try {
    const res = await fetcher('/data/shortents-rising.json', { cache: 'no-cache' });
    if (!res || !res.ok) return EMPTY();
    return parseShortentsRising(await res.json());
  } catch {
    return EMPTY();
  }
}

/** builtAt 으로부터 몇 분 지났나. 읽을 수 없는 시각은 stale. 90분 넘으면 앱이 꺼져 있었다고 본다. */
export function freshness(builtAt, now = new Date()) {
  const built = Date.parse(builtAt || '');
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(built) || !Number.isFinite(nowMs)) return { minutes: null, stale: true };
  const minutes = Math.max(0, Math.floor((nowMs - built) / 60000));
  return { minutes, stale: minutes > STALE_MINUTES };
}

/**
 * 분야별 묶음(2026-10-29 "카테고리별로 나눠주고"). 가장 빠른 토픽이 든 분야가 먼저 — 입력이 이미 빠른 순이라
 * 처음 나온 순서대로 분야를 세운다. 분야 안 순서도 그대로. 분야가 없으면 '기타'로 맨 뒤.
 */
export function groupByCategory(topics) {
  const groups = new Map();
  for (const topic of Array.isArray(topics) ? topics : []) {
    const category = typeof topic?.category === 'string' && topic.category.trim() ? topic.category.trim() : '기타';
    groups.set(category, [...(groups.get(category) || []), topic]);
  }
  return [...groups.entries()]
    .map(([category, list]) => ({ category, topics: list }))
    .sort((a, b) => Number(a.category === '기타') - Number(b.category === '기타'));
}
