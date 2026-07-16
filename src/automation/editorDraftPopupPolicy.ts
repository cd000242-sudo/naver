/**
 * Naver can render its "resume previous draft" prompt either in the top page
 * or inside the SmartEditor frame. Keep the selectors shared with the live
 * harness so production and diagnostics recover the same way.
 */
export const DRAFT_POPUP_CANCEL_SELECTORS = Object.freeze([
  'button.se-popup-button.se-popup-button-cancel',
  '.se-popup-button-cancel',
  'button.se-popup-button-cancel',
  'button[type="button"].se-popup-button-cancel',
  'button.se__cancel',
  '.btn_cancel',
  'button[class*="cancel"]',
] as const);

const DRAFT_CONFLICT_PATTERNS = Object.freeze([
  /작성\s*중인\s*글/,
  /이어서\s*작성/,
  /임시\s*저장(?:된)?\s*글.*작성/,
] as const);

export function isEditorDraftConflictMessage(value: unknown): boolean {
  const message = String(value || '').replace(/\s+/g, ' ').trim();
  return message.length > 0 && DRAFT_CONFLICT_PATTERNS.some((pattern) => pattern.test(message));
}
