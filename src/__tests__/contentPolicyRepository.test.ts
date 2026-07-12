import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentPolicyAuditStore } from '../contentPolicy/auditStore';
import { RecentPostsRepository } from '../contentPolicy/recentPostsRepository';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { makePassPolicyResult, makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-policy-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('RecentPostsRepository', () => {
  it('returns unavailable instead of an empty successful list when no store exists', async () => {
    const repository = new RecentPostsRepository(await makeTempDir());
    const result = await repository.loadRecentPosts(50);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('RECENT_POSTS_UNAVAILABLE');
  });

  it('persists a renderer snapshot and reads complete recent records back', async () => {
    const repository = new RecentPostsRepository(await makeTempDir());
    const saved = await repository.mergeSnapshot(makeRecentPosts(25));
    const loaded = await repository.loadRecentPosts(20);

    expect(saved).toBe(25);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.posts).toHaveLength(20);
      expect(loaded.posts.every((post) => post.title && post.intro && post.headings.length >= 1 && post.body)).toBe(true);
    }
  });

  it('reports corrupt JSON without silently converting it to an empty list', async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, 'content-policy-articles.json'), '{broken', 'utf8');
    const result = await new RecentPostsRepository(dir).loadRecentPosts(50);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('RECENT_POSTS_CORRUPT');
  });

  it('persists exposure status updates without dropping comparison fields', async () => {
    const repository = new RecentPostsRepository(await makeTempDir());
    await repository.mergeSnapshot(makeRecentPosts(20));

    const updated = await repository.updateExposureStatus('recent-0', 'MISSING_CONFIRMED');
    const loaded = await repository.loadRecentPosts(50);

    expect(updated).toBe(true);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const post = loaded.posts.find((item) => item.article_id === 'recent-0');
      expect(post?.exposure_status).toBe('MISSING_CONFIRMED');
      expect(post?.title).toBeTruthy();
      expect(post?.body).toBeTruthy();
      expect(post?.headings.length).toBeGreaterThan(0);
    }
  });

  it('serializes concurrent snapshot merges without losing either writer', async () => {
    const repository = new RecentPostsRepository(await makeTempDir());
    const first = makeRecentPosts(25).map((post, index) => ({ ...post, article_id: `first-${index}` }));
    const second = makeRecentPosts(25).map((post, index) => ({ ...post, article_id: `second-${index}` }));

    await Promise.all([repository.mergeSnapshot(first), repository.mergeSnapshot(second)]);
    const loaded = await repository.loadRecentPosts(500);

    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(new Set(loaded.posts.map((post) => post.article_id)).size).toBe(50);
  });
});

describe('content policy persistence', () => {
  it('writes append-only audit records and reads the newest entries', async () => {
    const dir = await makeTempDir();
    const store = new ContentPolicyAuditStore(dir);
    const result = makePassPolicyResult();
    await store.append({
      article_id: 'article-1',
      created_at: '2026-01-01T00:00:00.000Z',
      input_hash: result.input_hash,
      selected_intent: result.intent.type,
      topic_angle: result.uniqueness_plan.topic_angle,
      structure_type: result.uniqueness_plan.structure_type,
      template_id: result.publication.template_id,
      similarity_scores: result.similarity_report,
      quality_score: result.quality_report.total_score,
      rewrite_count: result.rewrite_count,
      decision: result.decision,
      block_reasons: result.block_reasons,
      prompt_version: result.prompt_version,
      model_version: result.model_version,
      policy_version: result.policy_version,
    });

    const records = await store.readRecent(10);
    expect(records).toHaveLength(1);
    expect(records[0].article_id).toBe('article-1');
  });

  it('refuses to append through a corrupt audit log', async () => {
    const dir = await makeTempDir();
    const store = new ContentPolicyAuditStore(dir);
    await fs.writeFile(store.filePath, '{broken-json}\n', 'utf8');

    await expect(store.append({ article_id: 'new-record' } as any))
      .rejects.toThrow(/AUDIT_LOG_CORRUPT_LINE/);
  });

  it('serializes concurrent publication history updates without lost records', async () => {
    const store = new PublicationStateStore(await makeTempDir());
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.recordPublication({
      article_id: `article-${index}`,
      account_id: 'account-a',
      published_at: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
      template_id: `template-${index}`,
      structure_type: `structure-${index}`,
      topic_angle: `angle-${index}`,
      exposure_status: 'PENDING_INDEX',
    })));

    const state = await store.load();
    expect(new Set(state.history.map((entry) => entry.article_id)).size).toBe(12);
  });

  it('requires root-cause review and a verified manual test before resume', async () => {
    const store = new PublicationStateStore(await makeTempDir());
    await store.pauseAll('two consecutive misses');

    await expect(store.resume({
      approvedBy: 'operator',
      rootCauseReviewed: true,
      manualTestVerified: false,
    })).rejects.toThrow(/MANUAL_TEST_REQUIRED/);

    const paused = await store.load();
    await store.save({
      ...paused,
      manual_test_evidence: {
        article_id: 'manual-test-1',
        blog_id: 'test',
        primary_keyword: 'manual test',
        url: 'https://blog.naver.com/test/1',
        title: 'manual test',
        verified_at: new Date().toISOString(),
        passed: true,
        checks: [
          { method: 'url_access', outcome: 'FOUND', checked_at: new Date().toISOString() },
          { method: 'exact_title_search', outcome: 'FOUND', checked_at: new Date().toISOString() },
        ],
      },
    });

    const resumed = await store.resume({
      approvedBy: 'operator',
      rootCauseReviewed: true,
      manualTestVerified: true,
    });
    expect(resumed.status).toBe('ACTIVE');
    expect(resumed.resume_approval?.approved_by).toBe('operator');
  });
});
