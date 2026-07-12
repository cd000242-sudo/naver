import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { app } from 'electron';

import {
  createFailedScheduledPostState,
  createPublishingScheduledPostState,
  getAllScheduledPosts,
  loadScheduledPosts,
  saveScheduledPost,
  createPublishedScheduledPostState,
  retryScheduledPost,
  resolveScheduledPostStateAfterError,
  type ScheduledPost,
} from '../scheduledPostsManager';
import {
  createSchedulePublishOutcomeUnknownError,
  isSchedulePublishOutcomeUnknown,
  SCHEDULE_PUBLISH_OUTCOME_UNKNOWN,
} from '../automation/schedulePublishCommitPolicy';

const concretePostUrl = 'https://blog.naver.com/leader_248/123456789';

function makeScheduledPost(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'scheduled-1',
    title: 'Integrity test post',
    scheduleDate: '2026-07-11 10:00',
    createdAt: '2026-07-11T00:00:00.000Z',
    status: 'scheduled',
    ...overrides,
  };
}

describe('scheduled publish state integrity', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scheduled-publish-integrity-'));
    vi.spyOn(app, 'getPath').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it.each([
    '',
    'https://blog.naver.com/leader_248',
    'https://blog.naver.com/leader_248/',
    'https://blog.naver.com/PostWriteForm.naver',
    'https://example.com/leader_248/123456789',
  ])('does not create published state for a non-concrete URL: %s', (url) => {
    const post = makeScheduledPost();

    expect(() => createPublishedScheduledPostState(post, url)).toThrow(/PUBLISH_UNCONFIRMED/);
    expect(post).toEqual(makeScheduledPost());
  });

  it('creates immutable published state only for a concrete Naver post URL', () => {
    const post = makeScheduledPost({ error: 'old failure' });

    const published = createPublishedScheduledPostState(
      post,
      `  ${concretePostUrl}  `,
      '2026-07-11T01:02:03.000Z',
    );

    expect(published).toEqual({
      ...post,
      status: 'published',
      publishedAt: '2026-07-11T01:02:03.000Z',
      publishedUrl: concretePostUrl,
      error: undefined,
    });
    expect(post.status).toBe('scheduled');
    expect(post.publishedUrl).toBeUndefined();
  });

  it('stores system failures as failed with an error for the retry UI', () => {
    const post = makeScheduledPost();

    const failed = createFailedScheduledPostState(post, new Error('browser session closed'));

    expect(failed).toMatchObject({
      ...post,
      status: 'failed',
      error: 'browser session closed',
      publishedAt: undefined,
      publishedUrl: undefined,
      failureCode: 'BROWSER_CLOSED',
    });
    expect(post.status).toBe('scheduled');
  });

  it('persists a publishing state before browser work without mutating the source', () => {
    const post = makeScheduledPost();
    const publishing = createPublishingScheduledPostState(post, '2026-07-11T01:00:00.000Z');

    expect(publishing).toMatchObject({
      ...post,
      status: 'publishing',
      publishStartedAt: '2026-07-11T01:00:00.000Z',
    });
    expect(post.status).toBe('scheduled');
  });

  it('quarantines an indeterminate committed publish and sanitizes persisted errors', () => {
    const post = makeScheduledPost();
    const error = Object.assign(new Error(
      'PUBLISH_UNCONFIRMED token=secret at C:\\Users\\park\\profile',
    ), { code: 'PUBLISH_UNCONFIRMED' });

    const failed = createFailedScheduledPostState(post, error);

    expect(failed.status).toBe('uncertain');
    expect(failed.failureCode).toBe('PUBLISH_OUTCOME_UNKNOWN');
    expect(failed.error).not.toContain('secret');
    expect(failed.error).not.toContain('C:\\Users');
  });

  it('never downgrades a confirmed published state when later post-processing fails', () => {
    const original = makeScheduledPost();
    const published = createPublishedScheduledPostState(original, concretePostUrl);

    const state = resolveScheduledPostStateAfterError(
      original,
      new Error('recurring schedule persistence failed'),
      published,
    );

    expect(state).toMatchObject({
      status: 'published',
      publishedUrl: concretePostUrl,
    });
    expect(state).not.toBe(published);
  });

  it('clears the previous failure when the retry UI reschedules a failed post', async () => {
    const failed = makeScheduledPost({
      status: 'failed',
      error: 'temporary browser failure',
      publishedAt: '2026-07-10T00:00:00.000Z',
      publishedUrl: concretePostUrl,
    });
    const filePath = path.join(tempDir, 'scheduled-posts.json');
    await fs.writeFile(filePath, JSON.stringify([failed]), 'utf8');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 11, 10, 0, 0));

    await retryScheduledPost(failed.id);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf8')) as ScheduledPost[];
    expect(saved).toEqual([{
      ...failed,
      scheduleDate: '2026-07-11 10:01',
      status: 'scheduled',
      error: undefined,
      publishedAt: undefined,
      publishedUrl: undefined,
    }]);
  });

  it('serializes concurrent scheduled-post writes without losing either post', async () => {
    const first = makeScheduledPost({ id: 'scheduled-a', title: 'A' });
    const second = makeScheduledPost({ id: 'scheduled-b', title: 'B' });

    await Promise.all([saveScheduledPost(first), saveScheduledPost(second)]);

    const saved = await getAllScheduledPosts();
    expect(saved.map((post) => post.id).sort()).toEqual(['scheduled-a', 'scheduled-b']);
  });

  it('retries a transient Windows atomic-rename sharing violation', async () => {
    const originalRename = fs.rename.bind(fs);
    const renameSpy = vi.spyOn(fs, 'rename')
      .mockRejectedValueOnce(Object.assign(new Error('sharing violation'), { code: 'EPERM' }))
      .mockImplementation(originalRename);

    await expect(saveScheduledPost(makeScheduledPost())).resolves.toBeUndefined();

    expect(renameSpy).toHaveBeenCalledTimes(2);
    expect((await getAllScheduledPosts())[0].status).toBe('scheduled');
  });

  it('reconciles a crash-left publishing state to uncertain before retry selection', async () => {
    const publishing = {
      ...createPublishingScheduledPostState(makeScheduledPost()),
      publishRunId: 'previous-process-run',
    };
    const filePath = path.join(tempDir, 'scheduled-posts.json');
    await fs.writeFile(filePath, JSON.stringify([publishing]), 'utf8');

    await expect(loadScheduledPosts()).resolves.toEqual([]);
    const all = await getAllScheduledPosts();

    expect(all[0]).toMatchObject({
      status: 'uncertain',
      failureCode: 'PUBLISH_OUTCOME_UNKNOWN',
    });
    expect(all[0].publishStartedAt).toBeUndefined();
  });

  it('does not quarantine a publishing state owned by the current live process', async () => {
    const publishing = createPublishingScheduledPostState(makeScheduledPost());
    await saveScheduledPost(publishing);

    await expect(loadScheduledPosts()).resolves.toEqual([]);
    const all = await getAllScheduledPosts();

    expect(all[0]).toMatchObject({
      status: 'publishing',
      publishRunId: publishing.publishRunId,
    });
  });
});

describe('main scheduler publish integrity wiring', () => {
  const mainSource = readFileSync(path.join(process.cwd(), 'src', 'main.ts'), 'utf8');
  const smartSchedulerBlock = mainSource.slice(
    mainSource.indexOf('smartScheduler.setPublishCallback'),
    mainSource.indexOf('// ✅ [v2.10.42]'),
  );
  const scheduledPostsCronBlock = mainSource.slice(
    mainSource.indexOf("cron.schedule('* * * * *'"),
    mainSource.indexOf("cron.schedule('*/5 * * * *'"),
  );

  it('requires a concrete URL before SmartScheduler can return success', () => {
    expect(smartSchedulerBlock).toContain('requireConcreteNaverPostUrl');
    expect(smartSchedulerBlock.indexOf('requireConcreteNaverPostUrl'))
      .toBeLessThan(smartSchedulerBlock.lastIndexOf('return publishedUrl'));
  });

  it('persists cron scheduler success and failure through integrity state builders', () => {
    expect(scheduledPostsCronBlock).toContain('createPublishedScheduledPostState');
    expect(scheduledPostsCronBlock).toContain('createFailedScheduledPostState');
    expect(scheduledPostsCronBlock).toContain('createPublishingScheduledPostState');
    expect(scheduledPostsCronBlock).not.toContain('normalizedPostTitle.includes');
    expect(scheduledPostsCronBlock).not.toContain('step4_fallback');
    expect(scheduledPostsCronBlock).not.toContain("post.status = 'cancelled'");
  });
});

describe('Naver scheduled publish commit boundary', () => {
  const helperSource = readFileSync(
    path.join(process.cwd(), 'src', 'automation', 'publishHelpers.ts'),
    'utf8',
  );
  const automationSource = readFileSync(
    path.join(process.cwd(), 'src', 'naverBlogAutomation.ts'),
    'utf8',
  );

  it('uses a stable typed error for an indeterminate post-confirm outcome', () => {
    const error = createSchedulePublishOutcomeUnknownError(new Error('Target closed'));

    expect(error.message).toContain(SCHEDULE_PUBLISH_OUTCOME_UNKNOWN);
    expect(isSchedulePublishOutcomeUnknown(error)).toBe(true);
    expect(isSchedulePublishOutcomeUnknown(new Error('button not found'))).toBe(false);
  });

  it('marks the confirmation boundary before clicking and quarantines later errors', () => {
    const confirmIndex = helperSource.indexOf('confirmationAttempted = true');
    const clickIndex = helperSource.indexOf('await confirmButton.click()', confirmIndex);

    expect(confirmIndex).toBeGreaterThan(-1);
    expect(clickIndex).toBeGreaterThan(confirmIndex);
    expect(helperSource).toContain('createSchedulePublishOutcomeUnknownError(error)');
  });

  it('blocks both the inner schedule loop and outer publish retry after commit uncertainty', () => {
    expect(automationSource).toContain('isSchedulePublishOutcomeUnknown(scheduleError)');
    expect(automationSource).toContain('SCHEDULE_PUBLISH_OUTCOME_UNKNOWN,');
  });
});
