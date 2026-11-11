#!/usr/bin/env node
/**
 * [2026-11-08] Step 0 of the exposure-measurement plan — read-only baseline.
 *
 * Prints how the stored published-posts.json rows are labelled today (exposure / index-only / unknown),
 * what the keyword field really contains, and how many rows carry explicit keyword provenance.
 *
 * Safety: the file is copied into a temp dir and the COPY is read. The original is hashed before and
 * after and only read. No network. No userData writes.
 *
 * Usage: npx tsx scripts/outcome-baseline.mjs [path/to/published-posts.json] [--json]
 * Default path: %APPDATA%/better-life-naver/published-posts.json (macOS/Linux: the Electron userData dir).
 */
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function defaultSource() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config');
  return path.join(base || os.homedir(), 'better-life-naver', 'published-posts.json');
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const source = args.find((a) => !a.startsWith('--')) || defaultSource();

const pct = (n, total) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '-');

async function main() {
  const module = await import(pathToFileURL(resolve(ROOT, 'src/analytics/outcomeBaseline.ts')).href);
  const result = module.copyAndSummarizeBaseline(source);
  const afterSha = createHash('sha256').update(readFileSync(source)).digest('hex');
  const untouched = afterSha === result.originalSha256;
  const s = result.summary;

  if (asJson) {
    console.log(JSON.stringify({ source, untouched, originalSha256: result.originalSha256, summary: s }, null, 2));
    process.exitCode = untouched ? 0 : 1;
    return;
  }

  console.log(`기준 성적표 (읽기 전용 사본) — ${source}`);
  console.log(`  원본 해시 ${result.originalSha256.slice(0, 16)}… / 사본 일치 ${result.copySha256 === result.originalSha256} / 원본 변경 없음 ${untouched}`);
  console.log(`\n[글 단위 측정 라벨] 총 ${s.total}편`);
  for (const key of ['exposure', 'index-only', 'unknown']) {
    console.log(`  ${key.padEnd(11)} ${String(s.labels[key]).padStart(4)}편  ${pct(s.labels[key], s.total)}`);
  }
  console.log('\n[저장된 keyword 칸 내용]');
  for (const key of ['real', 'blank', 'same-as-title', 'sentence-like']) {
    console.log(`  ${key.padEnd(14)} ${String(s.keywordField[key]).padStart(4)}편  ${pct(s.keywordField[key], s.total)}`);
  }
  console.log(`\n[2026-09-16 이후] 총 ${s.since0916.total}편`);
  for (const key of ['real', 'blank', 'same-as-title', 'sentence-like']) {
    console.log(`  ${key.padEnd(14)} ${String(s.since0916[key]).padStart(4)}편  ${pct(s.since0916[key], s.since0916.total)}`);
  }
  console.log('\n[키워드 출처 기록 keywordSource]');
  for (const key of ['user-input', 'leword', 'schedule-job', 'none', 'not-recorded']) {
    console.log(`  ${key.padEnd(13)} ${String(s.keywordSource[key]).padStart(4)}편`);
  }
  const c = s.calibration;
  console.log(`\n[보정(calibration)이 쓰는 정답] 노출 ${c.exposed} + 미노출 ${c.notExposed} = ${c.usable}편 사용 가능, 판정 불가 ${c.unknown}편`);
  process.exitCode = untouched ? 0 : 1;
}

main().catch((error) => {
  console.error(`기준 성적표 실패: ${error?.message || error}`);
  process.exitCode = 1;
});
