/**
 * bodyArtifactCleanup.ts - removes AI-echoed CTA artifacts from generated body
 * text before it reaches the editor, while preserving legitimate standalone
 * section dividers (━ lines) that belong to the article layout.
 *
 * Background: the previous blanket regex deleted every ━ divider line from the
 * body, so posts published via rich paste lost their section dividers.
 */

export function stripCtaArtifactsFromBody(body: string): string {
  if (!body) return body;

  return (
    body
      // Divider line that carries a CTA payload (url / hook) on the same line.
      .replace(/━{10,}[^\n]*(?:https?:\/\/|더\s*알아보기)[^\n]*\n?/g, '')
      // Divider line directly above a CTA hook/link line — part of an
      // AI-echoed CTA block (the CTA lines themselves are removed below).
      .replace(/━{10,}[^\n]*\n(?=[ \t]*(?:🔗|👉|더\s*알아보기))/g, '')
      // "🔗 더 알아보기" hook line.
      .replace(/🔗\s*더\s*알아보기[^\n]*\n?/g, '')
      // Plain "더 알아보기" hook remnant.
      .replace(/더\s*알아보기[^\n]*\n?/g, '')
      // Bare CTA link line.
      .replace(/👉\s*https?:\/\/[^\n]*\n?/g, '')
      // Dividers dangling at the very end — the app appends its own tail
      // divider, so these would double up.
      .replace(/(?:\n[ \t]*━{10,}[^\n]*)+[ \t\n]*$/g, '')
      .trim()
  );
}
