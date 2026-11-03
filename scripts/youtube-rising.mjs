/**
 * Builds the LDB "떡상 영상 보드" (YouTube popular chart + measured views per hour) at GitHub Pages deploy time.
 *
 *   node scripts/youtube-rising.mjs [--out spa/dist/data/youtube-rising.json] [--previous <deployed board url>]
 *
 * Never committed: YouTube API data must not be kept over 30 days and this repository is public. Each deploy
 * reads the board that is live now (for the views-per-hour delta), asks the API again, and writes a fresh file
 * into the deploy output only. Always exits 0 — a missing board must not stop the site deploy.
 * The API key is read from YOUTUBE_API_KEY and is never printed (request URLs are not logged).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CATEGORY_NAMES, buildRisingBoard, normalizeVideo, planRebuild, readPreviousBoard } from './lib/youtube-rising-core.mjs';

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

async function getJson(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

async function fetchPrevious(now) {
  try {
    const { ok, body } = await getJson(`${PREVIOUS_URL}?t=${now}`, 10_000);
    return ok ? readPreviousBoard(body, now) : null;
  } catch {
    return null;
  }
}

async function fetchChart(categoryId) {
  const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,player'
    + `&chart=mostPopular&regionCode=KR&maxResults=50&maxWidth=360${categoryId ? `&videoCategoryId=${categoryId}` : ''}&key=${encodeURIComponent(KEY)}`;
  const label = categoryId ? `카테고리 ${categoryId}` : '전체';
  try {
    const { ok, status, body } = await getJson(url, 15_000);
    if (!ok || !Array.isArray(body?.items)) {
      const reason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || '').slice(0, 60);
      log(`${label}: 받지 못함 (HTTP ${status}${reason ? ` · ${reason}` : ''})`);
      return [];
    }
    return body.items.map((item) => normalizeVideo(item, CATEGORY_NAMES[categoryId || item?.snippet?.categoryId] || ''));
  } catch (error) {
    log(`${label}: 요청 실패 (${String(error?.name || 'Error')})`);
    return [];
  }
}

function write(board, note) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(board)}\n`, 'utf8');
  const forms = board.items.reduce((acc, item) => ({ ...acc, [item.form || 'unknown']: (acc[item.form || 'unknown'] || 0) + 1 }), {});
  const deltas = board.items.filter((item) => item.velocity === 'delta').length;
  log(`${note}: ${board.items.length}편 (쇼츠 ${forms.short || 0} · 롱폼 ${forms.long || 0} · 모름 ${forms.unknown || 0}) · 실측 속도 ${deltas}편 · 간격 ${board.windowMin ?? '-'}분 → ${OUT}`);
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
  const items = [];
  for (const categoryId of CATEGORIES) items.push(...(await fetchChart(categoryId)));
  if (items.filter(Boolean).length === 0) {
    if (previous && now - Date.parse(previous.builtAt) < 6 * 60 * 60_000) write(previous, '새로 받지 못해 최근 보드 유지');
    else log('새로 받지 못했고 6시간 안의 보드도 없습니다 — 이번 배포는 보드 없이 나갑니다.');
    return;
  }
  write(buildRisingBoard(items, previous, now), '새 보드');
}

main().catch((error) => {
  log(`예상하지 못한 오류 — 보드 없이 계속합니다: ${String(error?.message || error).slice(0, 200)}`);
});
