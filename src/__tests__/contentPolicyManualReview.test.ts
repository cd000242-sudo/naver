import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareGenerationPolicyContext } from '../contentPolicy/generationContext';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { prepareContentPolicyForPublish } from '../contentPolicy/policyService';
import { guardGeneratedContent } from '../contentPolicy/generatedContentGuard';
import { runContentPolicyPipeline } from '../contentPolicy/orchestrator';
import { executeWithContentPolicyManualReview } from '../main/contentPolicyManualReview';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-manual-review-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function payloadWithoutRecentPosts() {
  const draft = makeGoodDraft();
  return {
    naverId: 'account-a',
    title: draft.title,
    content: draft.body_markdown,
    publishMode: 'publish' as const,
    _publishFlow: 'full_auto' as const,
    structuredContent: {
      selectedTitle: draft.title,
      summary: draft.summary,
      introduction: draft.introduction,
      headings: draft.headings.map((heading) => ({ ...heading })),
      bodyPlain: draft.body_markdown,
      content: draft.body_markdown,
      faq: draft.faq.map((entry) => ({ ...entry })),
      cta: draft.cta,
    },
    contentPolicyContext: {
      input: makePolicyInput({ recent_posts: undefined }),
      recentPostsSnapshot: [],
      recentPostsResult: {
        ok: false as const,
        code: 'RECENT_POSTS_UNAVAILABLE' as const,
        message: 'new user has no comparable history',
      },
    },
  };
}

describe('recent-post manual review workflow', () => {
  it('still evaluates draft quality before returning a recent-post manual review block', async () => {
    const result = await runContentPolicyPipeline({
      input: makePolicyInput({ recent_posts: undefined }),
      draft: makeGoodDraft(),
      config: await loadContentPolicy(),
      recentPostsResult: {
        ok: false,
        code: 'RECENT_POSTS_UNAVAILABLE',
        message: 'no repository yet',
      },
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.block_reasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
    expect(result.block_reasons).toContain('BLOCK_MISSING_RECENT_POSTS');
    expect(result.quality_report.total_score).toBeGreaterThan(0);
    expect(result.quality_report.fatal_errors).not.toContain('missing_required_input');
    expect(result.stage_trace.find((entry) => entry.stage === 'QualityGate')?.status).toBe('PASS');
    expect(result.manual_review).toMatchObject({
      required: true,
      approved: false,
    });
  });

  it('allows generation to continue while preserving the manual-review requirement', async () => {
    const result = await prepareGenerationPolicyContext({
      userDataPath: await tempDir(),
      config: await loadContentPolicy(),
      fallbackInput: makePolicyInput({ recent_posts: undefined }),
    });

    expect(result.allowed).toBe(true);
    expect(result.manualReviewRequired).toBe(true);
    expect(result.reasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
  });

  it('keeps a quality-passing generated draft for image generation with an advisory', async () => {
    const draft = makeGoodDraft();
    const result = await guardGeneratedContent({
      structuredContent: {
        selectedTitle: draft.title,
        summary: draft.summary,
        introduction: draft.introduction,
        headings: draft.headings,
        bodyPlain: draft.body_markdown,
        faq: draft.faq,
        cta: draft.cta,
      },
      input: makePolicyInput({ recent_posts: undefined }),
      config: await loadContentPolicy(),
      recentPostsResult: {
        ok: false,
        code: 'RECENT_POSTS_UNAVAILABLE',
        message: 'new user',
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.manualReviewRequired).toBe(false);
    expect(result.advisoryReasons).toContain('BLOCK_RECENT_POSTS_UNAVAILABLE');
    expect(result.policyResult.quality_report.total_score).toBeGreaterThan(0);
  });

  it('publishes a quality-passing draft after explicit one-time recent-post review approval', async () => {
    const payload = {
      ...payloadWithoutRecentPosts(),
      _contentPolicyManualReviewApproved: true,
    };
    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.policyResult.decision).toBe('PASS');
    expect(result.policyResult.block_reasons).toEqual([]);
    expect(result.policyResult.manual_review).toMatchObject({
      required: false,
      approved: true,
    });
  });

  it('uses a valid renderer history when the main-process store exists but has no comparable posts', async () => {
    const userDataPath = await tempDir();
    await fs.writeFile(
      path.join(userDataPath, 'content-policy-articles.json'),
      JSON.stringify([{ title: 'incomplete legacy row' }]),
      'utf8',
    );
    const recentPosts = makeRecentPosts();
    const payload = payloadWithoutRecentPosts();
    payload.contentPolicyContext = {
      input: makePolicyInput({ recent_posts: undefined }),
      recentPostsSnapshot: [],
      recentPostsResult: { ok: true, posts: recentPosts, source: 'renderer-storage' },
    };

    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath,
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.manualReviewRequired).toBe(false);
    expect(result.policyResult.similarity_report.compared_post_count).toBe(20);
  });

  it('keeps a title/body mismatch advisory after recent-post approval', async () => {
    const payload = {
      ...payloadWithoutRecentPosts(),
      title: '제주 렌터카 보험 비교와 예약 방법',
      structuredContent: {
        ...payloadWithoutRecentPosts().structuredContent,
        selectedTitle: '제주 렌터카 보험 비교와 예약 방법',
      },
      _contentPolicyManualReviewApproved: true,
    };
    const result = await prepareContentPolicyForPublish(payload, {
      userDataPath: await tempDir(),
      env: { MIN_PUBLISH_INTERVAL_MINUTES: '0', DAILY_PUBLISH_CAP: '10' },
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.advisoryReasons).toContain('BLOCK_KEYWORD_BODY_MISMATCH');
  });

  it('reuses the exact payload and executes only once more after approval', async () => {
    const original = Object.freeze({
      title: '검수할 글',
      _publishFlow: 'full_auto' as const,
    });
    const execute = vi.fn()
      .mockResolvedValueOnce({
        success: false,
        message: '최근 글 비교 자료가 충분하지 않습니다.',
        manualReviewRequired: true,
        manualReviewReasons: ['BLOCK_INSUFFICIENT_RECENT_POSTS'],
      })
      .mockResolvedValueOnce({ success: true, url: 'https://blog.naver.com/account-a/123' });
    const confirm = vi.fn().mockResolvedValue(true);

    const result = await executeWithContentPolicyManualReview(original, { execute, confirm });

    expect(result.success).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][0]).toBe(original);
    expect(execute.mock.calls[1][0]).toEqual({
      ...original,
      _contentPolicyManualReviewApproved: true,
    });
    expect(original).not.toHaveProperty('_contentPolicyManualReviewApproved');
  });

  it('returns a clean cancellation without a second execution when review is declined', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: false,
      manualReviewRequired: true,
      manualReviewReasons: ['BLOCK_MISSING_RECENT_POSTS'],
    });
    const confirm = vi.fn().mockResolvedValue(false);

    const result = await executeWithContentPolicyManualReview(
      { title: '검수할 글', _publishFlow: 'semi_auto' },
      { execute, confirm },
    );

    expect(result).toMatchObject({ success: false, cancelled: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('supports an explicit review prompt for scheduled compatibility runs', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ success: false, manualReviewRequired: true })
      .mockResolvedValueOnce({ success: true });
    const confirm = vi.fn().mockResolvedValue(true);

    const result = await executeWithContentPolicyManualReview({
      title: '기존 예약 글',
      _publishFlow: 'app_scheduler',
      _contentPolicyManualReviewPromptAllowed: true,
    }, { execute, confirm });

    expect(result.success).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('wires the main entry points without exposing the old internal manual-review exception', async () => {
    const mainSource = await fs.readFile(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const executorSource = await fs.readFile(
      path.resolve(process.cwd(), 'src/main/services/BlogExecutor.ts'),
      'utf8',
    );

    expect(mainSource.match(/executeWithContentPolicyManualReview/g)?.length).toBeGreaterThanOrEqual(3);
    expect(mainSource).not.toContain('Manual review required:');
    expect(executorSource.indexOf('preparedPolicy.manualReviewRequired'))
      .toBeLessThan(executorSource.indexOf('CONTENT_POLICY_BLOCKED:'));
  });
});
