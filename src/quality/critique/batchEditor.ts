// [2026-09-22 Critique Loop] Batch targeted revision. Groups open blocking issues by section,
// sends at most MAX_SECTIONS_PER_CALL sections per Editor call, and accepts back ONLY the
// sections it asked for. A section that comes back unchanged is not "patched"; a section
// that grew or shrank far beyond what its operations allow is rejected as a rewrite.

import { safeParseJson } from '../../jsonParser';
import type { ArticleModel, EvidencePack, QualityIssue, QualityRoute, RevisionResult } from './types';
import { buildEditorPrompt, type EditorContext } from './editorPrompts';
import { findSection } from './sectionModel';

export const MAX_SECTIONS_PER_CALL = 4;
const REPLACE_GROWTH_LIMIT = 1.35;
const ADD_GROWTH_LIMIT = 2.6;
const SHRINK_LIMIT_WITHOUT_REMOVE = 0.6;
const EDITOR_MAX_TOKENS = 3500;

interface RawEditorOutput { sections?: Array<{ sectionId?: string; text?: string }>; patchedIssueKeys?: unknown }

export function groupIssuesBySection(issues: readonly QualityIssue[]): Map<string, QualityIssue[]> {
  const map = new Map<string, QualityIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.sectionId) ?? [];
    map.set(issue.sectionId, [...list, issue]);
  }
  return map;
}

/** Split section ids into batches of MAX_SECTIONS_PER_CALL. */
export function planBatches(sectionIds: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < sectionIds.length; i += MAX_SECTIONS_PER_CALL) out.push(sectionIds.slice(i, i + MAX_SECTIONS_PER_CALL));
  return out;
}

function growthAllowed(before: string, after: string, issues: readonly QualityIssue[]): boolean {
  const ratio = before.length === 0 ? Infinity : after.length / before.length;
  if (before.length === 0) return after.length > 0;
  const ops = issues.map((i) => i.operation);
  const hasAdd = ops.includes('ADD');
  const hasRemove = ops.includes('REMOVE');
  if (ratio > (hasAdd ? ADD_GROWTH_LIMIT : REPLACE_GROWTH_LIMIT)) return false;
  // A REPLACE may legitimately drop its whole span (an unsupported sentence in a short section):
  // the floor is the section minus the flagged spans, with 15% slack — never below 0.6x otherwise.
  const flaggedChars = issues.reduce((n, i) => n + i.exactSpan.length, 0);
  const floor = Math.min(before.length * SHRINK_LIMIT_WITHOUT_REMOVE, before.length - flaggedChars - before.length * 0.15);
  if (!hasRemove && after.length < floor) return false;
  return true;
}

/** Parse + filter one Editor response against the sections that were requested. */
export function parseEditorOutput(
  rawText: string,
  model: ArticleModel,
  targetSectionIds: readonly string[],
  issuesBySection: ReadonlyMap<string, readonly QualityIssue[]>,
): RevisionResult {
  let parsed: RawEditorOutput | null = null;
  try { parsed = safeParseJson<RawEditorOutput>(rawText); } catch { parsed = null; }
  const sections: Record<string, string> = {};
  const rejected: string[] = [];
  const targets = new Set(targetSectionIds);
  for (const item of Array.isArray(parsed?.sections) ? parsed!.sections : []) {
    const id = String(item?.sectionId || '').trim();
    const text = String(item?.text || '').trim();
    if (!targets.has(id)) { if (id) rejected.push(id); continue; }
    const section = findSection(model, id);
    if (!section || !text || text === section.text.trim()) continue;
    if (!growthAllowed(section.text, text, issuesBySection.get(id) ?? [])) { rejected.push(`${id}(rewrite)`); continue; }
    sections[id] = text;
  }
  const patched = (Array.isArray(parsed?.patchedIssueKeys) ? parsed!.patchedIssueKeys : [])
    .map((k) => String(k || '').trim())
    .filter((k) => k && [...issuesBySection.values()].some((list) => list.some((i) => i.issueKey === k && i.sectionId in sections)));
  return { sections, patchedIssueKeys: patched, targetedSectionIds: [...targetSectionIds], rejectedSectionIds: rejected, rawText };
}

export interface BatchEditorOutcome {
  readonly results: readonly RevisionResult[];
  readonly calls: number;
  readonly prompts: readonly string[];
}

/** Run the Editor over all sections with open blocking issues, ≤4 sections per call. */
export async function runBatchEditor(
  route: QualityRoute,
  ctx: EditorContext,
  model: ArticleModel,
  issues: readonly QualityIssue[],
  evidence: EvidencePack,
): Promise<BatchEditorOutcome> {
  const bySection = groupIssuesBySection(issues);
  const sectionIds = model.sections.map((s) => s.id).filter((id) => bySection.has(id));
  const results: RevisionResult[] = [];
  const prompts: string[] = [];
  for (const batch of planBatches(sectionIds)) {
    const batchIssues = batch.flatMap((id) => bySection.get(id) ?? []);
    const prompt = buildEditorPrompt(ctx, model, batch, batchIssues, evidence);
    prompts.push(prompt);
    const raw = await route.callModel(prompt, { maxTokens: EDITOR_MAX_TOKENS, timeoutMs: route.subscription ? 300_000 : 90_000 });
    results.push(parseEditorOutput(raw, model, batch, bySection));
  }
  return { results, calls: prompts.length, prompts };
}

export function mergeRevisions(results: readonly RevisionResult[]): { sections: Record<string, string>; patchedIssueKeys: string[]; rejected: string[] } {
  return results.reduce(
    (acc, r) => ({
      sections: { ...acc.sections, ...r.sections },
      patchedIssueKeys: [...acc.patchedIssueKeys, ...r.patchedIssueKeys],
      rejected: [...acc.rejected, ...r.rejectedSectionIds],
    }),
    { sections: {} as Record<string, string>, patchedIssueKeys: [] as string[], rejected: [] as string[] },
  );
}
