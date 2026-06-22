const WARN_FILE_THRESHOLD = 10;

const LORE_TYPE_RE = /^(feat|fix|refactor|test|docs|chore|perf|ci)(\([^)]+\))?: .+/;
const LORE_SIGNOFF = 'Autopus <noreply@autopus.co>';
const EXEMPT_SUBJECT_RE = /^(Merge |Revert |fixup! |squash! )/;

function checkStagedFileCount(files) {
  const staged = files.filter((name) => String(name || '').trim().length > 0);
  if (staged.length <= WARN_FILE_THRESHOLD) return null;

  return (
    `[pre-commit] staged file count ${staged.length} exceeds ${WARN_FILE_THRESHOLD}. ` +
    'Large bundle commits make regressions harder to trace; consider splitting if practical.'
  );
}

function checkLoreFormat(message) {
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

module.exports = {
  WARN_FILE_THRESHOLD,
  checkLoreFormat,
  checkStagedFileCount,
};
