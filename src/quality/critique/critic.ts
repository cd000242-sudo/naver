// [2026-09-22 Critique Loop] Critic runners: Critic 1 (facts/intent/title/missing) and the
// Editorial/Homefeed critic share one call+parse+validate path. Unparseable output is a
// failed critique (status REVISION_REQUIRED with no issues -> caller treats as MANUAL_REVIEW
// candidate), never a silent PASS.

import { safeParseJson } from '../../jsonParser';
import type { ArticleModel, CriticResult, CriticStatus, EvidencePack, QualityRoute, RawCriticOutput } from './types';
import { validateIssues } from './issueValidator';
import { buildCriticPrompt, buildEditorialPrompt, type CriticContext, type EditorialContext } from './criticPrompt';

const CRITIC_MAX_TOKENS = 2000;

function toStatus(value: unknown, fallback: CriticStatus): CriticStatus {
  const v = String(value || '').toUpperCase();
  return v === 'PASS' || v === 'REVISION_REQUIRED' || v === 'NEEDS_MORE_RESEARCH' ? v : fallback;
}

export function parseCriticOutput(
  rawText: string,
  model: ArticleModel,
  evidence: EvidencePack,
  origin: 'critic' | 'editorial',
  round: number,
): CriticResult {
  let parsed: RawCriticOutput | null = null;
  try { parsed = safeParseJson<RawCriticOutput>(rawText); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'REVISION_REQUIRED', issues: [], dropped: [], researchQueries: [], rawText: `UNPARSEABLE:${rawText.slice(0, 400)}` };
  }
  const { accepted, demoted } = validateIssues(parsed.issues, model, evidence, { origin, round });
  const researchQueries = (Array.isArray(parsed.researchQueries) ? parsed.researchQueries : [])
    .map((q) => String(q || '').trim()).filter((q) => q.length >= 2).slice(0, 3);
  let status = toStatus(parsed.status, accepted.length > 0 ? 'REVISION_REQUIRED' : 'PASS');
  // The status must agree with the validated issues: no blocking issue -> not REVISION_REQUIRED.
  if (status === 'REVISION_REQUIRED' && accepted.length === 0) status = 'PASS';
  if (status === 'PASS' && accepted.length > 0) status = 'REVISION_REQUIRED';
  if (status === 'NEEDS_MORE_RESEARCH' && researchQueries.length === 0) status = accepted.length > 0 ? 'REVISION_REQUIRED' : 'PASS';
  return { status, issues: accepted, dropped: demoted, researchQueries, rawText };
}

export function isUnparseable(result: CriticResult): boolean {
  return result.rawText.startsWith('UNPARSEABLE:');
}

async function call(route: QualityRoute, prompt: string): Promise<string> {
  return route.callModel(prompt, { maxTokens: CRITIC_MAX_TOKENS, timeoutMs: route.subscription ? 240_000 : 60_000 });
}

export async function runCritic(
  route: QualityRoute,
  ctx: CriticContext,
  model: ArticleModel,
  evidence: EvidencePack,
  round: number,
): Promise<{ result: CriticResult; prompt: string }> {
  const prompt = buildCriticPrompt(ctx, model, evidence);
  const raw = await call(route, prompt);
  return { result: parseCriticOutput(raw, model, evidence, 'critic', round), prompt };
}

export async function runEditorialCritic(
  route: QualityRoute,
  ctx: EditorialContext,
  model: ArticleModel,
  evidence: EvidencePack,
  round: number,
): Promise<{ result: CriticResult; prompt: string }> {
  const prompt = buildEditorialPrompt(ctx, model);
  const raw = await call(route, prompt);
  const parsed = parseCriticOutput(raw, model, evidence, 'editorial', round);
  // Editorial issues are structural: never CRITICAL (item 28/29).
  const issues = parsed.issues.map((i) => (i.severity === 'CRITICAL' ? { ...i, severity: 'MAJOR' as const, note: `${i.note ? `${i.note}; ` : ''}editorial capped at MAJOR` } : i));
  return { result: { ...parsed, issues }, prompt };
}
