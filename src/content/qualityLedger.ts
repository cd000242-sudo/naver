/**
 * Quality ledger — one JSONL line per generated post, written after the quality gate ran.
 *
 * Why: the gate scores (finalScore / decision / quality90 / warnings) only lived inside the
 * returned content object and the console. After 20-30 posts nobody could answer "where does
 * the first pass lose points?" — the same question the Orbit app could answer from its ledger.
 * This module records, never blocks, never calls a model. Append failures are swallowed.
 *
 * Doctrine (QUALITY_HARNESS.md): warn-only, no new publish gate, no detect-then-rewrite.
 */
import fs from 'fs/promises';
import path from 'path';

export const QUALITY_LEDGER_FILE = 'content-quality-ledger.jsonl';
/** Keep the file bounded: ~10 posts/day → 100 days. */
export const QUALITY_LEDGER_MAX_LINES = 1000;

export interface QualityLedgerEntry {
  at: string;
  mode: string;
  keyword: string;
  title: string;
  /** 1-based attempt that produced the final draft; 0 when unknown */
  attempt: number;
  bodyChars: number;
  finalScore: number | null;
  modeScore: number | null;
  humanlikeScore: number | null;
  safetyScore: number | null;
  decision: string;
  quality90Miss: boolean;
  quality90Reasons: string[];
  /** Warning strings grouped by their leading tag, e.g. "[QualityGate90" → count */
  warningKinds: Record<string, number>;
  warningCount: number;
  throughlineHeld: boolean | null;
}

interface LedgerSourceLike { contentMode?: string; keyword?: string; title?: string }
interface LedgerContentLike {
  title?: string;
  bodyPlain?: string;
  body?: string;
  quality?: { warnings?: string[]; generationAttempt?: number; qualityGate?: Record<string, unknown> };
  __throughline?: { held?: boolean } | null;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** "[QualityGate90] …" → "QualityGate90", "TitleAnswer: …" → "TitleAnswer", else first 16 chars. */
export function warningKindOf(warning: string): string {
  const text = String(warning || '').trim();
  const bracket = text.match(/^\[([^\]]{1,40})\]/);
  if (bracket) return bracket[1].trim();
  const prefix = text.match(/^([A-Za-z가-힣0-9 ]{2,24})\s*[:：]/);
  if (prefix) return prefix[1].trim();
  return text.slice(0, 16);
}

export function tallyWarningKinds(warnings: readonly string[]): Record<string, number> {
  return warnings.reduce<Record<string, number>>((acc, warning) => {
    const kind = warningKindOf(warning);
    if (!kind) return acc;
    return { ...acc, [kind]: (acc[kind] || 0) + 1 };
  }, {});
}

/** Pure: builds the entry from the finalized content and its source. */
export function buildQualityLedgerEntry(
  content: LedgerContentLike,
  source: LedgerSourceLike,
  now: Date = new Date(),
): QualityLedgerEntry {
  const gate = (content.quality?.qualityGate || {}) as Record<string, unknown>;
  const warnings = Array.isArray(content.quality?.warnings) ? content.quality!.warnings!.map(String) : [];
  const body = String(content.bodyPlain || content.body || '');
  const reasons = Array.isArray(gate.quality90Reasons) ? (gate.quality90Reasons as unknown[]).map(String).slice(0, 5) : [];
  return {
    at: now.toISOString(),
    mode: String(source.contentMode || 'seo'),
    keyword: String(source.keyword || '').slice(0, 120),
    title: String(content.title || source.title || '').slice(0, 160),
    attempt: num(content.quality?.generationAttempt) ?? 0,
    bodyChars: body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length,
    finalScore: num(gate.finalScore),
    modeScore: num(gate.modeScore),
    humanlikeScore: num(gate.humanlikeScore),
    safetyScore: num(gate.safetyScore),
    decision: String(gate.decision || 'unknown'),
    quality90Miss: gate.quality90Miss === true,
    quality90Reasons: reasons,
    warningKinds: tallyWarningKinds(warnings),
    warningCount: warnings.length,
    throughlineHeld: typeof content.__throughline?.held === 'boolean' ? content.__throughline.held : null,
  };
}

/** Appends one line; trims the file to QUALITY_LEDGER_MAX_LINES when it grows 20% past the cap. */
export async function appendQualityLedger(filePath: string, entry: QualityLedgerEntry): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  const lines = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > QUALITY_LEDGER_MAX_LINES * 1.2) {
    await fs.writeFile(filePath, `${lines.slice(-QUALITY_LEDGER_MAX_LINES).join('\n')}\n`, 'utf8');
  }
}

export async function readQualityLedger(filePath: string, last = 100): Promise<QualityLedgerEntry[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const entries = raw.split(/\r?\n/).filter((line) => line.trim()).flatMap((line) => {
      try { return [JSON.parse(line) as QualityLedgerEntry]; } catch { return []; }
    });
    return entries.slice(-Math.max(1, last));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export interface QualityLedgerSummary {
  count: number;
  medianFinal: number | null;
  under80: number;
  over90: number;
  decisions: Record<string, number>;
  quality90MissRate: number;
  retryRate: number;
  topWarningKinds: Array<[string, number]>;
  topQuality90Reasons: Array<[string, number]>;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const topEntries = (tally: Record<string, number>, n: number): Array<[string, number]> =>
  Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, n);

/** Pure: where does the first pass lose points? */
export function summarizeQualityLedger(entries: readonly QualityLedgerEntry[]): QualityLedgerSummary {
  const finals = entries.map((e) => e.finalScore).filter((v): v is number => typeof v === 'number');
  const decisions = entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.decision]: (acc[e.decision] || 0) + 1 }), {});
  const kinds = entries.reduce<Record<string, number>>((acc, e) => {
    const merged = { ...acc };
    for (const [kind, count] of Object.entries(e.warningKinds || {})) merged[kind] = (merged[kind] || 0) + count;
    return merged;
  }, {});
  const reasons = entries.reduce<Record<string, number>>((acc, e) => {
    const merged = { ...acc };
    for (const reason of e.quality90Reasons || []) merged[reason] = (merged[reason] || 0) + 1;
    return merged;
  }, {});
  return {
    count: entries.length,
    medianFinal: median(finals),
    under80: finals.filter((v) => v < 80).length,
    over90: finals.filter((v) => v >= 90).length,
    decisions,
    quality90MissRate: entries.length ? entries.filter((e) => e.quality90Miss).length / entries.length : 0,
    retryRate: entries.length ? entries.filter((e) => e.attempt > 1).length / entries.length : 0,
    topWarningKinds: topEntries(kinds, 8),
    topQuality90Reasons: topEntries(reasons, 6),
  };
}

/** Fire-and-forget hook for the generator: resolves the userData path lazily so tests never touch Electron. */
export function recordQualityLedger(
  content: LedgerContentLike,
  source: LedgerSourceLike,
  resolveDir: () => string,
): void {
  try {
    const entry = buildQualityLedgerEntry(content, source);
    const filePath = path.join(resolveDir(), QUALITY_LEDGER_FILE);
    void appendQualityLedger(filePath, entry).catch((error: unknown) => {
      console.warn('[QualityLedger] append skipped:', (error as Error)?.message);
    });
  } catch (error) {
    console.warn('[QualityLedger] skipped:', (error as Error)?.message);
  }
}
