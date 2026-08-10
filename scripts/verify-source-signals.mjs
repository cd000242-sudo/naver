#!/usr/bin/env node
/**
 * 실시간 스냅샷 검증 — 통합 상태판(scripts/status-board.mjs)의 signals 레인만 돌린다.
 *
 * 검사 논리는 scripts/status/probe-signals.mjs 한 곳에 있다. 여기에 로직을
 * 다시 적으면 두 기준이 갈라져서, 한쪽만 보고 안심하는 사고가 또 난다.
 * 이 파일이 남아 있는 이유는 refresh-public-data.yml 이 이 경로를 부르기 때문이다.
 *
 * 사용:
 *   node scripts/verify-source-signals.mjs                  로컬 파일 검사
 *   node scripts/verify-source-signals.mjs --live           배포본 검사
 *   node scripts/verify-source-signals.mjs --min-brief=90   브리프 커버리지 하한(%)
 *   node scripts/verify-source-signals.mjs --max-age=90     스냅샷 나이 상한(분)
 *   node scripts/verify-source-signals.mjs --warn-only      실패해도 exit 0 (관측용)
 *
 * 전체를 보려면: node scripts/status-board.mjs
 */
import { hasFlag } from './status/lib.mjs';
import signalsProbe from './status/probe-signals.mjs';

const MARK = { ok: 'OK  ', warn: '주의 ', fail: '실패 ', skip: '미확인' };

// 이 스크립트의 기본값은 로컬이다(--live 를 줘야 배포본). 상태판은 반대라서
// 여기서 명시적으로 넘겨 준다.
const checks = await signalsProbe.run({ mode: hasFlag('live') ? 'live' : 'local' });

console.log('='.repeat(66));
console.log('실시간 스냅샷 검증');
console.log('='.repeat(66));
for (const entry of checks) {
  console.log(`${MARK[entry.status]}  ${entry.label} — ${entry.detail}`);
  if (entry.hint && entry.status !== 'ok') console.log(`        → ${entry.hint}`);
}

const failures = checks.filter((entry) => entry.status === 'fail');
console.log('='.repeat(66));
if (failures.length === 0) {
  console.log('통과 — 모든 레인과 브리프 커버리지가 기준을 만족한다.');
  process.exit(0);
}
console.log(`문제 ${failures.length}건`);
failures.forEach((entry) => console.log(`  ❌ ${entry.label}: ${entry.detail}`));
process.exit(hasFlag('warn-only') ? 0 : 1);
