/**
 * Complement ledger (Release C1, 2026-11-04) — one JSONL line per "complement report" item the harmony session
 * filed: which of the app's own instructions conflicted / were missing / did not fit, and how the session resolved it.
 *
 * Purpose: after a few dozen live runs the same conflictKey will show up again and again — that is the list of
 * instruction conflicts to fix in the prompts. The ledger is MEASUREMENT ONLY and is never read back into a prompt
 * (a test pins that only harmonyRuntime imports this module). Best effort: nothing here may throw into generation.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../../quality/generationRunStore.js';
import type { VerifiedComplementItem } from './harmonyPacketTypes.js';

export const HARMONY_LEDGER_DIR = 'agent-harmony';
export const HARMONY_LEDGER_FILE = 'complement-ledger.jsonl';
export const HARMONY_LEDGER_MAX_BYTES = 5 * 1024 * 1024;

export interface HarmonyLedgerMeta {
  readonly userDataDir: string;
  readonly runId: string;
  readonly appVersion: string;
  readonly engine: string;
  readonly model: string;
  readonly mode: string;
  readonly now?: () => Date;
  readonly maxBytes?: number;
}

const normalize = (text: string): string => String(text ?? '').normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko-KR');

/** First 16 hex chars of sha256 over the two normalized quotes; sorted so the order of the two quotes does not matter. */
export function conflictKeyOf(instructionQuote: string, otherQuote: string): string {
  const pair = [normalize(instructionQuote), normalize(otherQuote)].sort().join('\u0000');
  return createHash('sha256').update(pair, 'utf8').digest('hex').slice(0, 16);
}

function rotateIfFull(file: string, maxBytes: number): void {
  let size = 0;
  try { size = statSync(file).size; } catch { return; }
  if (size >= maxBytes) renameSync(file, `${file}.1`);
}

function lineOf(meta: HarmonyLedgerMeta, item: VerifiedComplementItem): string {
  return redactSecrets(JSON.stringify({
    at: (meta.now ?? (() => new Date()))().toISOString(), runId: meta.runId, appVersion: meta.appVersion,
    engine: meta.engine, model: meta.model, mode: meta.mode,
    kind: item.kind, conflictKey: conflictKeyOf(item.instructionQuote, item.otherQuote),
    quotes: [item.instructionQuote, item.otherQuote], resolution: item.resolution, rule: item.rule,
    affected: item.affected, quoteVerified: item.quoteVerified,
  }));
}

/** Append one line per item. Returns how many lines were written (0 on any failure). Never throws. */
export function appendHarmonyLedger(meta: HarmonyLedgerMeta, items: readonly VerifiedComplementItem[]): { written: number } {
  try {
    if (!meta?.userDataDir || !Array.isArray(items) || items.length === 0) return { written: 0 };
    const dir = path.join(meta.userDataDir, HARMONY_LEDGER_DIR);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, HARMONY_LEDGER_FILE);
    rotateIfFull(file, meta.maxBytes ?? HARMONY_LEDGER_MAX_BYTES);
    const rows: string[] = [];
    for (const item of items) {
      try { rows.push(lineOf(meta, item)); } catch { /* a malformed item is skipped, not fatal */ }
    }
    if (rows.length === 0) return { written: 0 };
    appendFileSync(file, `${rows.join('\n')}\n`, 'utf8');
    return { written: rows.length };
  } catch (error) {
    console.warn('[AgentHarmony] 보완 장부 기록 생략:', (error as Error)?.message);
    return { written: 0 };
  }
}
