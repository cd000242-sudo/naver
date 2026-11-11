/**
 * [2026-11-08] Steps 2+3 — outcome-dataset-v1.json: atomic write, one row per post, search results attached.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  OUTCOME_DATASET_FILE,
  isRankingRow,
  loadOutcomeDataset,
  recordOutcomePublication,
  recordOutcomeSearch,
  type NewOutcomeRow,
} from '../analytics/outcomeDataset';

const dirs: string[] = [];
const tmp = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-dataset-'));
  dirs.push(d);
  return d;
};
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true }); });

const features = {
  featureVersion: 1 as const, titleType: 'statement', headingsCount: 4, bodyChars: 2000, sentenceLenStdDev: 12.5,
  questionCount: 1, imageCount: 5, publishHourKst: 9, keywordDifficulty: null,
};
const row = (over: Partial<NewOutcomeRow> = {}): NewOutcomeRow => ({
  blogId: 'blog-a', logNo: '1001', accountHash: 'abc', publishedAt: '2026-11-03T00:00:00.000Z', mode: 'seo',
  keyword: { value: '전기요금 폭탄', source: 'user-input', kind: 'exposure' }, features, ...over,
});

describe('recordOutcomePublication', () => {
  it('writes {userData}/outcome-dataset-v1.json with schemaVersion 1 keyed by blogId:logNo', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row());
    const raw = JSON.parse(fs.readFileSync(path.join(dir, OUTCOME_DATASET_FILE), 'utf8'));
    expect(OUTCOME_DATASET_FILE).toBe('outcome-dataset-v1.json');
    expect(raw.schemaVersion).toBe(1);
    expect(raw.posts['blog-a:1001']).toMatchObject({ key: 'blog-a:1001', mode: 'seo', search: [], homefeedPost: [] });
    expect(raw.blogDays).toEqual({});
  });

  it('leaves no temp file behind and does not duplicate the same post', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row());
    await recordOutcomePublication(dir, row());
    expect(Object.keys((await loadOutcomeDataset(dir)).posts)).toEqual(['blog-a:1001']);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('re-recording keeps the search results already attached', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row());
    await recordOutcomeSearch(dir, { blogId: 'blog-a', logNo: '1001', hoursAfter: 24, checkedAt: 'x', position: 3, probeFailed: false });
    await recordOutcomePublication(dir, row());
    expect((await loadOutcomeDataset(dir)).posts['blog-a:1001'].search).toHaveLength(1);
  });

  it('refuses to overwrite a file with an unknown schema version', async () => {
    const dir = tmp();
    const file = path.join(dir, OUTCOME_DATASET_FILE);
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 2, posts: {} }));
    await expect(recordOutcomePublication(dir, row())).rejects.toThrow(/OUTCOME_DATASET_UNREADABLE/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion).toBe(2);
  });

  it('refuses to overwrite a corrupt file', async () => {
    const dir = tmp();
    const file = path.join(dir, OUTCOME_DATASET_FILE);
    fs.writeFileSync(file, '{not json');
    await expect(recordOutcomePublication(dir, row())).rejects.toThrow(/OUTCOME_DATASET_UNREADABLE/);
    expect(fs.readFileSync(file, 'utf8')).toBe('{not json');
  });

  it('serialises concurrent writers without losing rows', async () => {
    const dir = tmp();
    await Promise.all(Array.from({ length: 12 }, (_, i) => recordOutcomePublication(dir, row({ logNo: String(2000 + i) }))));
    expect(Object.keys((await loadOutcomeDataset(dir)).posts)).toHaveLength(12);
  });

  it('index-only rows are stored but never ranking rows', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row({ keyword: { value: null, source: 'none', kind: 'index-only' } }));
    const stored = (await loadOutcomeDataset(dir)).posts['blog-a:1001'];
    expect(stored.keyword).toEqual({ value: null, source: 'none', kind: 'index-only' });
    expect(isRankingRow(stored)).toBe(false);
  });
});

describe('recordOutcomeSearch — step 3', () => {
  const check = (over = {}) => ({ blogId: 'blog-a', logNo: '1001', hoursAfter: 24 as const, checkedAt: '2026-11-04T00:00:00.000Z', position: 5 as number | null, probeFailed: false, ...over });

  it('ranked / not-ranked / unknown (a failed probe is never "not ranked")', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row());
    await recordOutcomeSearch(dir, check({ hoursAfter: 24, position: 5 }));
    await recordOutcomeSearch(dir, check({ hoursAfter: 48, position: null }));
    await recordOutcomeSearch(dir, check({ hoursAfter: 72, position: null, probeFailed: true }));
    const search = (await loadOutcomeDataset(dir)).posts['blog-a:1001'].search;
    expect(search.map((s) => [s.hoursAfter, s.outcome, s.position])).toEqual([[24, 'ranked', 5], [48, 'not-ranked', null], [72, 'unknown', null]]);
    expect(search.every((s) => s.measure === 'ranking')).toBe(true);
  });

  it('a retry for the same checkpoint replaces the earlier entry instead of duplicating it', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row());
    await recordOutcomeSearch(dir, check({ probeFailed: true, position: null }));
    await recordOutcomeSearch(dir, check({ position: 2 }));
    const search = (await loadOutcomeDataset(dir)).posts['blog-a:1001'].search;
    expect(search).toHaveLength(1);
    expect(search[0].outcome).toBe('ranked');
  });

  it('index-only rows keep their checks marked measure=index so they are never counted as ranking', async () => {
    const dir = tmp();
    await recordOutcomePublication(dir, row({ keyword: { value: null, source: 'none', kind: 'index-only' } }));
    await recordOutcomeSearch(dir, check({ position: 1 }));
    const search = (await loadOutcomeDataset(dir)).posts['blog-a:1001'].search;
    expect(search[0].measure).toBe('index');
  });

  it('does not invent a row for an unknown post', async () => {
    const dir = tmp();
    expect(await recordOutcomeSearch(dir, check())).toBe(false);
    expect(fs.existsSync(path.join(dir, OUTCOME_DATASET_FILE))).toBe(false);
  });
});
