import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentPolicyAuditStore } from '../contentPolicy/auditStore';
import { processExposureMonitoring } from '../contentPolicy/exposureMonitoringService';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { RecentPostsRepository } from '../contentPolicy/recentPostsRepository';
import type { AuditRecord, ExposureCheck } from '../contentPolicy/types';
import { makePassPolicyResult, makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'exposure-monitoring-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function audit(articleId: string): AuditRecord {
  const result = makePassPolicyResult();
  return {
    article_id: articleId,
    created_at: '2026-07-10T00:00:00.000Z',
    input_hash: result.input_hash,
    selected_intent: result.intent.type,
    topic_angle: result.uniqueness_plan.topic_angle,
    structure_type: result.uniqueness_plan.structure_type,
    template_id: result.publication.template_id,
    similarity_scores: result.similarity_report,
    quality_score: result.quality_report.total_score,
    rewrite_count: result.rewrite_count,
    decision: result.decision,
    block_reasons: [],
    prompt_version: result.prompt_version,
    model_version: result.model_version,
    policy_version: result.policy_version,
  };
}

function misses(at: string): ExposureCheck[] {
  return [
    { method: 'blog_search_tab', outcome: 'NOT_FOUND', checked_at: at },
    { method: 'integrated_search', outcome: 'NOT_FOUND', checked_at: at },
    { method: 'url_access', outcome: 'ERROR', checked_at: at },
  ];
}

describe('exposure monitoring persistence', () => {
  it('records confirmed exposure misses as advisories without pausing generation or publishing', async () => {
    const userDataPath = await tempDir();
    const recent = makeRecentPosts(20).map((post, index) => ({
      ...post,
      article_id: `article-${index}`,
      template_id: 'reader-guide-v1',
      structure_type: `structure-${index}`,
      url: `https://blog.naver.com/test/${1000 + index}`,
    }));
    const repository = new RecentPostsRepository(userDataPath);
    const stateStore = new PublicationStateStore(userDataPath);
    const auditStore = new ContentPolicyAuditStore(userDataPath);
    await repository.mergeSnapshot(recent);
    await stateStore.recordPublication({
      article_id: 'article-0', account_id: 'account-a', published_at: recent[0].published_at!,
      template_id: 'reader-guide-v1', structure_type: 'structure-0', topic_angle: recent[0].topic_angle,
      exposure_status: 'PENDING_INDEX',
    });
    await stateStore.recordPublication({
      article_id: 'article-1', account_id: 'account-a', published_at: recent[1].published_at!,
      template_id: 'reader-guide-v1', structure_type: 'structure-1', topic_angle: recent[1].topic_angle,
      exposure_status: 'PENDING_INDEX',
    });
    await auditStore.append(audit('article-0'));
    await auditStore.append(audit('article-1'));

    const first = await processExposureMonitoring({
      userDataPath,
      target: {
        trackerId: 'tracker-0', title: recent[0].title, keyword: 'keyword', blogId: 'test',
        logNo: '1000', url: recent[0].url!,
      },
      checks: misses('2026-07-12T00:00:00.000Z'),
      now: new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(first.publication.exposure_status).toBe('MISSING_CONFIRMED');
    expect(first.state.status).toBe('ACTIVE');
    expect(first.state.paused_templates).toContain('reader-guide-v1');

    const second = await processExposureMonitoring({
      userDataPath,
      target: {
        trackerId: 'tracker-1', title: recent[1].title, keyword: 'keyword', blogId: 'test',
        logNo: '1001', url: recent[1].url!,
      },
      checks: misses('2026-07-12T01:00:00.000Z'),
      now: new Date('2026-07-12T01:00:00.000Z'),
    });

    expect(second.state.status).toBe('ACTIVE');
    expect(second.state.confirmed_missing_streak).toBe(2);
    expect(second.state.last_advisory_reason).toBe('TWO_CONSECUTIVE_CONFIRMED_MISSING');
    expect(second.state.pause_incident).toMatchObject({
      article_id: 'article-1',
      blog_id: 'test',
      primary_keyword: 'keyword',
    });
    expect(second.rootCause?.category).toBe('CONFIRMED_DISCOVERY_FAILURE');
    const loaded = await repository.loadRecentPosts(50);
    expect(loaded.ok && loaded.posts.find((post) => post.article_id === 'article-1')?.exposure_status)
      .toBe('MISSING_CONFIRMED');
  });

  it('finds a monitored article outside the newest 50-post similarity window', async () => {
    const userDataPath = await tempDir();
    const recent = makeRecentPosts(60).map((post, index) => ({
      ...post,
      article_id: `old-target-${index}`,
      published_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      url: `https://blog.naver.com/test/${2000 + index}`,
    }));
    const target = recent[0];
    const repository = new RecentPostsRepository(userDataPath);
    const stateStore = new PublicationStateStore(userDataPath);
    await repository.mergeSnapshot(recent);
    await stateStore.recordPublication({
      article_id: target.article_id, account_id: 'account-a', published_at: target.published_at!,
      template_id: target.template_id!, structure_type: target.structure_type,
      topic_angle: target.topic_angle, exposure_status: 'PENDING_INDEX',
    });
    await new ContentPolicyAuditStore(userDataPath).append(audit(target.article_id));

    const monitored = await processExposureMonitoring({
      userDataPath,
      target: {
        trackerId: 'legacy-tracker', title: target.title, keyword: 'keyword', blogId: 'test',
        logNo: '2000', url: target.url!,
      },
      checks: [{ method: 'exact_title_search', outcome: 'FOUND', checked_at: '2026-07-12T00:00:00.000Z' }],
      now: new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(monitored.publication.article_id).toBe(target.article_id);
    expect(monitored.publication.exposure_status).toBe('INDEXED');
  });

  it('records an advisory without pausing when the audit log is corrupt', async () => {
    const userDataPath = await tempDir();
    const recent = makeRecentPosts(20).map((post, index) => ({
      ...post,
      article_id: `corrupt-audit-${index}`,
      url: `https://blog.naver.com/test/${3000 + index}`,
    }));
    const repository = new RecentPostsRepository(userDataPath);
    const stateStore = new PublicationStateStore(userDataPath);
    const auditStore = new ContentPolicyAuditStore(userDataPath);
    await repository.mergeSnapshot(recent);
    await stateStore.recordPublication({
      article_id: recent[0].article_id, account_id: 'account-a', published_at: recent[0].published_at!,
      template_id: recent[0].template_id!, structure_type: recent[0].structure_type,
      topic_angle: recent[0].topic_angle, exposure_status: 'PENDING_INDEX',
    });
    await fs.writeFile(auditStore.filePath, '{broken-json}\n', 'utf8');

    await expect(processExposureMonitoring({
      userDataPath,
      target: {
        trackerId: 'tracker', title: recent[0].title, keyword: 'keyword', blogId: 'test',
        logNo: '3000', url: recent[0].url!,
      },
      checks: misses('2026-07-12T00:00:00.000Z'),
    })).rejects.toThrow(/AUDIT_LOG_CORRUPT_LINE/);

    const state = await stateStore.load();
    expect(state.status).toBe('ACTIVE');
    expect(state.pause_reason).toBeUndefined();
    expect(state.last_advisory_reason).toBe('EXPOSURE_AUDIT_LOG_CORRUPT');
  });
});
