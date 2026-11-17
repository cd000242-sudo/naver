// On-demand issue briefs of the home "실시간 검색어" board (worker action issue-brief), kept for this browser tab.
// [2026-11-17 owner] "브리프가 왜 제대로 안뜨지 … 무료한도가 왜 걸리나요 충분할텐데": every keyword looked at cost one call of the free daily
// allowance, a reload asked again for the same keywords, and when the allowance ran out the board hid the refusal behind
// "관련 보도는 자동 매칭될 때만…". Two fixes live here: briefs already received are reused for 15 minutes (sessionStorage), and a
// refusal is told as it is (quotaNotice). Pure: the storage and the clock are passed in; a storage that throws reads as empty.

export const BRIEF_KEY = 'leaderspro.issueBriefs.v1';
export const BRIEF_TTL_MS = 15 * 60_000;
export const BRIEF_MAX = 60;
export const QUOTA_FALLBACK = '오늘 무료로 볼 수 있는 브리프 분량을 다 썼습니다. 라이선스를 등록하거나 내 API 키 탭에 네이버 키를 넣으면 계속 볼 수 있습니다.';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(BRIEF_KEY) || '{}');
    return isObject(parsed) ? parsed : {};
  } catch { return {}; }
}

/** keyword -> brief for every brief received within BRIEF_TTL_MS (the stored time is left out). Briefs without a fact are never kept. */
export function readBriefs(storage, now) {
  const out = {};
  for (const [keyword, row] of Object.entries(readAll(storage))) {
    if (!isObject(row) || !isObject(row.brief) || !(now - row.at < BRIEF_TTL_MS) || !(now - row.at >= 0)) continue;
    if (!Array.isArray(row.brief.facts) || row.brief.facts.length === 0) continue;
    out[keyword] = row.brief;
  }
  return out;
}

/** Remembers one received brief (only one with facts); the oldest go first when there are more than BRIEF_MAX. Never throws. */
export function rememberBrief(storage, keyword, brief, now) {
  const key = String(keyword || '').trim();
  if (!key || !isObject(brief) || !Array.isArray(brief.facts) || brief.facts.length === 0) return false;
  const fresh = Object.entries(readAll(storage)).filter(([name, row]) => name !== key && isObject(row) && now - row.at < BRIEF_TTL_MS);
  const rows = [...fresh, [key, { at: now, brief }]].sort((a, b) => b[1].at - a[1].at).slice(0, BRIEF_MAX);
  try { storage?.setItem(BRIEF_KEY, JSON.stringify(Object.fromEntries(rows))); return true; } catch { return false; }
}

/** The sentence to show when the worker refused the brief for the free allowance ('' for any other outcome). The worker's own sentence wins. */
export function quotaNotice(result) {
  if (!result || result.ok || result.error !== 'quota') return '';
  return String(result.message || '').trim() || QUOTA_FALLBACK;
}
