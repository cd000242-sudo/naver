/**
 * cohortStore.ts — SPEC-MOAT-2026 Phase 0.2 (cohort 데이터 측정 인프라)
 *
 * Stores cohort events (publish / suspension / recovery) anonymized by SHA-256
 * hash and computes 30/60/90-day survival rates for the SLA baseline (Q1, Q4).
 *
 * Privacy:
 *   - Stores only hashedAccountId (sha256, 64 hex). Original accountId never
 *     persisted, never reconstructable.
 *   - Opt-in via env COHORT_TELEMETRY_ENABLED=true. Without the flag,
 *     recordCohortEvent is a no-op (returns false) — zero side-effect.
 *
 * Storage:
 *   - Append-only JSONL-style array in userData/cohort-events.json
 *   - load reads, parses, returns. record reads-modify-writes (atomic JSON
 *     replace; sufficient given low write rate).
 *
 * Wiring (next cycle):
 *   - publishedPostTracker → recordCohortEvent('publish')
 *   - exposurePoller (저품2 감지) → recordCohortEvent('suspension')
 *
 * This module deliberately has no callers yet. Phase 0.3 will wire downstream
 * producers; this cycle ships the store + aggregation only (회귀 cascade 0).
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Event types that mark cohort transitions. */
export type CohortEventType = 'publish' | 'suspension' | 'recovery';

/**
 * Single cohort event. Always anonymized — hashedAccountId is sha256(accountId).
 */
export interface CohortEvent {
  readonly eventType: CohortEventType;
  readonly hashedAccountId: string;
  readonly timestamp: string;
  readonly metadata?: {
    readonly category?: string;
    readonly suspensionType?: 'soft' | 'low_quality' | 'banned';
    readonly durationDays?: number;
  };
}

/** Survival rate aggregation result for a given window. */
export interface SurvivalResult {
  readonly daysAfter: 30 | 60 | 90;
  readonly totalCohort: number;
  readonly survived: number;
  readonly rate: number;
}

const FILE_NAME = 'cohort-events.json';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Anonymize an accountId via SHA-256. Deterministic — same input → same hash.
 * Returns 64-char lowercase hex.
 */
export function hashAccountId(accountId: string): string {
  return createHash('sha256').update(String(accountId)).digest('hex');
}

/**
 * True only when env COHORT_TELEMETRY_ENABLED is exactly the string "true".
 * Any other value (unset, "false", "1", "yes") returns false to fail closed.
 */
export function isCohortTelemetryEnabled(): boolean {
  return (process.env.COHORT_TELEMETRY_ENABLED || '').trim().toLowerCase() === 'true';
}

/**
 * Resolve the file path lazily. Importing electron at module top would break
 * pure-function tests for siblings (and renderer-side imports). The require
 * is wrapped so non-electron environments fall back to a temp path.
 */
function getFilePath(): string {
  // Test/CI override — explicit absolute path wins. Used by unit tests to
  // isolate per-test fixtures without depending on electron-mock timing.
  const override = process.env.COHORT_STORE_PATH_OVERRIDE;
  if (override) return override;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    return path.join(app.getPath('userData'), FILE_NAME);
  } catch {
    // Fallback for non-electron contexts (CLI scripts, etc.)
    return path.join(process.cwd(), FILE_NAME);
  }
}

/**
 * Append a cohort event. Returns false (no-op) when telemetry is opt-in
 * disabled — caller does not need to gate; this function is safe to call
 * unconditionally.
 */
export async function recordCohortEvent(event: CohortEvent): Promise<boolean> {
  if (!isCohortTelemetryEnabled()) return false;

  try {
    const filePath = getFilePath();
    let existing: CohortEvent[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      } catch {
        // Corrupt file — start fresh rather than crash. Backup the bad file
        // for forensics (only once per session, ignore failures).
        try {
          fs.renameSync(filePath, filePath + '.corrupt.' + Date.now());
        } catch { /* ignore */ }
        existing = [];
      }
    }
    existing.push(event);
    // Ensure parent dir exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    }
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all events. Returns empty array on missing file or parse error.
 * Pure read — does not require telemetry to be enabled (so aggregation can
 * still run on historical data after toggling off).
 */
export async function loadCohortEvents(): Promise<CohortEvent[]> {
  try {
    const filePath = getFilePath();
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Compute the survival rate for a cohort window.
 *
 * Definition: a hashedAccountId enters the cohort when its first 'publish'
 * event is older than `daysAfter` days. It "survives" if no 'suspension'
 * event occurred for that account within `daysAfter` days of the first
 * publish.
 *
 * Returns null when the cohort is empty (no accounts old enough to evaluate).
 */
export async function computeSurvivalRate(
  daysAfter: 30 | 60 | 90,
  now: number = Date.now(),
): Promise<SurvivalResult | null> {
  const events = await loadCohortEvents();
  if (events.length === 0) return null;

  const windowMs = daysAfter * DAY_MS;

  // Group by hashedAccountId: track first publish + any suspension
  const firstPublish = new Map<string, number>();
  const suspensions = new Map<string, number[]>();

  for (const ev of events) {
    const ts = new Date(ev.timestamp).getTime();
    if (isNaN(ts)) continue;
    if (ev.eventType === 'publish') {
      const prev = firstPublish.get(ev.hashedAccountId);
      if (prev === undefined || ts < prev) firstPublish.set(ev.hashedAccountId, ts);
    } else if (ev.eventType === 'suspension') {
      const list = suspensions.get(ev.hashedAccountId) ?? [];
      list.push(ts);
      suspensions.set(ev.hashedAccountId, list);
    }
  }

  let totalCohort = 0;
  let survived = 0;
  for (const [accId, publishTs] of firstPublish) {
    // Only accounts whose first publish is at least `daysAfter` days old
    // qualify for measurement.
    if (now - publishTs < windowMs) continue;
    totalCohort++;
    const suspensionsForAcc = suspensions.get(accId) ?? [];
    const suspendedInWindow = suspensionsForAcc.some(
      (sTs) => sTs - publishTs <= windowMs && sTs >= publishTs,
    );
    if (!suspendedInWindow) survived++;
  }

  if (totalCohort === 0) {
    return { daysAfter, totalCohort: 0, survived: 0, rate: 0 };
  }
  return { daysAfter, totalCohort, survived, rate: survived / totalCohort };
}
