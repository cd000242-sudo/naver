#!/usr/bin/env node
// SPEC-STABILITY-2026 Phase 6.4 - warn-only git hook checks.
//
// pre-commit: warn when too many files are staged.
// commit-msg: warn when the Lore-style commit format is missing.
// Both modes always exit 0 because these hooks are advisory.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import checks from './checks-lib.cjs';

export const WARN_FILE_THRESHOLD = checks.WARN_FILE_THRESHOLD;
export const checkStagedFileCount = checks.checkStagedFileCount;
export const checkLoreFormat = checks.checkLoreFormat;

function runCli() {
  const mode = process.argv[2];
  if (mode === 'pre-commit') {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    const warning = checkStagedFileCount(output.split('\n'));
    if (warning) console.warn(warning);
  } else if (mode === 'commit-msg') {
    const message = readFileSync(process.argv[3], 'utf8');
    for (const warning of checkLoreFormat(message)) console.warn(warning);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('git-hooks/checks.mjs')) {
  try {
    runCli();
  } catch (error) {
    console.warn(`[git-hooks] warning check failed but did not block: ${error?.message || error}`);
  }
  process.exit(0);
}
