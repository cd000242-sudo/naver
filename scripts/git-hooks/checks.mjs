#!/usr/bin/env node
// SPEC-STABILITY-2026 Phase 6.4 - warn-only git hook checks.
//
// pre-commit: warn when too many files are staged.
// commit-msg: warn when the Lore-style commit format is missing.
// Both modes always exit 0 because these hooks are advisory.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const WARN_FILE_THRESHOLD = 10;

const LORE_TYPE_RE = /^(feat|fix|refactor|test|docs|chore|perf|ci)(\([^)]+\))?: .+/;
const LORE_SIGNOFF = 'Autopus <noreply@autopus.co>';
const EXEMPT_SUBJECT_RE = /^(Merge |Revert |fixup! |squash! )/;

/** @returns {string | null} warning line, or null when within threshold */
export function checkStagedFileCount(files) {
  const staged = files.filter((name) => String(name || '').trim().length > 0);
  if (staged.length <= WARN_FILE_THRESHOLD) return null;

  return (
    `[pre-commit] staged file count ${staged.length} exceeds ${WARN_FILE_THRESHOLD}. ` +
    'Large bundle commits make regressions harder to trace; consider splitting if practical.'
  );
}

/** @returns {string[]} warning lines (empty = Lore-compliant or exempt) */
export function checkLoreFormat(message) {
  const text = String(message || '');
  const subject = (text.split(/\r?\n/)[0] || '').trim();
  if (subject.length === 0 || EXEMPT_SUBJECT_RE.test(subject)) return [];

  const warnings = [];
  if (!LORE_TYPE_RE.test(subject)) {
    warnings.push(
      '[commit-msg] Missing Lore type prefix. Use "feat(scope): title" with feat|fix|refactor|test|docs|chore|perf|ci.',
    );
  }
  if (!text.includes(LORE_SIGNOFF)) {
    warnings.push('[commit-msg] Missing Autopus sign-off: Autopus <noreply@autopus.co>');
  }
  return warnings;
}

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
