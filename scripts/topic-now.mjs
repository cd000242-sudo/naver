#!/usr/bin/env node
/**
 * Hourly "topic now" board — spa/public/data/topic-now.json (served as https://leaderspro.kr/data/topic-now.json).
 *
 * For each of the 32 Naver blog topics it re-measures up to 5 strong candidates right now:
 *   searchVolume   Naver search ad API monthly searches (PC + mobile)
 *   documentCount  Naver search API blog total
 *   daily          Naver DataLab daily search trend, 14 complete days ending yesterday (KST)
 * Candidates come from boards already in the repo (preemption seats, today's briefs, today's picks).
 *
 * Runs inside refresh-public-data.yml (every 15 minutes) but rebuilds at most once per hour, and stops
 * calling DataLab at DATALAB_DAILY_CAP calls per Korean day. Missing keys or a failed run keep the previous file.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDailyTrends, hasDatalabCredentials } from './lib/naver-datalab.mjs';
import { fetchDocumentCount, fetchVolumes, missingNaverCredentials, sleep } from './lib/naver-measure.mjs';
import { DATALAB_DAILY_CAP, DATALAB_GROUPS_PER_CALL, buildBoard, chunk, hasMeasurements, isDue, kstDateKey, pickCandidates, trendWindow, usedToday } from './lib/topic-now-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'spa', 'public', 'data');
const OUT = join(DATA, 'topic-now.json');
const compact = value => String(value ?? '').replace(/\s+/g, '').toLowerCase();

function readJson(name) {
  const file = join(DATA, name);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

async function measureVolumes(keywords) {
  const volumes = new Map();
  for (const group of chunk(keywords, 5)) {
    const found = await fetchVolumes(group); // keys come back without spaces (Latin letters may be upper case)
    const byKey = new Map([...found].map(([name, value]) => [compact(name), value]));
    for (const keyword of group) {
      const value = byKey.get(compact(keyword));
      if (Number.isFinite(value)) volumes.set(compact(keyword), value);
    }
    await sleep(150);
  }
  return volumes;
}

async function measureDocs(keywords) {
  const docs = new Map();
  for (const keyword of keywords) {
    const total = await fetchDocumentCount(keyword);
    if (Number.isFinite(total)) docs.set(compact(keyword), total);
    await sleep(110); // the blog search API rejects bursts (429)
  }
  return docs;
}

async function main() {
  const now = Date.now();
  const previous = readJson('topic-now.json');
  if (!isDue(previous, now)) { console.log(`topic-now: ${previous.builtAt} 에 만든 판이 1시간이 안 됐다 — 건너뜀`); return; }
  const missing = missingNaverCredentials();
  if (missing.length) { console.log(`topic-now: 자격증명 없음(${missing.join(', ')}) — 기존 파일 유지`); return; }

  const candidates = pickCandidates({ picks: readJson('today-picks.json'), preemption: readJson('preemption-board.json'), briefs: readJson('topic-briefs.json') }, { now });
  if (!candidates.length) { console.log('topic-now: 후보 없음 — 기존 파일 유지'); return; }
  const keywords = candidates.map(row => row.keyword);
  const window = trendWindow(now);
  const spent = usedToday(previous, now);
  const needed = Math.ceil(new Set(keywords).size / DATALAB_GROUPS_PER_CALL);
  const allowed = Math.max(0, Math.min(needed, DATALAB_DAILY_CAP - spent));

  const [volumes, docs] = [await measureVolumes(keywords), await measureDocs(keywords)];
  const trend = hasDatalabCredentials(process.env) && allowed > 0
    ? await fetchDailyTrends(keywords, { ...window, maxCalls: allowed })
    : { trends: new Map(), calls: 0, error: allowed > 0 ? 'no-keys' : 'quota-cap' };

  const board = buildBoard({
    now, candidates, window,
    measurements: { volumes, docs, trends: trend.trends },
    usage: { date: kstDateKey(now), datalabCalls: spent + trend.calls },
    status: { candidates: candidates.length, volumes: volumes.size, docs: docs.size, trends: trend.trends.size, datalab: trend.error || 'ok' },
  });
  if (!hasMeasurements(board)) { console.log('topic-now: 잰 값이 하나도 없다 — 기존 파일 유지'); return; }
  writeFileSync(OUT, `${JSON.stringify(board)}\n`);
  console.log(`topic-now: 후보 ${candidates.length} · 검색량 ${volumes.size} · 문서수 ${docs.size} · 추이 ${trend.trends.size} · 데이터랩 오늘 ${board.usage.datalabCalls}회(${board.status.datalab})`);
}

main().catch(error => { console.error('topic-now 실패:', (error && error.message) || error); process.exitCode = 1; });
