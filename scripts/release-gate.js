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
  { label: 'ESLint', args: ['run', 'lint', '--', '--quiet'] },
  { label: 'Full test suite', args: ['test'] },
  { label: 'TypeScript + renderer build', args: ['run', 'build'] },
];

for (const step of steps) {
  console.log(`\n[ReleaseGate] ${step.label}`);
  const result = spawnSync(process.execPath, [npmCli, ...step.args], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
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
