// [2026-09-22 Critique Loop] Verification — decides RESOLVED / OPEN for issues the Editor
// claims to have patched. stillOpen always wins. Only new CRITICAL issues caused by the
// revision (and, from round 2, MAJOR issues explicitly marked causedByRevision) are added.

import { safeParseJson } from '../../jsonParser';
import type { ArticleModel, EvidencePack, QualityIssue, QualityRoute, RawIssue, VerificationResult } from './types';
import { buildVerificationPrompt, type EditorContext } from './editorPrompts';
import { validateIssues } from './issueValidator';

interface RawVerification {
  resolved?: unknown;
  stillOpen?: unknown;
  newIssues?: Array<RawIssue & { causedByRevision?: unknown }>;
}

const VERIFY_MAX_TOKENS = 1500;

const keys = (value: unknown, known: ReadonlySet<string>): string[] =>
  (Array.isArray(value) ? value : []).map((k) => String(k || '').trim()).filter((k) => known.has(k));

export function parseVerificationOutput(
  rawText: string,
  model: ArticleModel,
  evidence: EvidencePack,
  pending: readonly QualityIssue[],
  round: number,
): VerificationResult {
  const known = new Set(pending.map((i) => i.issueKey));
  let parsed: RawVerification | null = null;
  try { parsed = safeParseJson<RawVerification>(rawText); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object') {
    // Unparseable verification = nothing is proven resolved.
    return { resolved: [], stillOpen: [...known], newIssues: [], rawText: `UNPARSEABLE:${rawText.slice(0, 400)}` };
  }
  const stillOpen = new Set(keys(parsed.stillOpen, known));
  const resolved = keys(parsed.resolved, known).filter((k) => !stillOpen.has(k));
  // Anything pending that the verifier did not explicitly resolve stays open.
  for (const k of known) if (!resolved.includes(k)) stillOpen.add(k);

  const rawNew = (Array.isArray(parsed.newIssues) ? parsed.newIssues : []).filter((n) => {
    const sev = String(n?.severity || '').toUpperCase();
    if (sev === 'CRITICAL') return true;
    return round >= 2 && sev === 'MAJOR' && n?.causedByRevision === true;
  });
  const { accepted } = validateIssues(rawNew, model, evidence, { origin: 'critic', round });
  return { resolved, stillOpen: [...stillOpen], newIssues: accepted, rawText };
}

export async function runVerification(
  route: QualityRoute,
  ctx: EditorContext,
  model: ArticleModel,
  revisedSectionIds: readonly string[],
  pending: readonly QualityIssue[],
  evidence: EvidencePack,
  round: number,
): Promise<{ result: VerificationResult; prompt: string }> {
  const prompt = buildVerificationPrompt(ctx, model, revisedSectionIds, pending, evidence, round);
  const raw = await route.callModel(prompt, { maxTokens: VERIFY_MAX_TOKENS, timeoutMs: route.subscription ? 240_000 : 60_000 });
  return { result: parseVerificationOutput(raw, model, evidence, pending, round), prompt };
}
