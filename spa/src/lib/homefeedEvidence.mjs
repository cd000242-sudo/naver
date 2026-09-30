/**
 * 벤치마크 판 × 실측 홈판 기록(2026-10-01, 사장님 "1번 2번 3번 전부").
 *
 * 재료는 사장님 PC 앱의 어드바이저 실측(로그인 세션)이다 — 앱 브리지나 비밀번호로 잠근 동기화로 받는다.
 *  ① 실제 홈판 상위: 어제 홈판 유입 상위 20(homefeedTitles) + 최근 7일(homefeedWeek, 앱 v2.49.145+)
 *  ③ 내 블로그 홈판 유입 글: 여러 날에서 모은 목록(myHomefeedHits, 앱 v2.49.145+), 옛 앱이면 어제 글별 유입(posts)
 * 판정은 확률이 아니라 확인된 사실만 — 같은 글이면 same-post, 판과 같은 묶기 규칙으로 같은 소재면 similar.
 * 순수 함수 · 네트워크 없음.
 */
import { groupTokens, sameStory } from './homefeedLive.mjs';

const httpsUrl = (url) => String(url || '').trim().replace(/^http:\/\//, 'https://').replace(/[?#].*$/, '');

function homefeedRows(daily) {
  if (!daily || typeof daily !== 'object') return [];
  const rows = [
    ...(Array.isArray(daily.homefeedTitles) ? daily.homefeedTitles.map((t, i) => ({ day: daily.day, rank: i + 1, title: t.title, url: t.url })) : []),
    ...(Array.isArray(daily.homefeedWeek) ? daily.homefeedWeek : []),
  ].filter((r) => r && typeof r.title === 'string' && r.title.trim());
  const seen = new Set();
  return rows.filter((r) => { const key = httpsUrl(r.url) || r.title; if (seen.has(key)) return false; seen.add(key); return true; })
    .map((r) => ({ day: String(r.day || ''), rank: Number(r.rank) || null, title: r.title, url: httpsUrl(r.url), terms: groupTokens(r.title) }));
}
function myRows(daily) {
  if (!daily || typeof daily !== 'object') return [];
  const hits = Array.isArray(daily.myHomefeedHits) ? daily.myHomefeedHits
    : (Array.isArray(daily.posts) ? daily.posts : []).filter((p) => p && p.homefeed && p.homefeed.count > 0).map((p) => ({ title: p.title, day: daily.day, count: p.homefeed.count }));
  return hits.filter((h) => h && typeof h.title === 'string' && h.title.trim()).map((h) => ({ title: h.title, day: String(h.day || ''), count: Number(h.count) || 0, terms: groupTokens(h.title) }));
}

/** 카드마다 evidence: { homefeed, mine } 를 붙인 새 배열. 기록이 없으면 둘 다 null. */
export function annotateEvidence(candidates, daily) {
  const homefeed = homefeedRows(daily);
  const mine = myRows(daily);
  return (candidates || []).map((c) => {
    const urls = new Set((c.sources || []).map((s) => httpsUrl(s.url)).filter(Boolean));
    const terms = [c.title, ...(c.sources || []).map((s) => s.title)].filter(Boolean).map((t) => groupTokens(t)).filter((t) => t.length >= 2);
    const same = homefeed.find((h) => h.url && urls.has(h.url));
    const similar = same ? null : homefeed.find((h) => h.terms.length >= 2 && terms.some((t) => sameStory(t, h.terms)));
    const hit = same || similar;
    const my = mine.find((m) => m.terms.length >= 2 && terms.some((t) => sameStory(t, m.terms)));
    return {
      ...c,
      evidence: {
        homefeed: hit ? { kind: same ? 'same-post' : 'similar', day: hit.day, rank: hit.rank, title: hit.title, url: hit.url } : null,
        mine: my ? { title: my.title, day: my.day, count: my.count } : null,
      },
    };
  });
}

/** 화면 머리에 적을 요약 — 실측 홈판 제목 몇 개 · 며칠치 · 내 홈판 글 몇 개. 기록이 없으면 null. */
export function evidenceSummary(daily) {
  const rows = homefeedRows(daily);
  if (!rows.length && !myRows(daily).length) return null;
  const days = [...new Set(rows.map((r) => r.day).filter(Boolean))].sort();
  return { homefeedTitles: rows.length, days: days.length, from: days[0] || null, to: days[days.length - 1] || null, myHits: myRows(daily).length };
}
