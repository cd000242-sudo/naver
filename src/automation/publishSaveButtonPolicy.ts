export const SAVE_BUTTON_TEXT_CANDIDATES = [
  '저장',
  '임시저장',
  '저장하기',
  '임시저장하기',
] as const;

export function getSaveButtonSelectors(baseSelectors: readonly string[] = []): string[] {
  return Array.from(new Set([
    'button.save_btn__bzc5B[data-click-area="tpb.save"]',
    ...baseSelectors,
    'button[data-click-area="tpb.save"]',
    'button[class*="save_btn"]',
    'button[aria-label*="저장"]',
    'button[title*="저장"]',
    'button[data-testid*="save" i]',
  ]));
}

export function normalizeSaveButtonText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

export function isSaveButtonTextCandidate(value: unknown): boolean {
  const normalized = normalizeSaveButtonText(value);
  return SAVE_BUTTON_TEXT_CANDIDATES.includes(normalized as typeof SAVE_BUTTON_TEXT_CANDIDATES[number]);
}
