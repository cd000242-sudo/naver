#!/usr/bin/env node
// SPEC-STABILITY-2026 Phase 6.4 — warn-only git hook checks.
//
// pre-commit: staged-file count guard. Bundle commits (10+ files) made past
// incidents hard to bisect; warn so the habit is visible, never block.
// commit-msg: Lore format check (type prefix + Autopus sign-off) — same
// contract `auto check --lore` enforces, surfaced earlier at commit time.
//
// Both modes ALWAYS exit 0 — these are advisory, not gates.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const WARN_FILE_THRESHOLD = 10;
const LORE_TYPE_RE = /^(feat|fix|refactor|test|docs|chore|perf|ci)(\([^)]+\))?: .+/;
const LORE_SIGNOFF = 'Autopus <noreply@autopus.co>';
// Commits git generates itself (merge/revert/fixup) are exempt from Lore.
const EXEMPT_SUBJECT_RE = /^(Merge |Revert |fixup! |squash! )/;

/** @returns {string | null} warning line, or null when within threshold */
export function checkStagedFileCount(files) {
  const staged = files.filter((name) => String(name || '').trim().length > 0);
  if (staged.length <= WARN_FILE_THRESHOLD) return null;
  return (
    `⚠️ [pre-commit] 스테이징된 파일 ${staged.length}개 (${WARN_FILE_THRESHOLD}개 초과) — ` +
    '번들 커밋은 회귀 추적을 어렵게 합니다. 의도가 다르면 분할 커밋을 검토하세요.'
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
      '⚠️ [commit-msg] Lore 타입 프리픽스가 없습니다 — "feat(scope): 제목" 형식 (feat|fix|refactor|test|docs|chore|perf|ci).'
    );
  }
  if (!text.includes(LORE_SIGNOFF)) {
    warnings.push(
      '⚠️ [commit-msg] Autopus 사인오프가 없습니다 — 본문 끝에 "🐙 Autopus <noreply@autopus.co>" 필요.'
    );
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
    console.warn(`⚠️ [git-hooks] 검사 실패(무시됨): ${error?.message || error}`);
  }
  process.exit(0);
}
