// src/generationStop/resumeRecord.ts
// The saved "stopped here" record: what stopped, why, the finished work, and the queue around it.
// Pure file with no runtime imports (inlined into the renderer bundle, gstop prefix; main also imports it).

import type { GstopInfo, GstopCause, GstopStage } from './stopClassifier.js';
import { gstopSummaryLine } from './stopClassifier.js';

export type GstopKind = 'continuous' | 'multi' | 'full-auto' | 'daily';
const GSTOP_KINDS: readonly string[] = ['continuous', 'multi', 'full-auto', 'daily'];

export interface GstopQueueEntry { readonly id: string; readonly status: string; readonly [key: string]: unknown }

export interface GstopRecord {
  readonly id: string;
  readonly kind: GstopKind;
  readonly stage: GstopStage;
  readonly cause: GstopCause;
  readonly engine: string;
  readonly summary: string;
  readonly label: string;
  readonly createdAt: number;
  readonly resetAt?: number;
  /** The finished article (kept so a resume never writes it again). */
  readonly article?: unknown;
  /** Finished images with their slot keys. */
  readonly images?: readonly unknown[];
  readonly ledger?: readonly { readonly key: string; readonly image: unknown }[];
  /** Queue snapshot (continuous / multi-account) and the item that stopped. */
  readonly queue?: readonly GstopQueueEntry[];
  readonly stoppedItemId?: string;
  /** Daily runs: which job stopped. */
  readonly accountId?: string;
  readonly jobKey?: string;
  /** Run-specific data a resume needs (single full-auto: the inputs of the run; never credentials). */
  readonly resumeData?: unknown;
}

export interface GstopRecordInput {
  readonly kind: GstopKind;
  readonly info: GstopInfo;
  readonly label: string;
  readonly now?: number;
  readonly id?: string;
  readonly article?: unknown;
  readonly images?: readonly unknown[];
  readonly ledger?: GstopRecord['ledger'];
  readonly queue?: readonly GstopQueueEntry[];
  readonly stoppedItemId?: string;
  readonly accountId?: string;
  readonly jobKey?: string;
  readonly resumeData?: unknown;
}

export function gstopBuildRecord(input: GstopRecordInput): GstopRecord {
  const createdAt = input.now ?? Date.now();
  return {
    id: input.id ?? `gstop-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    stage: input.info.stage,
    cause: input.info.cause,
    engine: input.info.engine,
    summary: gstopSummaryLine(input.info),
    label: String(input.label || '').slice(0, 80),
    createdAt,
    ...(input.info.resetAt !== undefined ? { resetAt: input.info.resetAt } : {}),
    ...(input.article !== undefined ? { article: input.article } : {}),
    ...(input.images ? { images: input.images } : {}),
    ...(input.ledger ? { ledger: input.ledger } : {}),
    ...(input.queue ? { queue: input.queue } : {}),
    ...(input.stoppedItemId ? { stoppedItemId: input.stoppedItemId } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.jobKey ? { jobKey: input.jobKey } : {}),
    ...(input.resumeData !== undefined ? { resumeData: input.resumeData } : {}),
  };
}

/** Reads saved records; anything that is not a well-formed record is dropped instead of breaking the card. */
export function gstopParseRecords(raw: unknown): GstopRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is GstopRecord => {
    const record = entry as Partial<GstopRecord> | null;
    return !!record && typeof record === 'object' && typeof record.id === 'string' && record.id.length > 0
      && GSTOP_KINDS.includes(String(record.kind)) && (record.stage === 'text' || record.stage === 'image')
      && typeof record.summary === 'string' && typeof record.createdAt === 'number';
  });
}

/** The queue to restore on resume: finished posts stay "completed", the stopped one starts again. Never mutates the input. */
export function gstopQueueForResume<T extends GstopQueueEntry>(queue: readonly T[], stoppedItemId: string): T[] {
  return queue.map((entry) => (entry.id === stoppedItemId && entry.status !== 'completed' ? { ...entry, status: 'pending' } : entry));
}

/** "완료 1 · 멈춤 1 · 남음 1" for the resume card (queue runs only; '' otherwise). */
export function gstopResumeSummary(record: Pick<GstopRecord, 'queue' | 'stoppedItemId'>): string {
  const queue = record.queue;
  if (!queue || queue.length === 0) return '';
  const done = queue.filter((entry) => entry.status === 'completed').length;
  const stopped = queue.filter((entry) => entry.id === record.stoppedItemId && entry.status !== 'completed').length;
  const rest = queue.filter((entry) => entry.id !== record.stoppedItemId && (entry.status === 'pending' || entry.status === 'failed')).length;
  return `완료 ${done} · 멈춤 ${stopped} · 남음 ${rest}`;
}
