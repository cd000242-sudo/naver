/**
 * [2026-11-08] Steps 1-3 wiring — the recorder in main carries provenance, writes the dataset row,
 * the exposure poller attaches 24/48/72h results, and the title is never stored as a keyword.
 */
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareContentPolicyForPublish, recordContentPolicyPublication } from '../contentPolicy/policyService';
import { getPostsNeedingExposureCheck, loadPublishedPosts, type PublishedPost } from '../analytics/publishedPostTracker';
import { loadOutcomeDataset } from '../analytics/outcomeDataset';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

const root = path.resolve(__dirname, '..', '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const dirs: string[] = [];
const tempDir = async () => { const d = await fs.mkdtemp(path.join(os.tmpdir(), 'outcome-wiring-')); dirs.push(d); return d; };
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true }))); });

function payload(trackingKeyword?: unknown) {
  const draft = makeGoodDraft();
  return {
    naverId: 'account-a', title: draft.title, content: draft.body_markdown, publishMode: 'publish' as const, contentMode: 'seo',
    structuredContent: { selectedTitle: draft.title, introduction: draft.introduction, headings: draft.headings,
      bodyPlain: draft.body_markdown, content: draft.body_markdown, faq: draft.faq, cta: draft.cta },
    contentPolicyContext: { input: makePolicyInput(), recentPostsSnapshot: makeRecentPosts(),
      recentPostsResult: { ok: true as const, posts: makeRecentPosts(), source: 'renderer-storage' },
      ...(trackingKeyword === undefined ? {} : { trackingKeyword }) },
  };
}

async function publish(p: ReturnType<typeof payload>, userDataPath: string, imageCount = 3) {
  const prepared = await prepareContentPolicyForPublish(p, {
    userDataPath, env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' }, now: new Date('2026-02-01T12:00:00.000Z'),
  });
  const record = {
    userDataPath, articleId: prepared.articleId, accountId: 'account-a', payload: prepared.payload,
    policyResult: prepared.policyResult, publishedUrl: 'https://blog.naver.com/account-a/123456',
    publishedAt: new Date('2026-02-01T12:01:00.000Z'), imageCount,
  };
  await recordContentPolicyPublication(record);
  return { record, title: prepared.payload.title as string };
}

describe('recorder in main — keyword provenance (step 1)', () => {
  it('a field keyword is stored with its origin and kind exposure', async () => {
    const dir = await tempDir();
    await publish(payload({ value: '부산 유품 정리', source: 'user-input' }), dir);
    const [post] = loadPublishedPosts(dir) as Array<PublishedPost & { keywordSource?: string; keywordKind?: string }>;
    expect(post.keyword).toBe('부산 유품 정리');
    expect(post.keywordSource).toBe('user-input');
    expect(post.keywordKind).toBe('exposure');
  });

  it('without provenance the policy primary_keyword is NOT trusted: source none, keyword left empty', async () => {
    const dir = await tempDir();
    const p = payload();
    expect(p.contentPolicyContext.input.primary_keyword).toBeTruthy();
    await publish(p, dir);
    const [post] = loadPublishedPosts(dir) as Array<PublishedPost & { keywordSource?: string; keywordKind?: string }>;
    expect(post.keyword).toBe('');
    expect(post.keywordSource).toBe('none');
    expect(post.keywordKind).toBe('index-only');
  });

  it('a claimed keyword that equals the title is recorded as none', async () => {
    const dir = await tempDir();
    const p = payload();
    await publish({ ...p, contentPolicyContext: { ...p.contentPolicyContext, trackingKeyword: { value: p.title, source: 'user-input' } } }, dir);
    const [post] = loadPublishedPosts(dir) as Array<PublishedPost & { keywordSource?: string }>;
    expect(post.keyword).toBe('');
    expect(post.keywordSource).toBe('none');
  });
});

describe('recorder in main — outcome dataset row (step 2)', () => {
  it('writes one row keyed blogId:logNo with features and provenance, idempotently', async () => {
    const dir = await tempDir();
    const draft = makeGoodDraft();
    const { record, title } = await publish(payload({ value: '부산 유품 정리', source: 'leword' }), dir, 4);
    await recordContentPolicyPublication(record);
    const ds = await loadOutcomeDataset(dir);
    expect(Object.keys(ds.posts)).toEqual(['account-a:123456']);
    const r = ds.posts['account-a:123456'];
    expect(r).toMatchObject({ blogId: 'account-a', logNo: '123456', mode: 'seo', keyword: { value: '부산 유품 정리', source: 'leword', kind: 'exposure' } });
    expect(r.features.headingsCount).toBe(draft.headings.length);
    expect(r.features.imageCount).toBe(4);
    expect(r.features.bodyChars).toBeGreaterThan(0);
    expect(r.features.publishHourKst).toBe(21);
    expect(r.accountHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(r)).not.toContain(draft.body_markdown.slice(0, 40));
    expect(title).toBeTruthy();
  });

  it('a no-keyword post is an index-only row with a null keyword value', async () => {
    const dir = await tempDir();
    await publish(payload(), dir);
    expect((await loadOutcomeDataset(dir)).posts['account-a:123456'].keyword).toEqual({ value: null, source: 'none', kind: 'index-only' });
  });

  it('a dataset failure never fails the publish record (advisory only)', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'outcome-dataset-v1.json'), '{broken');
    const { record } = await publish(payload({ value: '부산 유품 정리', source: 'user-input' }), dir);
    const result = await recordContentPolicyPublication(record);
    expect(result.advisoryReasons).toContain('OUTCOME_DATASET_WRITE_FAILED');
    expect(loadPublishedPosts(dir)).toHaveLength(1);
  });
});

describe('exposure polling — keyword-less posts are index-checked by title (step 1/3)', () => {
  const mk = (over: Partial<PublishedPost> & { keywordSource?: string }): PublishedPost => ({
    id: 'p', publishedAt: '2026-09-09T10:00:00.000Z', keyword: '', mode: 'seo', blogId: 'b', logNo: '1',
    url: 'https://blog.naver.com/b/1', title: '어떤 제목입니다',
    evaluator: { finalScore: 80, modeScore: 80, safetyScore: 80, humanlikeScore: 80, decision: 'pass', details: {} },
    exposureChecks: [], ...over,
  } as PublishedPost);
  const now = new Date('2026-09-10T10:00:00.000Z').getTime();

  it('source none + title is checked; legacy blank keyword (no source) still is not', () => {
    expect(getPostsNeedingExposureCheck([mk({ keywordSource: 'none' })], 24, now)).toHaveLength(1);
    expect(getPostsNeedingExposureCheck([mk({})], 24, now)).toHaveLength(0);
    expect(getPostsNeedingExposureCheck([mk({ keywordSource: 'none', title: '  ' })], 24, now)).toHaveLength(0);
  });

  it('the checker searches the title for a blank keyword and labels it index', async () => {
    vi.resetModules();
    const probe = vi.fn(async () => ({ fetchSuccess: true, totalCards: 1, hasSmartblock: false, cards: [{ position: 1, url: 'https://blog.naver.com/b/1' }] }));
    vi.doMock('../analytics/dynamicSerpProbe', () => ({ probeDynamicSerp: probe }));
    const { checkPostExposure } = await import('../analytics/exposureChecker');
    const result = await checkPostExposure('', 'b', '1', { title: '어떤 제목입니다' });
    expect(probe).toHaveBeenCalledWith('어떤 제목입니다', expect.anything());
    expect(result.keywordKind).toBe('index');
    vi.doUnmock('../analytics/dynamicSerpProbe');
  });
});

describe('static wiring locks', () => {
  it('policyService no longer feeds primary_keyword to the tracker and writes the dataset', () => {
    const s = src('src/contentPolicy/policyService.ts');
    expect(s).not.toMatch(/keyword:\s*input\.payload\.contentPolicyContext\?\.input\.primary_keyword/);
    expect(s).toMatch(/finalizeTrackingKeyword\(/);
    expect(s).toMatch(/recordPublicationOutcome\(/);
  });
  it('exposurePoller and the manual check handler attach results to the dataset', () => {
    expect(src('src/analytics/exposurePoller.ts')).toMatch(/recordOutcomeSearch\(/);
    expect(src('src/main/ipc/serpProbeHandlers.ts')).toMatch(/recordOutcomeSearch\(/);
  });
  it('the dataset file is in the backup and migration lists', () => {
    expect(src('src/main/ipc/backupHandlers.ts')).toContain("'outcome-dataset-v1.json'");
    expect(src('src/main/userDataMigration.ts')).toContain("'outcome-dataset-v1.json'");
  });
  it('generation keeps the title fallback internal and reports whether the keyword came from input', () => {
    const s = src('src/renderer/modules/contentGeneration.ts');
    expect(s).toMatch(/primaryFromInput/);
    expect(s).toMatch(/keywordsFromUserInput:\s*normalizedKeywords\.primaryFromInput/);
  });
  it('main keeps provenance across the generation hop and sets schedule-job for the smart scheduler', () => {
    const m = src('src/main.ts');
    expect(m).toMatch(/trackingKeyword:\s*\(payload\.assembly as any\)\.contentPolicyContext\?\.trackingKeyword/);
    expect(m).toMatch(/source:\s*'schedule-job'/);
  });
  it('the LEWORD picker tags the keyword field so the origin can be read later', () => {
    expect(src('src/renderer/modules/lewordBoardPicker.ts')).toMatch(/keywordOrigin\s*=\s*'leword'/);
  });
});
