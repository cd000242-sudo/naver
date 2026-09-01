/**
 * Mode gate for the "AI writes the experience for you" checkbox.
 *
 * The checkbox stayed clickable in modes where the generator ignores it.
 * The user checked it, main.ts logged "AI 경험 생성 ON — 3요소 계약 적용",
 * and contentGenerator silently skipped attaching the overlay. A control
 * that accepts input and does nothing is worse than one that is absent —
 * it teaches the user a false belief about what the post contains.
 *
 * Source of truth is contentGenerator.ts (experienceEligibleMode).
 * aiExperienceToggleGate.test.ts pins the two lists together so they
 * cannot drift apart silently.
 */

/** Modes where contentGenerator attaches shared/experience-contract.prompt. */
export const AI_EXPERIENCE_ELIGIBLE_MODES: readonly string[] = [
  'seo',
  'affiliate',
  'mate',
  'custom',
];

/**
 * Why each excluded mode is excluded — shown in the UI instead of a bare
 * disabled box, so the user knows it is a rule and not a broken control.
 */
const BLOCKED_REASON: Readonly<Record<string, string>> = {
  homefeed: '홈피드는 실존 인물이 오가는 자리라 AI가 경험을 만들지 않습니다',
  issue: '이슈 글은 실존 인물이 오가는 자리라 AI가 경험을 만들지 않습니다',
  business: '업체 글은 사내 사실이 근거라 AI가 경험을 만들지 않습니다',
};

export function isAiExperienceEligibleMode(mode?: string | null): boolean {
  return AI_EXPERIENCE_ELIGIBLE_MODES.includes(String(mode || '').trim());
}

export function describeAiExperienceBlock(mode?: string | null): string {
  const key = String(mode || '').trim();
  return BLOCKED_REASON[key] || '이 모드에서는 AI 경험 생성이 적용되지 않습니다';
}

/**
 * Enables or disables the checkbox to match the active mode.
 *
 * Unchecks it when disabling: leaving a checked-but-ignored box on screen is
 * the exact confusion this fixes, and the collector reads `.checked`
 * regardless of `.disabled`.
 */
export function syncAiExperienceToggleForMode(mode: string): void {
  const checkbox = document.getElementById('ai-experience-generation') as HTMLInputElement | null;
  if (!checkbox) return;

  const label = checkbox.closest('label') as HTMLElement | null;
  const noteEl = document.getElementById('ai-experience-mode-note');
  const eligible = isAiExperienceEligibleMode(mode);

  checkbox.disabled = !eligible;
  if (!eligible && checkbox.checked) checkbox.checked = false;

  if (label) {
    label.style.opacity = eligible ? '1' : '0.45';
    label.style.cursor = eligible ? 'pointer' : 'not-allowed';
  }
  if (noteEl) {
    noteEl.textContent = eligible ? '' : `⛔ ${describeAiExperienceBlock(mode)}`;
    noteEl.style.display = eligible ? 'none' : 'block';
  }
}
