#!/usr/bin/env node
// SPEC-STABILITY-2026 Phase 6.3 — self-test orchestrator.
//
// Stage 1: existing mocked automation smoke (publish pipeline shape).
// Stage 2: real app boot with SELF_TEST=1 + E2E_TEST=1 — bundle health
//          (renderer init errors) + 5 read-only IPC handshakes, judged by
//          src/main/selfTest.ts which exits 0/1.
import { spawnSync } from 'node:child_process';

const TIMEOUT_MS = 120_000;

function run(label, command, args, env = {}) {
  console.log(`\n[self-test] ▶ ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: TIMEOUT_MS,
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(`[self-test] ❌ ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[self-test] ❌ ${label} 실패 (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`[self-test] ✅ ${label} 통과`);
}

run('자동화 파이프라인 모의 smoke', 'node', ['dist/tests/automationSmoke.js']);

const appEnv = { SELF_TEST: '1', E2E_TEST: '1' };
// Claude Code 등 호스트가 남긴 ELECTRON_RUN_AS_NODE가 있으면 electron이
// plain node로 떠서 ipcMain이 undefined가 된다 — 반드시 제거.
delete process.env.ELECTRON_RUN_AS_NODE;
run('앱 부팅 + 번들 헬스 + IPC 핸드셰이크 5종', 'npx', ['electron', '.'], appEnv);

console.log('\n[self-test] 🎉 전체 통과 — 앱이 켜지고 말이 통합니다.');
