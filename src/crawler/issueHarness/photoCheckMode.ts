// src/crawler/issueHarness/photoCheckMode.ts
//
// [2026-11-15] When the picture check stops (usage limit / login), the owner picks how the collection runs again:
//   selected     — follow the text engine (the default, and what every run did before)
//   agent-claude — check with the Claude subscription
//   agent-codex  — check with the Codex subscription
//   caption      — free judgement from the photo descriptions (less accurate, no engine involved)
// Nothing here switches by itself: a mode only takes effect when the owner chose it.
// Kept free of heavy imports so main-process services can share the type and the guard.

export type PhotoCheckMode = 'selected' | 'agent-claude' | 'agent-codex' | 'caption';

export const PHOTO_CHECK_MODES: readonly PhotoCheckMode[] = ['selected', 'agent-claude', 'agent-codex', 'caption'];

export function isPhotoCheckMode(value: unknown): value is PhotoCheckMode {
  return typeof value === 'string' && (PHOTO_CHECK_MODES as readonly string[]).includes(value);
}

/** Unknown or missing values mean "follow the selected engine". */
export function normalizePhotoCheckMode(value: unknown): PhotoCheckMode {
  return isPhotoCheckMode(value) ? value : 'selected';
}
