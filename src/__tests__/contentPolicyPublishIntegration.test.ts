import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareContentPolicyForPublish, recordContentPolicyPublication } from '../contentPolicy/policyService';
import { loadPublishedPosts } from '../analytics/publishedPostTracker';
import { PublicationStateStore } from '../contentPolicy/publicationStateStore';
import { ContentPolicyAuditStore } from '../contentPolicy/auditStore';
import { RecentPostsRepository } from '../contentPolicy/recentPostsRepository';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-publish-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function payloadWithContext() {
  const draft = makeGoodDraft();
  const input = makePolicyInput();
  return {
    naverId: 'account-a',
    title: draft.title,
    content: draft.body_markdown,
    publishMode: 'publish' as const,
    structuredContent: {
      selectedTitle: draft.title,
      introduction: draft.introduction,
      headings: draft.headings,
      bodyPlain: draft.body_markdown,
      content: draft.body_markdown,
      faq: draft.faq,
      cta: draft.cta,
    },
    contentPolicyContext: {
      input,
      recentPostsSnapshot: makeRecentPosts(),
      recentPostsResult: { ok: true as const, posts: makeRecentPosts(), source: 'renderer-storage' },
    },
  };
}

describe('content policy publish integration', () => {
  it('evaluates, audits, and authorizes a complete PASS payload before browser work', async () => {
    const payload = payloadWithContext();
    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.policyResult.decision).toBe('PASS');
    expect(result.payload.structuredContent.contentPolicy.decision).toBe('PASS');
    expect(payload.structuredContent.contentPolicy).toBeUndefined();
  });

  it('blocks and requires manual review when neither renderer nor repository provides recent posts', async () => {
    const payload = payloadWithContext();
    payload.contentPolicyContext.input.recent_posts = undefined;
    payload.contentPolicyContext.recentPostsSnapshot = [];
    payload.contentPolicyContext.recentPostsResult = {
      ok: false as const,
      code: 'RECENT_POSTS_UNAVAILABLE' as const,
      message: 'renderer storage missing',
    };
    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0' },
    });

    expect(result.allowed).toBe(false);
    expect(result.policyResult.block_reasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
    expect(result.policyResult.publication.manual_review_required).toBe(true);
  });

  it('wires the guard before browser creation in the common BlogExecutor flow', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/main/services/BlogExecutor.ts'), 'utf8');
    const guard = source.indexOf('prepareContentPolicyForPublish');
    const browser = source.indexOf('getOrCreateBrowserSession(account)');

    expect(guard).toBeGreaterThan(-1);
    expect(browser).toBeGreaterThan(guard);
    expect(source).toContain('CONTENT_POLICY_BLOCKED');
  });

  it('always registers successful policy publications for exposure polling without duplicates', async () => {
    const userDataPath = await tempDir();
    const payload = payloadWithContext();
    const prepared = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    const publication = {
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      publishedUrl: 'https://blog.naver.com/account-a/123456',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    };

    await recordContentPolicyPublication(publication);
    await recordContentPolicyPublication(publication);

    const tracked = loadPublishedPosts(userDataPath);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].keyword).toBe(payload.contentPolicyContext.input.primary_keyword);
    expect(tracked[0].logNo).toBe('123456');
  });

  it('validates the exposure URL before mutating publication records', async () => {
    const userDataPath = await tempDir();
    const prepared = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    await expect(recordContentPolicyPublication({
      userDataPath,
      articleId: prepared.articleId,
      accountId: 'account-a',
      payload: prepared.payload,
      policyResult: prepared.policyResult,
      publishedUrl: '',
      publishedAt: new Date('2026-02-01T12:01:00.000Z'),
    })).rejects.toThrow(/POLICY_EXPOSURE_TARGET_INVALID/);

    const recent = await new RecentPostsRepository(userDataPath).loadRecentPosts(500);
    expect(recent.ok && recent.posts.some((post) => post.article_id === prepared.articleId)).toBe(false);
    expect((await new PublicationStateStore(userDataPath).load()).history).toHaveLength(0);
    expect(loadPublishedPosts(userDataPath)).toHaveLength(0);
  });

  it('does not register a server reservation as an already published exposure target', async () => {
    const source = await fs.readFile(path.resolve(process.cwd(), 'src/main/services/BlogExecutor.ts'), 'utf8');
    expect(source).toMatch(
      /if \(result\.success[\s\S]{0,300}effectivePayload\.publishMode !== 'schedule'[\s\S]{0,600}recordContentPolicyPublication/,
    );
  });

  it('audits the final PublishGuard BLOCK instead of a stale pipeline PASS', async () => {
    const userDataPath = await tempDir();
    await new PublicationStateStore(userDataPath).pauseAll('operator pause');
    const result = await prepareContentPolicyForPublish(payloadWithContext(), {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-02-01T12:00:00.000Z'),
    });
    const audits = await new ContentPolicyAuditStore(userDataPath).readRecent(10);

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('BLOCK_PUBLISH_PAUSED');
    expect(audits[0].decision).toBe('BLOCK');
    expect(audits[0].block_reasons).toContain('BLOCK_PUBLISH_PAUSED');
  });
});
