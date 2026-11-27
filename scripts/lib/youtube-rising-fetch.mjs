/**
 * YouTube Data API calls for the "떡상 영상 보드" (chart, per-genre search, id → numbers). `fetch` is injected so the
 * tests never touch the network. Request URLs, the key and error messages are never logged — only labels, HTTP
 * status, the API's error reason and the error name.
 *
 * Time: requests run one after another, each with its own timeout (REQUEST_TIMEOUT_MS) and all of them share one run
 * budget (RUN_BUDGET_MS = 100 s, previous-board read included). Typical run = 14 chart + 13 search + up to 14
 * videos.list calls (~41 x 0.3-0.5 s = 12-21 s); when the budget is spent the remaining calls are skipped, so the
 * script always ends inside the workflow's `timeout 120`.
 */
import { normalizeVideo } from './youtube-rising-core.mjs';
import { DEFAULT_DURATION } from './youtube-rising-genres.mjs';

export const RUN_BUDGET_MS = 100_000;
export const REQUEST_TIMEOUT_MS = 15_000;
const API = 'https://www.googleapis.com/youtube/v3';
const VIDEO_PARTS = 'snippet,statistics,contentDetails,player';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const IDS_PER_CALL = 50;

/** Remaining-time helper: timeoutFor(cap) = min(cap, time left), 0 once the budget is spent. */
export function createBudget(totalMs, clock = Date.now) {
  const end = clock() + totalMs;
  return { timeoutFor: (capMs) => Math.max(0, Math.min(capMs, end - clock())) };
}

const encode = (value) => encodeURIComponent(value).replace(/%2C/g, ',');
const queryOf = (params) => Object.entries(params).map(([name, value]) => `${name}=${encode(value)}`).join('&');
const videosOf = (items) => (items || []).map((item) => normalizeVideo(item)).filter(Boolean);

export function createYoutubeClient({ key, fetchImpl = fetch, log = () => {}, budget = createBudget(RUN_BUDGET_MS) }) {
  /** Resource list of one call, or null when the call failed (the reason is logged under `label`). */
  async function request(label, path, params) {
    const timeoutMs = budget.timeoutFor(REQUEST_TIMEOUT_MS);
    if (timeoutMs <= 0) {
      log(`${label}: 시간 예산 소진 — 건너뜀`);
      return null;
    }
    try {
      const response = await fetchImpl(`${API}/${path}?${queryOf({ ...params, key })}`, {
        signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.items)) {
        const reason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || '').slice(0, 60);
        log(`${label}: 받지 못함 (HTTP ${response.status}${reason ? ` · ${reason}` : ''})`);
        return null;
      }
      return body.items;
    } catch (error) {
      log(`${label}: 요청 실패 (${String(error?.name || 'Error')})`);
      return null;
    }
  }

  return {
    /** Popular chart of one category ('' = overall) → normalized items ([] on failure). */
    async fetchChart(categoryId) {
      const params = { part: VIDEO_PARTS, chart: 'mostPopular', regionCode: 'KR', maxResults: 50, maxWidth: 360 };
      const items = await request(categoryId ? `카테고리 ${categoryId}` : '전체', 'videos', categoryId ? { ...params, videoCategoryId: categoryId } : params);
      return videosOf(items);
    },
    /**
     * Top viewed videos of one genre row since `publishedAfter` → video ids, or null when the search failed. The row says
     * how it searches: `duration` (default 'short'), `categoryId` → videoCategoryId and `q` are sent only when the row has them.
     */
    async searchGenre(genre, publishedAfter) {
      const items = await request(`검색 ${genre.id}`, 'search', {
        part: 'id', type: 'video', order: 'viewCount', videoDuration: genre.duration || DEFAULT_DURATION, regionCode: 'KR',
        relevanceLanguage: 'ko', maxResults: 50, publishedAfter,
        ...(genre.categoryId ? { videoCategoryId: genre.categoryId } : {}),
        ...(genre.q ? { q: genre.q } : {}),
      });
      if (items === null) return null;
      return [...new Set(items.map((item) => String(item?.id?.videoId || '')).filter((id) => VIDEO_ID.test(id)))];
    },
    /** Fresh numbers for known ids, 50 per call (1 unit each) → normalized items; ids that were not returned are absent. */
    async fetchVideos(ids) {
      const valid = ids.filter((id) => VIDEO_ID.test(id));
      const calls = Array.from({ length: Math.ceil(valid.length / IDS_PER_CALL) }, (_, n) => valid.slice(n * IDS_PER_CALL, (n + 1) * IDS_PER_CALL));
      const out = [];
      for (const [n, chunk] of calls.entries()) {
        out.push(...videosOf(await request(`영상 숫자 ${n + 1}/${calls.length}`, 'videos', { part: VIDEO_PARTS, maxWidth: 360, id: chunk.join(',') })));
      }
      return out;
    },
  };
}
