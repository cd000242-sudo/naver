#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const npmCliCandidates = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].filter(Boolean);
const npmCli = npmCliCandidates.find(candidate => fs.existsSync(candidate));
if (!npmCli) {
  console.error(`[ReleaseGate] npm-cli.js를 찾지 못했습니다: ${npmCliCandidates.join(', ')}`);
  process.exit(1);
}
const steps = [
  { label: 'Build define sync', args: ['scripts/sync-build-define.mjs'], runWithNode: true },
  // [2026-10-13] ESLint over 330+ TS files died with "Fatal process out of memory: Zone" on a
  //   machine with ~0.8GB free RAM. Raise V8's heap ceiling for THIS step only — a global
  //   NODE_OPTIONS would also reach every vitest fork and starve the test workers instead.
  { label: 'ESLint', args: ['run', 'lint', '--', '--quiet'], nodeOptions: '--max-old-space-size=6144' },
  { label: 'Full test suite', args: ['test'] },
  { label: 'Agent regression coverage', args: ['run', 'test:coverage:agent'] },
  { label: 'Content Quality V3 regression coverage', args: ['run', 'test:coverage:content-v3'] },
  { label: 'TypeScript + renderer build', args: ['run', 'build'] },
  { label: 'IPC contract', args: ['run', 'lint:ipc'] },
  { label: 'Runtime self-test', args: ['run', 'self-test:built'] },
  { label: 'Electron UI E2E', args: ['run', 'e2e:built'] },
];

for (const step of steps) {
  console.log(`\n[ReleaseGate] ${step.label}`);
  const commandArgs = step.runWithNode ? step.args : [npmCli, ...step.args];
  const env = step.nodeOptions
    ? { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, step.nodeOptions].filter(Boolean).join(' ') }
    : process.env;
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
    env,
  });
  if (result.error) {
    console.error(`[ReleaseGate] ${step.label} 실행 실패: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[ReleaseGate] ${step.label} 실패 - 패키징과 업로드를 중단합니다.`);
    process.exit(result.status || 1);
  }
}

console.log('\n[ReleaseGate] PASS - 릴리스 패키징을 진행할 수 있습니다.');
