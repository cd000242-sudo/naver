#!/usr/bin/env node
// SPEC-STABILITY-2026 Phase 6.4 — install warn-only hooks into .git/hooks.
// Run via `npm run hooks:install`. Overwrites only hooks carrying our marker
// (or missing ones) so a developer's custom hook is never clobbered.
import { execSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '# autopus-stability-hook';

const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf8' }).trim();
const hooks = {
  'pre-commit': `#!/bin/sh\n${MARKER}\nnode "$(git rev-parse --show-toplevel)/scripts/git-hooks/checks.mjs" pre-commit\nexit 0\n`,
  'commit-msg': `#!/bin/sh\n${MARKER}\nnode "$(git rev-parse --show-toplevel)/scripts/git-hooks/checks.mjs" commit-msg "$1"\nexit 0\n`,
};

for (const [name, body] of Object.entries(hooks)) {
  const target = join(gitDir, 'hooks', name);
  if (existsSync(target) && !readFileSync(target, 'utf8').includes(MARKER)) {
    console.warn(`⚠️ [hooks:install] ${name}: 기존 커스텀 훅이 있어 건너뜁니다 (${target})`);
    continue;
  }
  writeFileSync(target, body, { encoding: 'utf8' });
  chmodSync(target, 0o755);
  console.log(`✅ [hooks:install] ${name} 설치 완료`);
}
