/**
 * outcomeBaseline.ts — read-only baseline of the label mix in published-posts.json.
 *
 * [2026-11-08 exposure-measurement plan, step 0]
 * Most stored "exposure" rows are title searches (index checks), not ranking measurements. Before changing
 * anything, this module counts how the stored rows are labelled today so later steps can be compared.
 *
 * The file is always read through a COPY in a temp dir. The original is hashed before and after, never written.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isProbeFailedCheck,
  loadPublishedPosts,
  splitExposureGroups,
  type PublishedPost,
} from './publishedPostTracker.js';
import { isExposureMeasurement, looksLikeSentence } from './searchKeyword.js';

export type KeywordFieldLabel = 'real' | 'blank' | 'same-as-title' | 'sentence-like';
export type PostMeasurementLabel = 'exposure' | 'index-only' | 'unknown';
export type KeywordSourceLabel = 'user-input' | 'leword' | 'schedule-job' | 'none' | 'not-recorded';

export interface BaselineSummary {
  readonly total: number;
  /** Per post: exposure = at least one valid ranking check, index-only = valid checks but all title/index checks. */
  readonly labels: Record<PostMeasurementLabel, number>;
  /** What the stored `keyword` field looks like, judged against the post title. */
  readonly keywordField: Record<KeywordFieldLabel, number>;
  /** Same keyword-field mix restricted to posts published on/after 2026-09-16 (KST). */
  readonly since0916: Record<KeywordFieldLabel, number> & { total: number };
  /** Explicit provenance recorded by step 1 (older rows: not-recorded). */
  readonly keywordSource: Record<KeywordSourceLabel, number>;
  /** Same split the calibration uses; usable = rows that can teach "ranked vs not ranked". */
  readonly calibration: { exposed: number; notExposed: number; unknown: number; usable: number };
}

const SINCE_0916_MS = Date.parse('2026-09-16T00:00:00+09:00');
const squash = (value: unknown): string => String(value ?? '').replace(/\s+/g, '').toLowerCase();

export function classifyKeywordField(keyword: unknown, title: unknown): KeywordFieldLabel {
  const kw = String(keyword ?? '').replace(/\s+/g, ' ').trim();
  if (!kw) return 'blank';
  if (squash(kw) === squash(title)) return 'same-as-title';
  if (looksLikeSentence(kw)) return 'sentence-like';
  return 'real';
}

function classifyPost(post: PublishedPost): PostMeasurementLabel {
  const valid = (post.exposureChecks ?? []).filter((c) => !isProbeFailedCheck(c));
  if (valid.length === 0) return 'unknown';
  return valid.some((c) => isExposureMeasurement(c, post.title)) ? 'exposure' : 'index-only';
}

const emptyFieldCounts = (): Record<KeywordFieldLabel, number> => (
  { real: 0, blank: 0, 'same-as-title': 0, 'sentence-like': 0 }
);

export function summarizeBaseline(posts: readonly PublishedPost[]): BaselineSummary {
  const labels: Record<PostMeasurementLabel, number> = { exposure: 0, 'index-only': 0, unknown: 0 };
  const keywordField = emptyFieldCounts();
  const since0916 = { total: 0, ...emptyFieldCounts() };
  const keywordSource: Record<KeywordSourceLabel, number> = {
    'user-input': 0, leword: 0, 'schedule-job': 0, none: 0, 'not-recorded': 0,
  };

  for (const post of posts) {
    labels[classifyPost(post)] += 1;
    const field = classifyKeywordField(post.keyword, post.title);
    keywordField[field] += 1;
    if (Date.parse(post.publishedAt) >= SINCE_0916_MS) {
      since0916.total += 1;
      since0916[field] += 1;
    }
    const source = (post as { keywordSource?: unknown }).keywordSource;
    const key: KeywordSourceLabel = source === 'user-input' || source === 'leword'
      || source === 'schedule-job' || source === 'none' ? source : 'not-recorded';
    keywordSource[key] += 1;
  }

  const groups = splitExposureGroups([...posts]);
  return {
    total: posts.length,
    labels,
    keywordField,
    since0916,
    keywordSource,
    calibration: {
      exposed: groups.exposed.length,
      notExposed: groups.notExposed.length,
      unknown: groups.unknownCheck.length,
      usable: groups.exposed.length + groups.notExposed.length,
    },
  };
}

export interface BaselineRun {
  readonly summary: BaselineSummary;
  readonly copyPath: string;
  readonly originalSha256: string;
  readonly copySha256: string;
}

const sha256 = (file: string): string => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Copy the file to a temp dir, summarise the copy, delete the copy. The original is only read. */
export function copyAndSummarizeBaseline(sourceFile: string): BaselineRun {
  if (!fs.existsSync(sourceFile)) throw new Error(`발행 기록 파일이 없습니다: ${sourceFile}`);
  const originalSha256 = sha256(sourceFile);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-baseline-'));
  const copyPath = path.join(tmpDir, 'published-posts.json');
  try {
    fs.copyFileSync(sourceFile, copyPath);
    const copySha256 = sha256(copyPath);
    // loadPublishedPosts only reads; pointing it at the temp dir keeps the original out of reach.
    const summary = summarizeBaseline(loadPublishedPosts(tmpDir));
    return { summary, copyPath, originalSha256, copySha256 };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
