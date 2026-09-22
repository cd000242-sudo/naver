// [2026-09-22 audit P0] Post-processing trace — every step that can rewrite or delete
// article text records before/after sizes and the sentences it removed, so a debug user
// can see which stage touched the body and by how much (E-postprocess-history.json).

import { withActiveRun } from '../quality/generationRunStore.js';

interface TextLike {
  selectedTitle?: unknown;
  introduction?: unknown;
  bodyPlain?: unknown;
  conclusion?: unknown;
  headings?: unknown;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Flatten the parts of a structured article that post-processors may touch. */
export function contentTextOf(content: TextLike | null | undefined): string {
  if (!content || typeof content !== 'object') return '';
  const headings = Array.isArray(content.headings) ? content.headings : [];
  const headingText = headings
    .map((h) => {
      const rec = h && typeof h === 'object' ? (h as Record<string, unknown>) : {};
      return `${str(rec.title)}\n${str(rec.content)}`;
    })
    .join('\n');
  return [str(content.selectedTitle), str(content.introduction), headingText, str(content.bodyPlain), str(content.conclusion)]
    .filter(Boolean)
    .join('\n');
}

const SENTENCE_SPLIT = /(?<=[.!?。！？])\s+|\n+/u;

export function splitSentences(text: string): string[] {
  return String(text || '')
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

function normalizeSentence(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[\s.。!?！？,，'"“”‘’]+$/gu, '').trim();
}

export interface PostProcessTrace {
  stepName: string;
  beforeChars: number;
  afterChars: number;
  deletedChars: number;
  deletedSentences: string[];
  changedSections: string[];
  reason?: string;
  modelUsed?: string;
}

/** Sentences present before and absent after (normalized) — the audit trail of deletions. */
export function diffDeletedSentences(beforeText: string, afterText: string): string[] {
  const after = new Set(splitSentences(afterText).map(normalizeSentence));
  const afterJoined = normalizeSentence(afterText);
  return splitSentences(beforeText)
    .filter((s) => {
      const n = normalizeSentence(s);
      return n.length >= 6 && !after.has(n) && !afterJoined.includes(n);
    })
    .slice(0, 40);
}

export function tracePostProcessStep(
  stepName: string,
  beforeText: string,
  afterText: string,
  extra: { reason?: string; modelUsed?: string; changedSections?: string[] } = {},
): PostProcessTrace {
  const beforeChars = beforeText.length;
  const afterChars = afterText.length;
  return {
    stepName,
    beforeChars,
    afterChars,
    deletedChars: Math.max(0, beforeChars - afterChars),
    deletedSentences: beforeText === afterText ? [] : diffDeletedSentences(beforeText, afterText),
    changedSections: extra.changedSections ?? [],
    reason: extra.reason,
    modelUsed: extra.modelUsed,
  };
}

/**
 * Record one step on the active generation run and log deletions. Silent when nothing changed
 * (still appended to the history so the step order is visible).
 */
export function recordPostProcessStep(
  stepName: string,
  beforeText: string,
  afterText: string,
  extra: { reason?: string; modelUsed?: string; changedSections?: string[] } = {},
): PostProcessTrace {
  const trace = tracePostProcessStep(stepName, beforeText, afterText, extra);
  withActiveRun((run) => run.appendPostProcess({
    stepName: trace.stepName,
    beforeChars: trace.beforeChars,
    afterChars: trace.afterChars,
    deletedChars: trace.deletedChars,
    changedSections: trace.changedSections,
    reason: trace.reason,
    modelUsed: trace.modelUsed,
    deletedSentences: trace.deletedSentences.length > 0 ? trace.deletedSentences : undefined,
  }));
  if (trace.deletedSentences.length > 0 || trace.deletedChars > 0) {
    console.log(
      `[PostProcess] ${stepName}: ${trace.beforeChars}→${trace.afterChars}자 (−${trace.deletedChars})`
      + (trace.deletedSentences.length > 0 ? ` · 삭제 문장 ${trace.deletedSentences.length}개: "${trace.deletedSentences[0].slice(0, 60)}"` : ''),
    );
  }
  return trace;
}
