import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareContentPolicyForPublish, recordContentPolicyPublication, recordContentPolicyReservation, type ContentPolicyPayload } from '../contentPolicy/policyService';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { RecentPostsRepository } from '../contentPolicy/recentPostsRepository';
import { ContentPolicyAuditStore } from '../contentPolicy/auditStore';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

const directories: string[] = [];
const recordedAt = new Date('2026-10-25T00:30:00.000Z');
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});
async function fixture(mode: 'publish' | 'schedule') {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-record-advisory-')); directories.push(userDataPath);
  const draft = makeGoodDraft();
  const payload = { naverId: 'account-a', postId: 'current-record', title: draft.title, content: draft.body_markdown,
    publishMode: mode, scheduleDate: '2026-10-25', scheduleTime: '09:30',
    images: [{ filePath: path.join(userDataPath, 'original-image.png'), heading: '원본 소제목' }],
    structuredContent: { selectedTitle: draft.title, introduction: draft.introduction, headings: draft.headings, bodyPlain: draft.body_markdown },
    contentPolicyContext: { input: makePolicyInput(), recentPostsSnapshot: makeRecentPosts() } };
  const prepared = await prepareContentPolicyForPublish(payload, { userDataPath, now: new Date('2026-10-24T00:00:00.000Z'), env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' } });
  const store = new PublicationStateStore(userDataPath);
  await store.recordPublication({ article_id: 'previous-record', account_id: 'account-a', published_at: '2026-10-23T00:30:00.000Z', template_id: 'old-template', structure_type: 'old-structure', topic_angle: 'old-angle', exposure_status: 'PENDING_INDEX' });
  const common = { userDataPath, articleId: 'current-record', accountId: 'account-a', payload, policyResult: prepared.policyResult };
  return { userDataPath, payload, store, common, record: (nextPayload: ContentPolicyPayload = payload) => mode === 'schedule'
    ? recordContentPolicyReservation({ ...common, payload: nextPayload, scheduledAt: recordedAt })
    : recordContentPolicyPublication({ ...common, payload: nextPayload, publishedAt: recordedAt, publishedUrl: 'https://blog.naver.com/account-a/223123456789' }) };
}

describe.each(['publish', 'schedule'] as const)('%s records keep comparison-cache failures advisory', mode => {
  it.each(['missing-headings', 'cache-write-failed'] as const)('preserves the successful ledger, draft, images and time when %s', async failure => {
    const f = await fixture(mode);
    const payload = failure === 'missing-headings' ? { ...f.payload, structuredContent: { ...f.payload.structuredContent, headings: [] } } : f.payload;
    const snapshot = JSON.stringify(payload);
    const cachePath = new RecentPostsRepository(f.userDataPath).filePath;
    const previousCache = await fs.readFile(cachePath, 'utf8');
    const previousHistory = (await f.store.load()).history;
    await fs.writeFile(payload.images[0].filePath, 'unchanged image bytes');
    if (failure === 'cache-write-failed') vi.spyOn(RecentPostsRepository.prototype, 'record').mockRejectedValue(new Error('EACCES: cache write failed'));

    await expect(f.record(payload)).resolves.toEqual({ advisoryReasons: ['POLICY_RECENT_POSTS_WRITE_FAILED'] });

    const state = await f.store.load();
    expect(state.status).toBe('ACTIVE');
    expect(state.history).toEqual([...previousHistory, expect.objectContaining({ article_id: 'current-record', account_id: 'account-a', published_at: recordedAt.toISOString() })]);
    expect(state.last_advisory_reason).toBe('POLICY_RECENT_POSTS_WRITE_FAILED');
    expect(JSON.stringify(payload)).toBe(snapshot);
    expect(await fs.readFile(payload.images[0].filePath, 'utf8')).toBe('unchanged image bytes');
    expect(await fs.readFile(cachePath, 'utf8')).toBe(previousCache);
    const audits = await new ContentPolicyAuditStore(f.userDataPath).readRecent(20);
    expect(audits.some(item => item.article_id === 'current-record' && item.publish_time === recordedAt.toISOString())).toBe(true);
  });

  it('propagates the original enforcement-ledger error without attempting or disguising a cache write', async () => {
    const f = await fixture(mode); const originalState = await f.store.load();
    const ledgerFailure = new Error('ENOSPC: core publication ledger');
    vi.spyOn(PublicationStateStore.prototype, 'recordPublication').mockRejectedValue(ledgerFailure);
    const cache = vi.spyOn(RecentPostsRepository.prototype, 'record');
    const advisory = vi.spyOn(PublicationStateStore.prototype, 'recordAdvisory');
    const audit = vi.spyOn(ContentPolicyAuditStore.prototype, 'append');
    await expect(f.record()).rejects.toBe(ledgerFailure);
    expect(cache).not.toHaveBeenCalled(); expect(advisory).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();
    expect(await f.store.load()).toEqual(originalState);
  });

  it('returns the cache advisory even when advisory persistence also fails', async () => {
    const f = await fixture(mode);
    vi.spyOn(RecentPostsRepository.prototype, 'record').mockRejectedValue(new Error('cache unavailable'));
    vi.spyOn(PublicationStateStore.prototype, 'recordAdvisory').mockRejectedValue(new Error('advisory unavailable'));
    await expect(f.record()).resolves.toEqual({ advisoryReasons: ['POLICY_RECENT_POSTS_WRITE_FAILED'] });
    expect((await f.store.load()).history.some(entry => entry.article_id === 'current-record')).toBe(true);
  });

  it('combines independent audit and cache advisories without suppressing either failure', async () => {
    const f = await fixture(mode);
    vi.spyOn(RecentPostsRepository.prototype, 'record').mockRejectedValue(new Error('cache unavailable'));
    vi.spyOn(ContentPolicyAuditStore.prototype, 'append').mockRejectedValue(new Error('audit unavailable'));
    const result = await f.record();
    expect(result.advisoryReasons).toEqual(['POLICY_RECENT_POSTS_WRITE_FAILED', 'POLICY_AUDIT_LOG_WRITE_FAILED']);
    expect((await f.store.load()).last_advisory_reason).toBe('POLICY_RECENT_POSTS_WRITE_FAILED,POLICY_AUDIT_LOG_WRITE_FAILED');
  });

  it('records a complete draft even when optional generation context is absent', async () => {
    const f = await fixture(mode);
    const { contentPolicyContext: _context, ...withoutContext } = f.payload;
    const before = JSON.stringify(withoutContext);
    await expect(f.record(withoutContext)).resolves.toEqual({ advisoryReasons: [] });
    expect(JSON.stringify(withoutContext)).toBe(before);
    expect((await f.store.load()).history.some(entry => entry.article_id === 'current-record')).toBe(true);
  });
  it('keeps successful comparison records and returns no advisory', async () => {
    const f = await fixture(mode);
    await expect(f.record()).resolves.toEqual({ advisoryReasons: [] });
    const cache = await new RecentPostsRepository(f.userDataPath).loadRecentPosts();
    expect(cache.ok && cache.posts.some(post => post.article_id === 'current-record' && post.published_at === recordedAt.toISOString())).toBe(true);
  });
});

it('rejects an invalid reservation time before either the ledger or comparison cache is touched', async () => {
  const f = await fixture('schedule');
  const ledger = vi.spyOn(PublicationStateStore.prototype, 'recordPublication');
  const cache = vi.spyOn(RecentPostsRepository.prototype, 'record');
  await expect(recordContentPolicyReservation({ ...f.common, scheduledAt: new Date('invalid') })).rejects.toThrow('POLICY_RESERVATION_DATE_INVALID');
  expect(ledger).not.toHaveBeenCalled(); expect(cache).not.toHaveBeenCalled();
});