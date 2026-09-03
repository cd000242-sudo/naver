/**
 * SPEC-BLUEPRINT-2026 — place the rendered 설계도 block into the combined prompt.
 *
 * The body prompt is one string split at the `[원본 텍스트]` marker: everything before it is the
 * cache-stable system part, everything after is the per-post user part. Per-post material must go
 * *after* the marker, or the prefix changes and the provider's prompt cache misses on every post
 * (measured 09-04: cachedTokens=0 on the first call of every post).
 */
export const PROMPT_SOURCE_MARKER = '[원본 텍스트]';

export function insertBlueprintIntoPrompt(prompt: string, blueprintBlock: string): string {
  const block = String(blueprintBlock || '').trim();
  if (!block) return prompt;
  const index = prompt.indexOf(PROMPT_SOURCE_MARKER);
  if (index < 0) {
    // No marker: the whole prompt is system. Append at the end so the prefix stays intact.
    return `${prompt}\n\n${block}\n`;
  }
  const cut = index + PROMPT_SOURCE_MARKER.length;
  return `${prompt.slice(0, cut)}\n${block}\n${prompt.slice(cut)}`;
}
