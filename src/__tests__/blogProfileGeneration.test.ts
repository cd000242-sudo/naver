import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBlogProfileStore } from '../account/blogProfileStore.js';
import { attachBlogProfile, attachBlogPerformance, findProfileAccount, snapshotBlogProfile } from '../account/blogProfileGeneration.js';

const accounts = [
  { id: 'account_car', name: '자동차', blogId: 'leadernam-', naverId: 'carlogin' },
  { id: 'account_issue', name: '이슈', blogId: 'leader_248', naverId: 'issuelogin' },
];
const store = () => createBlogProfileStore(path.join(mkdtempSync(path.join(tmpdir(), 'bpg-')), 'blog-profiles.json'));
const carProfile = { intent: 'search', subject: { topics: ['자동차 고장'] }, reader: { who: '차를 처음 산 30대', questions: ['트렁크 경고음 원인'] } };
const issueProfile = { intent: 'homefeed', subject: { topics: ['연예 이슈'], exclusions: ['열애설 추측'] }, reader: { who: '방송을 본 시청자' } };

describe('finding the blog account for a generation', () => {
  it('accepts an account.id or a unique login id, and refuses ambiguous or unknown ones', () => {
    expect(findProfileAccount(accounts, 'account_car')?.id).toBe('account_car');
    expect(findProfileAccount(accounts, 'issuelogin')?.id).toBe('account_issue');
    expect(findProfileAccount(accounts, 'nobody')).toBeUndefined();
    expect(findProfileAccount([...accounts, { id: 'dup', name: 'x', blogId: 'x', naverId: 'carlogin' }], 'carlogin')).toBeUndefined();
    expect(findProfileAccount(accounts, '')).toBeUndefined();
  });
});

describe('attaching measured performance to the next generation', () => {
  const observation = (blogId: string, post: string, pv: number, title: string) => ({
    blogId, postId: post, url: `https://blog.naver.com/${blogId}/${post}`, title, window: '72h' as const, publishedAt: null,
    metrics: { pv, homefeed: 1, search: null, dwellSeconds: null, impressions: null },
    source: { kind: 'csv' as const, fileName: 'x.csv', importedAt: '2026-10-21T00:00:00Z' },
  });
  it('each blog reads only its own measured posts, and the writer instruction carries them', async () => {
    const perf = { list: async (accountId: string, blogId: string) => accountId === 'account_car' && blogId === 'leadernam-'
      ? [observation('leadernam-', '224400000001', 120, '트렁크 경고음 원인'), observation('leadernam-', '224400000002', 3, '신차 출시 소식')] : [] };
    const car = { contentPolicyPrompt: 'BASE' }; const issue = { contentPolicyPrompt: 'BASE' };
    const a = await attachBlogPerformance({ store: perf, account: accounts[0], source: car });
    const b = await attachBlogPerformance({ store: perf, account: accounts[1], source: issue });
    expect(car.contentPolicyPrompt).toContain('트렁크 경고음 원인');
    expect(a.digest?.windows[0].measured).toBe(2);
    expect(issue.contentPolicyPrompt).toBe('BASE');
    expect(b.digest).toBeUndefined();
  });
  it('an unreadable performance file never blocks writing', async () => {
    const source = { contentPolicyPrompt: 'BASE' };
    const r = await attachBlogPerformance({ store: { list: async () => { throw new Error('disk'); } }, account: accounts[0], source });
    expect(r.warning).toBe('PERFORMANCE_UNREADABLE');
    expect(source.contentPolicyPrompt).toBe('BASE');
  });
});

describe('attaching a blog profile to a generation source', () => {
  it('the same keyword gets a different writer instruction for each blog', async () => {
    const s = store();
    await s.save(accounts[0], carProfile, 0);
    await s.save(accounts[1], issueProfile, 0);
    const a = { contentPolicyPrompt: 'BASE' }; const b = { contentPolicyPrompt: 'BASE' };
    const ra = await attachBlogProfile({ store: s, account: accounts[0], source: a });
    const rb = await attachBlogProfile({ store: s, account: accounts[1], source: b });
    expect(a.contentPolicyPrompt.startsWith('BASE')).toBe(true);
    expect(a.contentPolicyPrompt).toContain('차를 처음 산 30대');
    expect(b.contentPolicyPrompt).toContain('열애설 추측');
    expect(a.contentPolicyPrompt).not.toBe(b.contentPolicyPrompt);
    expect(ra.profileVersion).toBe(1);
    expect(rb.editorial?.intent).toBe('homefeed');
  });

  it('without a profile, a moved blog or an unreadable store the source is left exactly as before', async () => {
    const s = store();
    const plain = { contentPolicyPrompt: 'BASE' };
    expect((await attachBlogProfile({ store: s, account: accounts[0], source: plain })).profileVersion).toBeUndefined();
    expect(plain.contentPolicyPrompt).toBe('BASE');
    await s.save(accounts[0], carProfile, 0);
    const moved = { contentPolicyPrompt: 'BASE' };
    const r = await attachBlogProfile({ store: s, account: { ...accounts[0], blogId: 'someone_else' }, source: moved });
    expect(r.warning).toBe('BLOG_PROFILE_BINDING_MISMATCH');
    expect(moved.contentPolicyPrompt).toBe('BASE');
    const broken = { resolve: async () => { throw new Error('disk'); } };
    const kept = { contentPolicyPrompt: 'BASE' };
    expect((await attachBlogProfile({ store: broken, account: accounts[0], source: kept })).warning).toBe('BLOG_PROFILE_UNREADABLE');
    expect(kept.contentPolicyPrompt).toBe('BASE');
  });

  it('a snapshot taken when the topic was chosen is used for writing, even if the profile changed in between', async () => {
    const s = store();
    const v1 = await s.save(accounts[0], carProfile, 0);
    const snapshot = snapshotBlogProfile(v1);
    await s.save(accounts[0], { ...carProfile, reader: { who: '수입차 오너' } }, 1);
    const source = { contentPolicyPrompt: 'BASE' };
    const r = await attachBlogProfile({ store: s, account: accounts[0], source, snapshot });
    expect(r.profileVersion).toBe(1);
    expect(r.currentVersion).toBe(2);
    expect(source.contentPolicyPrompt).toContain('차를 처음 산 30대');
    expect(source.contentPolicyPrompt).not.toContain('수입차 오너');
  });

  it('no account means no profile (manual writing without a registered blog keeps the old path)', async () => {
    const source = { contentPolicyPrompt: '' };
    const r = await attachBlogProfile({ store: store(), account: undefined, source });
    expect(r).toEqual({});
    expect(source.contentPolicyPrompt).toBe('');
  });
});
