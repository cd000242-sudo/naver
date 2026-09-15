#!/usr/bin/env node
/**
 * Re-pins docs/content-quality-v3/legacy-baseline.json after a reviewed change to a pinned legacy file.
 *
 * Why this exists: contentQualityLegacyBaseline.test.ts pins the bytes of 110 legacy prompt/assembler/
 * evaluator files. Any edit to one of them fails the release gate until the pin is refreshed, and until
 * now the refresh was manual. Mirrors scripts/fingerprint-pin.mjs: dry-run by default, --write to apply.
 *
 *   node scripts/legacy-baseline-pin.mjs           # show what drifted
 *   node scripts/legacy-baseline-pin.mjs --write   # re-pin
 *
 * The file allow-list is never widened here — it keeps exactly the paths already pinned, so a new file
 * has to be added deliberately by editing the JSON.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const WRITE = process.argv.includes('--write');
const BASELINE_PATH = resolve(process.cwd(), 'docs', 'content-quality-v3', 'legacy-baseline.json');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
const drifted = [];
const files = [];

for (const entry of baseline.files) {
  const bytes = await readFile(resolve(process.cwd(), entry.path));
  const hash = sha256(bytes);
  if (hash !== entry.sha256) drifted.push(entry.path);
  // Keep the entry's existing shape — the field is `bytes`; inventing a new key rewrites all 110 rows.
  files.push({ ...entry, sha256: hash, bytes: bytes.byteLength });
}

if (drifted.length === 0) {
  console.log('✅ 레거시 베이스라인 일치 — 갱신할 것이 없습니다');
  process.exit(0);
}

console.log(`⚠️ 바뀐 파일 ${drifted.length}개:`);
for (const path of drifted) console.log(`   ● ${path}`);

if (!WRITE) {
  console.log('\n   검토된 변경이면 --write 로 핀을 갱신하세요.');
  process.exit(1);
}

let repositoryHead = baseline.metadata?.repositoryHead;
try {
  repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // keep the previous head when git is unavailable — the test only checks the shape
}

const next = {
  ...baseline,
  files: files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
  metadata: { ...baseline.metadata, repositoryHead, nodeVersion: process.version },
};
await writeFile(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`\n💾 핀 갱신 완료 — ${files.length}개 파일`);
/*
 * The pin lives in three places and the gate checks all three. Re-pinning this file changes the file's own
 * hash, which is pinned again inside the evidence-attestation test — miss it and the release gate stops at
 * step 1 after a full test run (~2 minutes wasted). Print the next step instead of letting it be rediscovered.
 */
console.log('\n⚠️ 남은 두 곳도 함께 갱신해야 게이트가 통과합니다:');
console.log('   1) npx tsx scripts/fingerprint-pin.mjs --write        (V3 런타임 지문)');
console.log('   2) src/__tests__/contentQualityV3EvidenceAttestation.test.ts 의 legacyBaselineSha256');
console.log(`      → 이 파일의 새 해시: ${sha256(await readFile(BASELINE_PATH))}`);
