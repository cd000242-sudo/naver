/**
 * Builds the LDB "떡상 영상 보드" (YouTube popular chart + measured views per hour) at GitHub Pages deploy time.
 *
 *   node scripts/youtube-rising.mjs [--out spa/dist/data/youtube-rising.json] [--previous <deployed board url>]
 *
 * Never committed: YouTube API data must not be kept over 30 days and this repository is public. Each deploy
 * reads the board that is live now (for the views-per-hour delta), asks the API again, and writes a fresh file
 * into the deploy output only. Always exits 0 — a missing board must not stop the site deploy.
 * The API key is read from YOUTUBE_API_KEY and is never printed (request URLs are not logged).
 *
 * Sources (2026-11-10): the popular chart (14 calls) + per-genre Shorts search (youtube-rising-genres.mjs; the search
 * itself runs at most once per 6 h, in between only the numbers of the last search ids are refreshed). Everything runs
 * one request after another inside one 100 s budget (youtube-rising-fetch.mjs), under the workflow's `timeout 120`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { boardItems, buildRisingBoard, planRebuild, readPreviousBoard, splitBoard } from './lib/youtube-rising-core.mjs';
import { RUN_BUDGET_MS, createBudget, createYoutubeClient } from './lib/youtube-rising-fetch.mjs';
import { BOARD_MAX_ITEMS, GENRE_CAP, GENRE_FLOOR } from './lib/youtube-rising-genres.mjs';
import { gatherSearchItems, mergeSources } from './lib/youtube-rising-search.mjs';

const argValue = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const OUT = resolve(argValue('--out', 'spa/dist/data/youtube-rising.json'));
const PREVIOUS_URL = argValue('--previous', 'https://leaderspro.kr/data/youtube-rising.json');
const KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
/* '' = the overall chart; then the categories that carry shorts worth benchmarking (KR returns 404 for some). */
const CATEGORIES = ['', '24', '25', '22', '26', '1', '17', '20', '28', '23', '19', '15', '27', '2'];
const log = (message) => console.log(`[youtube-rising] ${message}`);
/* One time budget for the whole run (previous-board read included); see youtube-rising-fetch.mjs. */
const budget = createBudget(RUN_BUDGET_MS);

async function getJson(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

async function fetchPrevious(now) {
  try {
    const { ok, body } = await getJson(`${PREVIOUS_URL}?t=${now}`, Math.max(1, budget.timeoutFor(10_000)));
    return ok ? readPreviousBoard(body, now) : null;
  } catch {
    return null;
  }
}

/* A reused board is re-cut too: `items` must never hold more than the installed extension reads (200), the rest goes to `more`. */
function write(board, note) {
  const out = splitBoard(board);
  const all = boardItems(out);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out)}\n`, 'utf8');
  const forms = all.reduce((acc, item) => ({ ...acc, [item.form || 'unknown']: (acc[item.form || 'unknown'] || 0) + 1 }), {});
  const deltas = all.filter((item) => item.velocity === 'delta').length;
  log(`${note}: ${all.length}편 (앞 ${out.items.length} + 뒤 ${out.more.length}; 쇼츠 ${forms.short || 0} · 롱폼 ${forms.long || 0} · 모름 ${forms.unknown || 0}) · 실측 속도 ${deltas}편 · 간격 ${out.windowMin ?? '-'}분 → ${OUT}`);
}

async function main() {
  const now = Date.now();
  const previous = await fetchPrevious(now);
  const plan = planRebuild(previous, now, Boolean(KEY));
  if (plan.action === 'skip') {
    log(KEY ? '이전 보드가 없고 새로 받지 못했습니다 — 이번 배포는 보드 없이 나갑니다.' : 'YOUTUBE_API_KEY 없음 — 이번 배포는 보드 없이 나갑니다.');
    return;
  }
  if (plan.action === 'reuse') {
    write(previous, `최근 보드 재사용(${previous.builtAt})`);
    return;
  }
  const client = createYoutubeClient({ key: KEY, log, budget });
  const chart = [];
  for (const categoryId of CATEGORIES) chart.push(...(await client.fetchChart(categoryId)));
  const search = await gatherSearchItems(client, previous, now);
  log(`분야 검색: ${search.searched ? '새로 검색' : '검색은 건너뛰고 이전 검색 목록의 숫자만 갱신'} · 검색 목록 ${search.items.length}편 · 차트 ${chart.length}편`);
  const items = mergeSources(chart, search.items);
  if (items.length === 0) {
    if (previous && now - Date.parse(previous.builtAt) < 6 * 60 * 60_000) write(previous, '새로 받지 못해 최근 보드 유지');
    else log('새로 받지 못했고 6시간 안의 보드도 없습니다 — 이번 배포는 보드 없이 나갑니다.');
    return;
  }
  write(buildRisingBoard(items, previous, now, { maxItems: BOARD_MAX_ITEMS, genreCap: GENRE_CAP, genreFloor: GENRE_FLOOR, searchedAt: search.searchedAt }), '새 보드');
}

main().catch((error) => {
  log(`예상하지 못한 오류 — 보드 없이 계속합니다: ${String(error?.message || error).slice(0, 200)}`);
});
