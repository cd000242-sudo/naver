/**
 * outcomeDataset.ts — {userData}/outcome-dataset-v1.json
 *
 * [2026-11-08 exposure-measurement plan, steps 2-3]
 * One row per published post, keyed by `blogId:logNo`: features computed at publish time, keyword provenance,
 * and the 24/48/72h search results attached later. Written from the MAIN process only.
 *
 * Rules: atomic write (temp file -> rename), one writer at a time, an unreadable or unknown-version file is
 * never overwritten, a failed probe is "unknown" (never "not ranked"), and rows whose keyword kind is
 * index-only are never ranking rows. The blog-level daily totals (`blogDays`) are kept apart from post rows.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from '../automation/safeStateRename.js';
import type { OutcomeFeatures } from './outcomeFeatures.js';
import type { KeywordSource, OutcomeKeywordKind } from './trackingKeyword.js';

export const OUTCOME_DATASET_FILE = 'outcome-dataset-v1.json';
const MAX_BYTES = 20_000_000;
const MAX_POSTS = 5000;
const CHECKPOINTS: ReadonlyArray<24 | 48 | 72> = [24, 48, 72];

export interface OutcomeSearchEntry {
  readonly hoursAfter: 24 | 48 | 72;
  readonly checkedAt: string;
  readonly position: number | null;
  readonly outcome: 'ranked' | 'not-ranked' | 'unknown';
  /** index = title/index check of an index-only row: never a ranking measurement. */
  readonly measure: 'ranking' | 'index';
}

export interface OutcomeRow {
  readonly key: string;
  readonly blogId: string;
  readonly logNo: string;
  readonly accountHash: string;
  readonly publishedAt: string;
  readonly mode: string;
  readonly keyword: { readonly value: string | null; readonly source: KeywordSource; readonly kind: OutcomeKeywordKind };
  readonly features: OutcomeFeatures;
  readonly search: readonly OutcomeSearchEntry[];
  readonly homefeedPost: ReadonlyArray<{ window: '24h' | '72h' | '7d'; inflow: number | null; source: 'csv' }>;
}

export type NewOutcomeRow = Omit<OutcomeRow, 'key' | 'search' | 'homefeedPost'>;

export interface OutcomeDataset {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly posts: Readonly<Record<string, OutcomeRow>>;
  readonly blogDays: Readonly<Record<string, Record<string, { homefeed: number | null; total: number | null }>>>;
}

const emptyDataset = (): OutcomeDataset => ({ schemaVersion: 1, revision: 0, posts: {}, blogDays: {} });
const keyOf = (blogId: string, logNo: string): string => `${blogId}:${logNo}`;
const fileOf = (userDataPath: string): string => path.join(userDataPath, OUTCOME_DATASET_FILE);

async function readStored(file: string): Promise<OutcomeDataset | null> {
  let content: string;
  try { content = await readFile(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('OUTCOME_DATASET_UNREADABLE: 데이터 파일을 읽지 못했습니다.');
  }
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('OUTCOME_DATASET_UNREADABLE: 데이터 파일이 너무 큽니다.');
  let parsed: OutcomeDataset;
  try { parsed = JSON.parse(content); } catch { throw new Error('OUTCOME_DATASET_UNREADABLE: 데이터 파일이 깨졌습니다.'); }
  const ok = parsed && parsed.schemaVersion === 1 && parsed.posts && typeof parsed.posts === 'object' && !Array.isArray(parsed.posts);
  if (!ok) throw new Error('OUTCOME_DATASET_UNREADABLE: 알 수 없는 데이터 파일 버전입니다.');
  return { ...parsed, blogDays: parsed.blogDays && typeof parsed.blogDays === 'object' ? parsed.blogDays : {} };
}

async function writeStored(file: string, value: OutcomeDataset): Promise<void> {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > MAX_BYTES) throw new Error('OUTCOME_DATASET_TOO_LARGE: 데이터가 너무 큽니다.');
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(encoded, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
    renameWithRetry(temporary, file);
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}

// One writer at a time per process (the file is only written from main).
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const result = tail.then(job);
  tail = result.catch(() => undefined);
  return result;
}

function assertKey(blogId: string, logNo: string): void {
  if (!blogId || !logNo || blogId.includes(':') || logNo.includes(':')) {
    throw new Error('OUTCOME_DATASET_INVALID: blogId와 logNo가 필요합니다.');
  }
}

export async function loadOutcomeDataset(userDataPath: string): Promise<OutcomeDataset> {
  return (await readStored(fileOf(userDataPath))) ?? emptyDataset();
}

/** Create or refresh the row for a post. Search results already attached are kept. */
export function recordOutcomePublication(userDataPath: string, row: NewOutcomeRow): Promise<{ created: boolean }> {
  return serial(async () => {
    assertKey(row.blogId, row.logNo);
    const file = fileOf(userDataPath);
    const stored = (await readStored(file)) ?? emptyDataset();
    const key = keyOf(row.blogId, row.logNo);
    const existing = stored.posts[key];
    if (!existing && Object.keys(stored.posts).length >= MAX_POSTS) {
      throw new Error('OUTCOME_DATASET_TOO_LARGE: 글 행이 너무 많습니다.');
    }
    const next: OutcomeRow = {
      ...row, key, search: existing?.search ?? [], homefeedPost: existing?.homefeedPost ?? [],
    };
    await writeStored(file, { ...stored, revision: stored.revision + 1, posts: { ...stored.posts, [key]: next } });
    return { created: !existing };
  });
}

export interface OutcomeSearchInput {
  readonly blogId: string;
  readonly logNo: string;
  readonly hoursAfter: number;
  readonly checkedAt: string;
  readonly position: number | null;
  readonly probeFailed: boolean;
}

/** Attach one 24/48/72h check to an existing row. Returns false (and writes nothing) when there is no such row. */
export function recordOutcomeSearch(userDataPath: string, input: OutcomeSearchInput): Promise<boolean> {
  return serial(async () => {
    assertKey(input.blogId, input.logNo);
    const checkpoint = CHECKPOINTS.find((h) => Math.abs(h - input.hoursAfter) <= 6);
    const file = fileOf(userDataPath);
    const stored = await readStored(file);
    const key = keyOf(input.blogId, input.logNo);
    const row = stored?.posts[key];
    if (!stored || !row || !checkpoint) return false;
    const outcome: OutcomeSearchEntry['outcome'] = input.probeFailed ? 'unknown'
      : input.position === null ? 'not-ranked' : 'ranked';
    const entry: OutcomeSearchEntry = {
      hoursAfter: checkpoint,
      checkedAt: input.checkedAt,
      position: input.probeFailed ? null : input.position,
      outcome,
      measure: row.keyword.kind === 'exposure' ? 'ranking' : 'index',
    };
    const search = [...row.search.filter((s) => s.hoursAfter !== checkpoint), entry]
      .sort((a, b) => a.hoursAfter - b.hoursAfter);
    await writeStored(file, {
      ...stored, revision: stored.revision + 1, posts: { ...stored.posts, [key]: { ...row, search } },
    });
    return true;
  });
}

/** Only rows with a real keyword may teach "ranked vs not ranked". Index-only rows are counted separately. */
export function isRankingRow(row: OutcomeRow): boolean {
  return row.keyword.kind === 'exposure' && row.keyword.source !== 'none' && row.keyword.value !== null;
}
