import { describe, expect, it } from 'vitest';
import {
  checkLoreFormat,
  checkStagedFileCount,
  WARN_FILE_THRESHOLD,
} from '../../scripts/git-hooks/checks.mjs';

/**
 * SPEC-STABILITY-2026 Phase 6.4 — warn-only pre-commit/commit-msg checks.
 * Acceptance: attempting an 11-file commit prints a warning (never blocks).
 */
describe('pre-commit staged file count (6.4)', () => {
  it('warns when staged files exceed the threshold (acceptance: 11 files)', () => {
    const files = Array.from({ length: 11 }, (_, i) => `src/file${i}.ts`);
    const warning = checkStagedFileCount(files);
    expect(warning).toContain('11개');
    expect(warning).toContain(`${WARN_FILE_THRESHOLD}개 초과`);
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
    'fix(content): 외톨이 파이프 행 차단',
    '',
    '본문 설명.',
    '',
    'Constraint: 파이프 노출 금지',
    '',
    '🐙 Autopus <noreply@autopus.co>',
  ].join('\n');

  it('accepts a compliant Lore message', () => {
    expect(checkLoreFormat(loreMessage)).toEqual([]);
  });

  it('warns on missing type prefix', () => {
    const warnings = checkLoreFormat('외톨이 파이프 행 차단\n\n🐙 Autopus <noreply@autopus.co>');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('타입 프리픽스');
  });

  it('warns on missing Autopus sign-off', () => {
    const warnings = checkLoreFormat('fix: 제목만 있는 커밋');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('사인오프');
  });

  it('exempts merge and revert commits', () => {
    expect(checkLoreFormat('Merge branch \'main\' into feature')).toEqual([]);
    expect(checkLoreFormat('Revert "fix: 이전 커밋"')).toEqual([]);
  });
});
