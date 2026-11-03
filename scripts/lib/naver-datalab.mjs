/**
 * Naver DataLab search trend (daily) for many keywords, 5 keyword groups per call.
 *
 * Each keyword is its own group, so DataLab scales every group in one call against the largest value in
 * that call. The shape of each keyword's own line is preserved, which is all the extension needs
 * (recent 7 days vs the 7 days before). Values Naver does not return stay missing; nothing is estimated.
 *
 * Uses the developer-center keys (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET). Quota: 1,000 calls per day.
 */
import { chunk, fillDays, DATALAB_GROUPS_PER_CALL } from './topic-now-core.mjs';

const URL = 'https://openapi.naver.com/v1/datalab/search';
const compact = value => String(value ?? '').replace(/\s+/g, '').toLowerCase();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export const hasDatalabCredentials = env => Boolean(String(env.NAVER_CLIENT_ID || '').trim() && String(env.NAVER_CLIENT_SECRET || '').trim());

/**
 * keywords: string[]. options: { startDate, endDate, maxCalls, env, fetchImpl, gapMs }.
 * Returns { trends: Map(compact keyword → number[] one value per day), calls, error } — error is the first failure (HTTP status text), if any.
 * Stops at maxCalls. A failed call does not stop the others.
 */
export async function fetchDailyTrends(keywords, { startDate, endDate, maxCalls = Infinity, env = process.env, fetchImpl = globalThis.fetch, gapMs = 120 } = {}) {
  const trends = new Map();
  let calls = 0, error = '';
  if (!hasDatalabCredentials(env)) return { trends, calls, error: 'no-keys' };
  const headers = {
    'X-Naver-Client-Id': String(env.NAVER_CLIENT_ID).trim(),
    'X-Naver-Client-Secret': String(env.NAVER_CLIENT_SECRET).trim(),
    'Content-Type': 'application/json',
  };
  for (const group of chunk([...new Set(keywords)], DATALAB_GROUPS_PER_CALL)) {
    if (calls >= maxCalls) { error = error || 'quota-cap'; break; }
    const body = { startDate, endDate, timeUnit: 'date', keywordGroups: group.map(keyword => ({ groupName: keyword, keywords: [keyword] })) };
    calls += 1;
    try {
      const response = await fetchImpl(URL, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) { error = error || `HTTP ${response.status}`; continue; }
      const data = await response.json();
      for (const result of (data && data.results) || []) {
        const points = fillDays(result.data, { startDate, endDate });
        if (points.length) trends.set(compact(result.title), points);
      }
    } catch (failure) {
      error = error || String((failure && failure.message) || failure).slice(0, 80);
    }
    if (gapMs) await wait(gapMs);
  }
  return { trends, calls, error };
}
