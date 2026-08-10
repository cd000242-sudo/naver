#!/usr/bin/env node
/**
 * 통합 상태판 — 한 번 돌리면 지금 어디가 약한지 한 화면에 나온다.
 *
 * 왜 만들었나:
 *   정책 레인 0건, 어드민 저장 마비, 다운로드 URL 빈값, 로그인 불가.
 *   넷 다 HTTP 200 을 돌려주면서 조용히 죽었고, 며칠 뒤 또는 구매자 신고로 알았다.
 *   화면이 안 알려주면 사람이 매번 다른 곳을 눌러 봐야 하는데, 그게 안 된다.
 *
 * 레인 순서는 손해 크기 순이다. 구매 흐름이 맨 위에 있는 이유는 매출이
 * 직접 걸려 있고 실제로 사고가 났기 때문이다.
 *
 * 사용:
 *   node scripts/status-board.mjs                 전체 점검
 *   node scripts/status-board.mjs --lane=purchase 구매 흐름만
 *   node scripts/status-board.mjs --local         스냅샷은 로컬 파일로 검사
 *   node scripts/status-board.mjs --json          기계용 출력
 *   node scripts/status-board.mjs --warn-only     실패해도 exit 0 (관측용)
 */
import { argValue, hasFlag } from './status/lib.mjs';
import purchaseProbe from './status/probe-purchase.mjs';
import adminProbe from './status/probe-admin.mjs';
import signalsProbe from './status/probe-signals.mjs';
import contentProbe from './status/probe-content.mjs';
import keywordProbe from './status/probe-keyword.mjs';
import deployProbe from './status/probe-deploy.mjs';

/** 손해 크기 순. 위에 있을수록 먼저 고쳐야 하는 것이다. */
const PROBES = [purchaseProbe, adminProbe, signalsProbe, contentProbe, keywordProbe, deployProbe];

const MARK = { ok: '  OK  ', warn: ' 주의 ', fail: ' 실패 ', skip: ' 미확인 ' };
const WIDTH = 78;

function selectProbes() {
  const requested = argValue('lane', '');
  if (!requested) return PROBES;
  const wanted = new Set(requested.split(',').map((s) => s.trim()).filter(Boolean));
  const selected = PROBES.filter((probe) => wanted.has(probe.id));
  if (selected.length === 0) {
    console.error(`알 수 없는 레인: ${requested}. 가능한 값: ${PROBES.map((p) => p.id).join(', ')}`);
    process.exit(2);
  }
  return selected;
}

function pad(text, width) {
  // 한글은 두 칸을 차지한다. 폭을 안 맞추면 표가 어긋나서 읽기가 더 어려워진다.
  // 라벨이 폭을 넘겨도 최소 한 칸은 띄운다 — 안 그러면 라벨과 내용이 붙어 버린다.
  let used = 0;
  for (const char of String(text)) used += /[ᄀ-ᇿ㄰-㆏가-힣　-〿＀-￯]/.test(char) ? 2 : 1;
  return String(text) + ' '.repeat(Math.max(1, width - used));
}

function renderLane(probe, checks) {
  const counts = { ok: 0, warn: 0, fail: 0, skip: 0 };
  checks.forEach((entry) => { counts[entry.status] = (counts[entry.status] || 0) + 1; });
  const worst = counts.fail > 0 ? 'fail' : counts.warn > 0 ? 'warn' : counts.skip === checks.length ? 'skip' : 'ok';

  console.log('');
  console.log(`${MARK[worst]}│ ${probe.title}`);
  console.log('─'.repeat(WIDTH));
  for (const entry of checks) {
    console.log(`${MARK[entry.status]}│ ${pad(entry.label, 22)}${entry.detail}`);
    if (entry.hint && entry.status !== 'ok') console.log(`      │ ${pad('', 22)}→ ${entry.hint}`);
  }
  return counts;
}

async function main() {
  let probes = selectProbes();
  const mode = hasFlag('local') ? 'local' : 'live';
  const startedAt = Date.now();

  const laneResults = [];
  /*
   * 레인끼리는 병렬로 돌린다. 전부 순차로 하면 40초씩 걸려서 안 켜게 된다.
   *
   * 다만 GAS 를 때리는 레인(purchase·admin·content·keyword)을 한꺼번에 던지면
   * Apps Script 가 동시 실행을 직렬화하면서 뒤엣것이 타임아웃난다. 실제로
   * 하네스가 자기 부하로 자기를 실패시켰다 — 단독 실행하면 전부 통과한다.
   * 그래서 GAS 레인만 순차로 돌리고, 나머지는 같이 돌린다.
   */
  const GAS_LANES = new Set(['purchase', 'admin', 'content', 'keyword']);
  const gasProbes = probes.filter((probe) => GAS_LANES.has(probe.id));
  const otherProbes = probes.filter((probe) => !GAS_LANES.has(probe.id));

  const otherPromise = Promise.allSettled(otherProbes.map((probe) => probe.run({ mode })));
  const gasSettled = [];
  for (const probe of gasProbes) {
    try {
      gasSettled.push({ status: 'fulfilled', value: await probe.run({ mode }) });
    } catch (reason) {
      gasSettled.push({ status: 'rejected', reason });
    }
  }
  const otherSettled = await otherPromise;
  const ordered = [...gasProbes, ...otherProbes];
  const settled = [...gasSettled, ...otherSettled];
  probes = ordered;
  settled.forEach((entry, index) => {
    laneResults.push({
      probe: probes[index],
      checks:
        entry.status === 'fulfilled'
          ? entry.value
          : [{ id: `${probes[index].id}.crash`, label: '레인 실행', status: 'fail', detail: String(entry.reason?.message || entry.reason), hint: '' }],
    });
  });

  if (hasFlag('json')) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      mode,
      lanes: laneResults.map(({ probe, checks }) => ({ id: probe.id, title: probe.title, checks })),
    }, null, 2));
  } else {
    console.log('='.repeat(WIDTH));
    console.log(`leaderspro 통합 상태판   ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}   [${mode}]`);
    console.log('='.repeat(WIDTH));
    laneResults.forEach(({ probe, checks }) => renderLane(probe, checks));
  }

  const all = laneResults.flatMap(({ probe, checks }) => checks.map((entry) => ({ ...entry, lane: probe.title })));
  const failures = all.filter((entry) => entry.status === 'fail');
  const warnings = all.filter((entry) => entry.status === 'warn');
  const skipped = all.filter((entry) => entry.status === 'skip');

  if (!hasFlag('json')) {
    console.log('');
    console.log('='.repeat(WIDTH));
    console.log(`점검 ${all.length}건   실패 ${failures.length} · 주의 ${warnings.length} · 미확인 ${skipped.length}   (${Math.round((Date.now() - startedAt) / 1000)}초)`);
    if (failures.length > 0) {
      console.log('');
      console.log('지금 고쳐야 하는 것 (위에서부터)');
      failures.forEach((entry, index) => {
        console.log(`  ${index + 1}. [${entry.lane}] ${entry.label} — ${entry.detail}`);
        if (entry.hint) console.log(`     ${entry.hint}`);
      });
    } else if (warnings.length > 0) {
      console.log('');
      console.log('실패는 없다. 지켜볼 것:');
      warnings.forEach((entry) => console.log(`  · [${entry.lane}] ${entry.label} — ${entry.detail}`));
    } else {
      console.log('');
      console.log('전부 통과.');
    }
    if (skipped.length > 0) {
      console.log('');
      console.log(`미확인 ${skipped.length}건 — 못 본 것이지 통과가 아니다:`);
      skipped.forEach((entry) => console.log(`  · [${entry.lane}] ${entry.label} — ${entry.detail}`));
    }
  }

  process.exit(failures.length > 0 && !hasFlag('warn-only') ? 1 : 0);
}

main().catch((error) => {
  console.error('상태판 자체가 실패했다:', error);
  process.exit(2);
});
