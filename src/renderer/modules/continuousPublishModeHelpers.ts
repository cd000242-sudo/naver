// ============================================
// Continuous publishing — publish-mode resolution helpers
// modules/continuousPublishModeHelpers.ts
// ============================================

/**
 * Bug context: the continuous-queue schedule modals (schedule clear button,
 * individual schedule modal uncheck) unconditionally reset an item's
 * publishMode to 'publish', silently discarding a user-selected 'draft'
 * (임시저장) mode. Removing a schedule must demote 'schedule' → 'publish'
 * but must NOT overwrite a 'draft' selection.
 */
export type ContinuousPublishMode = 'publish' | 'draft' | 'schedule';

/**
 * Resolve a queue item's publish mode after its schedule is removed.
 * 'draft' is preserved as-is; anything else falls back to immediate 'publish'.
 */
export function resolvePublishModeAfterScheduleRemoved(
  current: ContinuousPublishMode | undefined,
): ContinuousPublishMode {
  return current === 'draft' ? 'draft' : 'publish';
}
