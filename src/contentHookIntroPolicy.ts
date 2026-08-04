/**
 * [2026-07-25] User hook intro policy — single source of truth.
 *
 * The unified hook field accepts up to 3 lines. One line keeps the legacy
 * "weave naturally" behavior; 2-3 lines mean the user pinned the intro
 * (homefeed 3-line hook), so prompts must use the lines in order.
 * Renderer sends the raw value; this module is the authoritative normalizer
 * for both the legacy prompt loader and the V3 prompt builder.
 *
 * [2026-08-04] Per-line 40-char truncation removed by user request — pinning
 * the intro verbatim is the point of this feature, so silently cutting the
 * user's own words defeats it. Only a defensive hard cap against runaway
 * input remains.
 */
export const HOOK_INTRO_MAX_LINES = 3;
/** Defensive cap only — never a style limit. Keeps a pasted wall of text from blowing up the prompt. */
export const HOOK_INTRO_MAX_LINE_CHARS = 500;

export function normalizeHookIntroLines(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, HOOK_INTRO_MAX_LINE_CHARS))
    .filter((line) => line.length > 0)
    .slice(0, HOOK_INTRO_MAX_LINES);
}
