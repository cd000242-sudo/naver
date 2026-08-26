#!/usr/bin/env node
// SPEC-STABILITY-2026 Phase 6.3 — self-test orchestrator.
//
// Stage 1: existing mocked automation smoke (publish pipeline shape).
// Stage 2: real app boot with SELF_TEST=1 + E2E_TEST=1 — bundle health
//          (renderer init errors) + 5 read-only IPC handshakes, judged by
//          src/main/selfTest.ts which exits 0/1.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    throw new Error(`[self-test] ${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[self-test] ${label} 실패 (exit ${result.status ?? 1})`);
  }
  console.log(`[self-test] ✅ ${label} 통과`);
}

run('자동화 파이프라인 모의 smoke', 'node', ['dist/tests/automationSmoke.js']);

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bln-self-test-'));
const appEnv = {
  SELF_TEST: '1',
  E2E_TEST: '1',
  E2E_USER_DATA_DIR: path.join(isolatedRoot, 'userdata'),
  APPDATA: path.join(isolatedRoot, 'appdata'),
  LOCALAPPDATA: path.join(isolatedRoot, 'localappdata'),
};
for (const dir of ['userdata', 'appdata', 'localappdata']) {
  fs.mkdirSync(path.join(isolatedRoot, dir), { recursive: true });
}
// Claude Code 등 호스트가 남긴 ELECTRON_RUN_AS_NODE가 있으면 electron이
// plain node로 떠서 ipcMain이 undefined가 된다 — 반드시 제거.
delete process.env.ELECTRON_RUN_AS_NODE;
try {
  run('앱 부팅 + 번들 헬스 + IPC 핸드셰이크 5종', 'npx', ['electron', '.'], appEnv);
} finally {
  /*
   * [2026-08-27] 임시 프로필 삭제 실패로 릴리즈를 막지 않는다.
   *
   * v2.11.215 릴리즈에서 셀프테스트 자체는 통과했는데 정리 단계가 던져 게이트가 멈췄다.
   *   Error: ENOTEMPTY: directory not empty, rmdir '…\localappdata\npm-cache\_logs'
   * 에이전트 설치가 띄운 npm 이 로그를 쓰는 중이라 폴더가 안 비었다 — 윈도우에서는
   * 파일 핸들이 잠깐 남는 것이 흔하다. force:true 도 ENOTEMPTY 는 못 넘긴다.
   *
   * 이 스크립트의 일은 "앱이 켜지고 말이 통하는가"를 확인하는 것이지 임시 폴더를
   * 지우는 것이 아니다. 몇 번 다시 시도하고, 그래도 남으면 알리고 지나간다.
   * (OS 가 %TEMP% 를 알아서 청소한다.)
   */
  let removed = false;
  for (let attempt = 1; attempt <= 3 && !removed; attempt += 1) {
    try {
      fs.rmSync(isolatedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      removed = true;
    } catch (error) {
      if (attempt === 3) {
        console.warn(
          `[self-test] ⚠️ 임시 프로필 정리 실패(무시): ${error?.code || error?.message} — ${isolatedRoot}`,
        );
      }
    }
  }
}

console.log('\n[self-test] 🎉 전체 통과 — 앱이 켜지고 말이 통합니다.');
