import { describe, expect, it } from 'vitest';
import {
  WARN_FILE_THRESHOLD,
  checkLoreFormat,
  checkStagedFileCount,
} from '../../scripts/git-hooks/checks.mjs';

/**
 * SPEC-STABILITY-2026 Phase 6.4 - warn-only pre-commit/commit-msg checks.
 * Acceptance: attempting an 11-file commit prints a warning and never blocks.
 */
describe('pre-commit staged file count (6.4)', () => {
  it('warns when staged files exceed the threshold (acceptance: 11 files)', () => {
    const files = Array.from({ length: 11 }, (_, i) => `src/file${i}.ts`);
    const warning = checkStagedFileCount(files);

    expect(warning).toContain('11');
    expect(warning).toContain(String(WARN_FILE_THRESHOLD));
  });

  it('stays silent at or under the threshold', () => {
    const files = Array.from({ length: WARN_FILE_THRESHOLD }, (_, i) => `src/file${i}.ts`);
    expect(checkStagedFileCount(files)).toBeNull();
  });

  it('ignores empty lines from git diff output', () => {
    const files = [...Array.from({ length: 10 }, (_, i) => `f${i}.ts`), '', '  ', ''];
    expect(checkStagedFileCount(files)).toBeNull();
  });
});

describe('commit-msg Lore format check (6.4)', () => {
  const loreMessage = [
    'fix(content): stabilize publish pipeline',
    '',
    'Body description.',
    '',
    'Constraint: keep hook checks warn-only.',
    '',
    'Autopus <noreply@autopus.co>',
  ].join('\n');

  it('accepts a compliant Lore message', () => {
    expect(checkLoreFormat(loreMessage)).toEqual([]);
  });

  it('warns on missing type prefix', () => {
    const warnings = checkLoreFormat('stabilize publish pipeline\n\nAutopus <noreply@autopus.co>');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('[commit-msg]');
  });

  it('warns on missing Autopus sign-off', () => {
    const warnings = checkLoreFormat('fix: title only');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('[commit-msg]');
  });

  it('exempts merge and revert commits', () => {
    expect(checkLoreFormat("Merge branch 'main' into feature")).toEqual([]);
    expect(checkLoreFormat('Revert "fix: previous commit"')).toEqual([]);
  });
});
