/**
 * Append-only store for post performance metrics.
 *
 * Why this exists:
 * The W3 feedback loop needs per-post performance data (views, likes,
 * comments) to correlate with the feature flags captured at publish time.
 * Naver does NOT expose a per-post metrics API — the only safe sources are:
 *   (a) manual user input,
 *   (b) the Search Advisor OpenAPI for sitemap / indexing status,
 *   (c) aggregate stats the user copies from Naver Blog admin dashboard.
 *
 * Under NO circumstance do we scrape the logged-in blog statistics page.
 * That is an explicit red line from the security-auditor review — Korean
 * criminal law precedent (Kream v. Naver, 2021) treats it as computer-
 * interference. Every write goes through this store with an explicit
 * `source` field so downstream analytics can filter out hand-entered data
 * if reliability differs.
 *
 * Schema evolution: new optional fields only. The JSON file is append-only
 * in the logical sense — we write each snapshot as a new record rather than
 * overwriting a post's prior record, so history can be plotted later.
 */

import * as fs from 'fs';
import * as path from 'path';

export type MetricSource = 'manual' | 'search_advisor' | 'analytics_api' | 'unknown';

export interface PostMetricSnapshot {
  /** Same postId used by featureFlagTracker — the join key. */
  postId: string;
  /** ISO 8601 timestamp of THIS snapshot (not the publish time). */
  checkedAt: string;
  views: number;
  likes: number;
  comments: number;
  /** Homefeed visit count if the user can split it out; otherwise 0. */
  homefeedViews?: number;
  /** Search-referred visit count; optional. */
  searchViews?: number;
  /** Where this row came from — callers MUST set this explicitly. */
  source: MetricSource;
  /** Free-form note, never load-bearing. */
  notes?: string;
}

type Storage = { getFilePath(): string };

function defaultStorage(): Storage {
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
  return { getFilePath: () => path.join(basePath, 'post_metrics.json') };
}

let activeStorage: Storage = defaultStorage();

export function __setStorageForTest(filePath: string): void {
  activeStorage = { getFilePath: () => filePath };
}

export function __clearForTest(): void {
  const filePath = activeStorage.getFilePath();
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function readAll(): PostMetricSnapshot[] {
  const filePath = activeStorage.getFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[postMetricsStore] read failed, returning empty:', err);
    return [];
  }
}

function writeAll(records: PostMetricSnapshot[]): void {
  const filePath = activeStorage.getFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

function validate(snapshot: PostMetricSnapshot): void {
  if (!snapshot.postId) throw new Error('appendMetric: postId is required');
  if (!snapshot.checkedAt) throw new Error('appendMetric: checkedAt is required');
  if (!snapshot.source) throw new Error('appendMetric: source is required');
  for (const key of ['views', 'likes', 'comments'] as const) {
    const v = snapshot[key];
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`appendMetric: ${key} must be a non-negative number`);
    }
  }
}

/**
 * Append a new snapshot. Never overwrites prior records for the same postId.
 * That is intentional — two snapshots of the same post at different times
 * tell you the growth curve.
 */
export function appendMetric(snapshot: PostMetricSnapshot): void {
  validate(snapshot);
  const records = readAll();
  records.push(snapshot);
  writeAll(records);
}

export function listForPost(postId: string): PostMetricSnapshot[] {
  return readAll()
    .filter((r) => r.postId === postId)
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
}

export function getLatest(postId: string): PostMetricSnapshot | null {
  const list = listForPost(postId);
  return list.length > 0 ? list[list.length - 1] : null;
}

export function listAll(): PostMetricSnapshot[] {
  return readAll();
}

/**
 * Latest snapshot per postId (deduplicated). Used by cohortAnalyzer so a post
 * with 5 snapshots doesn't count 5× in averages.
 */
export function listLatestPerPost(): PostMetricSnapshot[] {
  const byPost = new Map<string, PostMetricSnapshot>();
  for (const snap of readAll()) {
    const prev = byPost.get(snap.postId);
    if (!prev || snap.checkedAt.localeCompare(prev.checkedAt) > 0) {
      byPost.set(snap.postId, snap);
    }
  }
  return Array.from(byPost.values());
}
