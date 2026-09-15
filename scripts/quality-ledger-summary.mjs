#!/usr/bin/env node
/**
 * Prints where the first pass loses points, from the quality ledger the app writes on every generation.
 *
 *   node scripts/quality-ledger-summary.mjs            # last 30 posts, default userData path
 *   node scripts/quality-ledger-summary.mjs 60         # last 60
 *   node scripts/quality-ledger-summary.mjs 30 <path>  # explicit ledger file
 *
 * Reads only. No model calls, no network.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const last = Number(process.argv[2] || 30);
const file = process.argv[3]
  || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'better-life-naver', 'content-quality-ledger.jsonl');

if (!fs.existsSync(file)) {
  console.log(`ledger not found: ${file}\n(generate a post first — the app writes one line per finalized draft)`);
  process.exit(0);
}

const entries = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).flatMap((l) => {
  try { return [JSON.parse(l)]; } catch { return []; }
}).slice(-last);

const finals = entries.map((e) => e.finalScore).filter((v) => typeof v === 'number').sort((a, b) => a - b);
const median = finals.length ? finals[Math.floor(finals.length / 2)] : null;
const tally = (pick) => {
  const out = {};
  for (const e of entries) for (const [k, n] of pick(e)) out[k] = (out[k] || 0) + n;
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
};

console.log(`ledger: ${file}`);
console.log(`posts: ${entries.length} (${entries[0]?.at?.slice(0, 10) || '-'} ~ ${entries[entries.length - 1]?.at?.slice(0, 10) || '-'})`);
console.log(`finalScore median ${median ?? '-'} | <80: ${finals.filter((v) => v < 80).length} | >=90: ${finals.filter((v) => v >= 90).length}`);
console.log(`decisions: ${JSON.stringify(Object.fromEntries(tally((e) => [[e.decision, 1]])))}`);
console.log(`quality90 miss: ${entries.filter((e) => e.quality90Miss).length}/${entries.length} | retried: ${entries.filter((e) => e.attempt > 1).length}/${entries.length}`);
console.log('top warning kinds:');
for (const [k, n] of tally((e) => Object.entries(e.warningKinds || {})).slice(0, 10)) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log('top quality90 reasons:');
for (const [k, n] of tally((e) => (e.quality90Reasons || []).map((r) => [r, 1])).slice(0, 8)) console.log(`  ${String(n).padStart(3)}  ${k}`);
