/**
 * Feature flag + A/B meta log for post publication.
 *
 * Why this exists:
 * The 100-point roadmap depends on knowing which optimizations actually move
 * the needle. Before adding validator / thumbnail-auto / scheduler / etc., we
 * record which features were enabled at publish time, so downstream cohort
 * analysis can answer: "did the validator actually improve reach, or did we
 * just add latency and cost?"
 *
 * Storage: JSON file under Electron userData (or /tmp mock in tests).
 * The file is append-only in the logical sense — we never delete past records.
 * Schema evolution must be additive (new optional fields).
 *
 * This is intentionally NOT a database. SQLite adds a native dependency that
 * breaks Electron builds on some platforms. A flat JSON file is sufficient
 * for the ~5000 records/year a single-user blogger produces.
 */

import * as fs from 'fs';
import * as path from 'path';

export type FeatureFlag =
  | 'validator'
  | 'thumbnail_auto'
  | 'smart_scheduler'
  | 'topic_guard'
  | 'feedback_loop'
  | 'first_party_data'
  | 'price_normalizer_v2';

export interface PostFeatureMetadata {
  postId: string;
  publishedAt: string; // ISO 8601
  featuresEnabled: FeatureFlag[];
  promptVersion: string;
  validationPassed: boolean;
  validationIssueCount: number;
  /** Optional free-form notes. Never treat as authoritative signal. */
  notes?: string;
}

export interface CohortStats {
  feature: FeatureFlag;
  enabledCount: number;
  disabledCount: number;
  /** Mean validationIssueCount inside each cohort. Lower = better. */
  enabledAvgIssues: number | null;
  disabledAvgIssues: number | null;
}

type Storage = {
  /** Absolute path to the JSON file. */
  getFilePath(): string;
};

function defaultStorage(): Storage {
  // Late-binding so tests can mock electron. When electron is unavailable
  // (vitest node env), fall back to a temp path under os.tmpdir.
  let basePath: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    basePath = electron.app?.getPath?.('userData') ?? '';
  } catch {
    basePath = '';
  }
  if (!basePath) {
    const os = require('os') as typeof import('os');
    basePath = os.tmpdir();
  }
  return {
    getFilePath: () => path.join(basePath, 'feature_flag_log.json'),
  };
}

let activeStorage: Storage = defaultStorage();

/** Test-only hook: override the storage path. */
export function __setStorageForTest(filePath: string): void {
  activeStorage = { getFilePath: () => filePath };
}

function readAll(): PostFeatureMetadata[] {
  const filePath = activeStorage.getFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[featureFlagTracker] read failed, returning empty:', err);
    return [];
  }
}

function writeAll(records: PostFeatureMetadata[]): void {
  const filePath = activeStorage.getFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Record a publish event. Idempotent by postId — a repeated call with the
 * same postId overwrites the previous record (e.g. republish after edit).
 */
export function recordPublish(metadata: PostFeatureMetadata): void {
  if (!metadata.postId) {
    throw new Error('recordPublish: postId is required');
  }
  const records = readAll();
  const existingIdx = records.findIndex((r) => r.postId === metadata.postId);
  if (existingIdx >= 0) {
    records[existingIdx] = metadata;
  } else {
    records.push(metadata);
  }
  writeAll(records);
}

export function getMetadata(postId: string): PostFeatureMetadata | null {
  return readAll().find((r) => r.postId === postId) ?? null;
}

export function listRecent(limit = 50): PostFeatureMetadata[] {
  return readAll()
    .slice()
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

/**
 * Compare cohorts of posts with vs without a feature enabled.
 * Returns null averages when a cohort is empty — callers MUST treat null as
 * "insufficient data" rather than "zero issues".
 */
export function getCohortStats(feature: FeatureFlag): CohortStats {
  const records = readAll();
  const enabled = records.filter((r) => r.featuresEnabled.includes(feature));
  const disabled = records.filter((r) => !r.featuresEnabled.includes(feature));

  const avg = (arr: PostFeatureMetadata[]): number | null => {
    if (arr.length === 0) return null;
    const sum = arr.reduce((acc, r) => acc + r.validationIssueCount, 0);
    return sum / arr.length;
  };

  return {
    feature,
    enabledCount: enabled.length,
    disabledCount: disabled.length,
    enabledAvgIssues: avg(enabled),
    disabledAvgIssues: avg(disabled),
  };
}

/** Remove all records. Test-only; never call from production code. */
export function __clearForTest(): void {
  const filePath = activeStorage.getFilePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
