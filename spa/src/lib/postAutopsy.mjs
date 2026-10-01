/**
 * 0명 글 부검(2026-10-01) — 사장님 "하루 3~10개 쓰는데 0명 본 글이 너무 많다, 뭐가 문제인지 하나하나 뜯어 달라".
 *
 * 재료는 사용자 PC 앱이 본인 로그인으로 모은 사실(앱 utils/advisor/autopsy-history.ts):
 * 최근 14일 내 글(조회 · 발행 시각 · 검색 허용 · 차단)과 같은 기간 전체 홈판 상위 20(발행 시각 포함).
 * 판정은 확인된 사실만 말한다 — "제목 때문"처럼 증명 못 하는 원인은 붙이지 않는다.
 *   blocked     네이버가 막은 글
 *   late        같은 소재가 그날(또는 다음 날) 홈판에 올랐고, 그 글이 1시간 넘게 먼저 나왔다
 *   outtitled   같은 소재가 홈판에 올랐는데 내가 먼저거나 비슷하게 썼다 — 두 글을 나란히 비교할 거리
 *   no-homefeed 그날 홈판 기록은 있는데 같은 소재가 없었다
 *   unknown     그날 홈판 기록이 없다(앱이 못 모은 날)
 * 같은 소재 판정은 벤치마크 판과 같은 묶기 규칙(homefeedLive.mjs sameStory). 순수 함수 · 네트워크 없음.
 */
import { groupTokens, sameStory } from './homefeedLive.mjs';

const KST_MS = 9 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;
/** 이만큼 먼저 나와야 '먼저 썼다'고 말한다 — 몇 분 차이는 동시로 본다. */
const LATE_MINUTES = 60;
/** 내 독자가 몰리는 시간 — 월평균 상위 6시간. */
const PEAK_HOURS = 6;

const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 24 * HOUR_MS).toISOString().slice(0, 10);
const kstHour = (iso) => new Date(Date.parse(iso) + KST_MS).getUTCHours();
const time = (iso) => (iso && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null);

/** 월평균 기준 상위 시간(오름차순). 기록이 없거나 전부 0 이면 빈 배열. */
function peakHours(myHours) {
  const rows = (Array.isArray(myHours) ? myHours : []).filter((h) => Number.isFinite(h?.hour) && Number.isFinite(h?.monthAverage));
  if (!rows.some((h) => h.monthAverage > 0)) return [];
  return [...rows].sort((a, b) => b.monthAverage - a.monthAverage || a.hour - b.hour).slice(0, PEAK_HOURS).map((h) => h.hour).sort((a, b) => a - b);
}

function flagsOf(post, peaks) {
  const flags = [];
  if (!post.searchable) flags.push({ kind: 'no-search' });
  if (peaks.length && post.publishedAt && !post.approxTime) {
    const hour = kstHour(post.publishedAt);
    if (!peaks.includes(hour)) flags.push({ kind: 'off-hours', publishedHour: hour, peakHours: peaks });
  }
  return flags;
}

/** 발행 뒤 마지막 기록일(KST) 끝까지 몇 시간. 발행 시각을 모르면 null. */
function hoursTracked(post, to) {
  const at = time(post.publishedAt);
  if (at === null || !to) return null;
  const end = Date.parse(`${nextDay(to)}T00:00:00Z`) - KST_MS;
  return Math.max(0, Math.round((end - at) / HOUR_MS));
}

function verdictOf(post, homefeedByDay) {
  if (post.blocked) return { verdict: 'blocked', match: null, dayTop: [] };
  const days = [post.publishedOn, nextDay(post.publishedOn)];
  const sameDay = homefeedByDay.get(post.publishedOn) || [];
  const terms = groupTokens(post.title);
  const candidates = days.flatMap((day) => homefeedByDay.get(day) || []);
  const hit = terms.length >= 2 ? candidates.find((row) => row.terms.length >= 2 && sameStory(terms, row.terms)) : null;
  if (hit) {
    const mine = time(post.publishedAt);
    const theirs = time(hit.publishedAt);
    const leadMinutes = mine !== null && theirs !== null ? Math.round((mine - theirs) / 60000) : null;
    const match = { day: hit.day, rank: hit.rank, title: hit.title, url: hit.url, publishedAt: hit.publishedAt || null, leadMinutes };
    return { verdict: leadMinutes !== null && leadMinutes >= LATE_MINUTES ? 'late' : 'outtitled', match, dayTop: [] };
  }
  if (!sameDay.length) return { verdict: 'unknown', match: null, dayTop: [] };
  const dayTop = [...sameDay].sort((a, b) => a.rank - b.rank).slice(0, 3).map(({ terms: _terms, ...row }) => row);
  return { verdict: 'no-homefeed', match: null, dayTop };
}

/**
 * 사실 묶음 → { zero: 부검 행[], summary }. 부검 대상은 발행일부터 기록이 완전하고 조회 0 인 글.
 * 행: { post, verdict, match, dayTop, flags, hoursTracked }.
 */
export function autopsyPosts(facts, { myHours = [] } = {}) {
  const posts = Array.isArray(facts?.posts) ? facts.posts : [];
  const homefeedByDay = new Map();
  for (const row of Array.isArray(facts?.homefeed) ? facts.homefeed : []) {
    if (!row?.day || !row.title) continue;
    homefeedByDay.set(row.day, [...(homefeedByDay.get(row.day) || []), { ...row, terms: groupTokens(row.title) }]);
  }
  for (const rows of homefeedByDay.values()) rows.sort((a, b) => a.rank - b.rank);
  const peaks = peakHours(myHours);
  const complete = posts.filter((p) => p.viewsComplete && p.views !== null);
  const zero = complete.filter((p) => p.views === 0).map((post) => ({
    post,
    ...verdictOf(post, homefeedByDay),
    flags: flagsOf(post, peaks),
    hoursTracked: hoursTracked(post, facts?.to),
  }));
  const verdicts = {};
  for (const row of zero) verdicts[row.verdict] = (verdicts[row.verdict] || 0) + 1;
  return { zero, summary: { posts: posts.length, complete: complete.length, zero: zero.length, incomplete: posts.length - complete.length, verdicts } };
}
