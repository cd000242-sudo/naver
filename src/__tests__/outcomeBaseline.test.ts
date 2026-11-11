/**
 * [2026-11-08] Step 0 of the exposure-measurement plan: a read-only baseline of the label mix
 * in published-posts.json, so later steps can be compared against it.
 *
 * Contract: the counts come from a COPY in a temp dir; the original is never written.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  summarizeBaseline,
  copyAndSummarizeBaseline,
} from '../analytics/outcomeBaseline';
import type { PublishedPost } from '../analytics/publishedPostTracker';

type Check = NonNullable<PublishedPost['exposureChecks']>[number];

const check = (over: Partial<Check> = {}): Check => ({
  checkedAt: '2026-10-01T00:00:00.000Z',
  hoursAfter: 24,
  searchedKeyword: '전기요금 폭탄',
  position: 3,
  hasSmartblock: false,
  ...over,
});

const post = (id: string, over: Partial<PublishedPost> = {}): PublishedPost => ({
  id,
  publishedAt: '2026-10-01T00:00:00.000Z',
  keyword: '전기요금 폭탄',
  mode: 'seo',
  blogId: 'b',
  logNo: id,
  url: `https://blog.naver.com/b/${id}`,
  title: '전기요금이 갑자기 올랐을 때 먼저 확인할 세 가지',
  evaluator: { finalScore: 80, modeScore: 80, safetyScore: 80, humanlikeScore: 80, decision: 'pass', details: {} },
  exposureChecks: [],
  ...over,
});

const tmpDirs: string[] = [];
const mkTmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-baseline-test-'));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop() as string, { recursive: true, force: true });
});

describe('summarizeBaseline — label counts', () => {
  it('counts exposure / index-only / unknown per post from its valid checks', () => {
    const posts = [
      post('1', { exposureChecks: [check({ keywordKind: 'exposure', position: 4 })] }),
      post('2', { exposureChecks: [check({ keywordKind: 'exposure', position: null, notes: '상위 30개 중 미발견' })] }),
      post('3', { exposureChecks: [check({ keywordKind: 'index', position: 1 })] }),
      post('4', { exposureChecks: [check({ probeFailed: true, position: null })] }),
      post('5', { exposureChecks: [] }),
    ];
    const s = summarizeBaseline(posts);
    expect(s.total).toBe(5);
    expect(s.labels).toEqual({ exposure: 2, 'index-only': 1, unknown: 2 });
  });

  it('a post with both kinds of checks is an exposure post', () => {
    const s = summarizeBaseline([
      post('1', { exposureChecks: [check({ keywordKind: 'index' }), check({ hoursAfter: 48, keywordKind: 'exposure' })] }),
    ]);
    expect(s.labels).toEqual({ exposure: 1, 'index-only': 0, unknown: 0 });
  });

  it('reports the keyword provenance mix of the stored keyword field', () => {
    const posts = [
      post('real', { keyword: '전기요금 폭탄' }),
      post('blank', { keyword: '' }),
      post('title', { keyword: '전기요금이 갑자기 올랐을 때 먼저 확인할 세 가지' }),
      post('sentence', { keyword: '전기요금이 갑자기 올랐을 때 먼저 확인할 것들' }),
    ];
    const s = summarizeBaseline(posts);
    expect(s.keywordField).toEqual({ real: 1, blank: 1, 'same-as-title': 1, 'sentence-like': 1 });
  });

  it('reports how many posts carry an explicit keywordSource once step 1 is live', () => {
    const s = summarizeBaseline([
      post('1', { keywordSource: 'user-input' } as Partial<PublishedPost>),
      post('2', { keywordSource: 'none' } as Partial<PublishedPost>),
      post('3'),
    ]);
    expect(s.keywordSource).toEqual({ 'user-input': 1, leword: 0, 'schedule-job': 0, none: 1, 'not-recorded': 1 });
  });

  it('reconciles with the calibration split (usable answers = exposed + not exposed)', () => {
    const s = summarizeBaseline([
      post('1', { exposureChecks: [check({ keywordKind: 'exposure', position: 2 })] }),
      post('2', { exposureChecks: [check({ keywordKind: 'exposure', position: null, notes: '상위 30개 중 미발견' })] }),
      post('3', { exposureChecks: [check({ keywordKind: 'index' })] }),
    ]);
    expect(s.calibration).toEqual({ exposed: 1, notExposed: 1, unknown: 1, usable: 2 });
  });

  it('counts per month so the 9/16 cut-over is visible', () => {
    const s = summarizeBaseline([
      post('1', { publishedAt: '2026-09-10T00:00:00.000Z' }),
      post('2', { publishedAt: '2026-09-20T00:00:00.000Z' }),
      post('3', { publishedAt: '2026-09-21T00:00:00.000Z', keyword: '' }),
    ]);
    expect(s.since0916).toEqual({
      total: 2, real: 1, blank: 1, 'same-as-title': 0, 'sentence-like': 0,
    });
  });
});

describe('copyAndSummarizeBaseline — never touches the original', () => {
  const writeOriginal = (): { file: string; sha: string } => {
    const dir = mkTmp();
    const file = path.join(dir, 'published-posts.json');
    fs.writeFileSync(file, JSON.stringify([post('1', { exposureChecks: [check({ keywordKind: 'exposure' })] })], null, 2));
    return { file, sha: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  };

  it('reads from a temp copy and leaves the original byte-identical', () => {
    const { file, sha } = writeOriginal();
    const mtimeBefore = fs.statSync(file).mtimeMs;
    const result = copyAndSummarizeBaseline(file);
    expect(result.summary.total).toBe(1);
    expect(result.copyPath).not.toBe(file);
    expect(path.dirname(result.copyPath)).not.toBe(path.dirname(file));
    expect(createHash('sha256').update(fs.readFileSync(file)).digest('hex')).toBe(sha);
    expect(fs.statSync(file).mtimeMs).toBe(mtimeBefore);
    expect(result.originalSha256).toBe(sha);
    expect(result.copySha256).toBe(sha);
  });

  it('removes the temp copy afterwards', () => {
    const { file } = writeOriginal();
    const result = copyAndSummarizeBaseline(file);
    expect(fs.existsSync(result.copyPath)).toBe(false);
  });

  it('fails clearly when the file is missing instead of creating anything', () => {
    const dir = mkTmp();
    const missing = path.join(dir, 'nope.json');
    expect(() => copyAndSummarizeBaseline(missing)).toThrow(/없습니다|not found/i);
    expect(fs.existsSync(missing)).toBe(false);
  });
});
