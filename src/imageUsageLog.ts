// ✅ Per-call image generation usage log (JSONL).
// Records model, quality, cost and timestamp for each image generation call.
// Complements the aggregate counters in apiUsageTracker.ts — that module keeps
// running totals; this one keeps an auditable per-call history.
//
// Safety: never records API keys or prompt text (PII risk). Best-effort —
// logging failures never interrupt image generation.

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/** Rotate the log once it grows past this size (one .old backup is kept). */
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB

export interface ImageUsageEntry {
  /** ISO-8601 timestamp (filled by logImageGeneration) */
  ts: string;
  /** Image provider, e.g. 'openai-image' */
  provider: string;
  /** Resolved model id, e.g. 'gpt-image-1.5' | 'gpt-image-2' */
  model: string;
  /** Quality tier: 'low' | 'medium' | 'high' (or 'auto' if unresolved) */
  quality: string;
  /** Number of images produced by this call */
  images: number;
  /** Estimated cost of this call in USD */
  costUSD: number;
  /** Estimated cost of this call in KRW (USD * usdToKrwRate) */
  costKRW: number;
}

function logFilePath(): string {
  const dir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'image-usage.jsonl');
}

/**
 * Append one image-generation call record to the JSONL log.
 * Best-effort: any I/O error is swallowed so logging never breaks generation.
 */
export function logImageGeneration(entry: Omit<ImageUsageEntry, 'ts'>): void {
  try {
    const file = logFilePath();

    // Rotate when the log exceeds the cap so it cannot grow unbounded.
    try {
      const stat = fs.statSync(file);
      if (stat.size > MAX_LOG_BYTES) {
        fs.renameSync(file, file + '.old'); // overwrites any previous .old
      }
    } catch {
      /* file does not exist yet — nothing to rotate */
    }

    const record: ImageUsageEntry = { ts: new Date().toISOString(), ...entry };
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf-8');
  } catch (error) {
    console.warn('[ImageUsageLog] 사용량 기록 실패 (무시):', (error as Error).message);
  }
}
