import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executePublishing,
  injectDependencies,
} from '../main/services/BlogExecutor';
import {
  beginMainProcessEditorCommitCandidate,
  bindMainProcessEditorCommitCandidate,
  bindMainProcessEditorVisibleSnapshot,
  invokeMainProcessBeforePublishCommit,
  recordMainProcessEditorCommitSemantic,
} from '../automation/publishCommitHook.js';

const flows = [
  'direct',
  'legacy_form',
  'semi_auto',
  'full_auto',
  'continuous',
  'multi_account',
  'app_scheduler',
  'smart_scheduler',
] as const;

describe('runtime publish execution matrix', () => {
  beforeEach(() => {
    injectDependencies({} as any);
    delete process.env.STRICT_HOURLY_PER_ACCOUNT;
  });

  it.each(flows)('preserves the final manual body order for %s', async (flow) => {
    const run = vi.fn(async () => ({
      success: true,
      url: 'https://blog.naver.com/runtime-test/223000001',
    }));
    const body = [
      '도입 문장',
      '1. 첫 번째',
      '첫 번째 설명',
      '2. 두 번째',
      '두 번째 설명',
      '3. 세 번째',
      '세 번째 설명',
    ].join('\n');
    const structuredContent = {
      selectedTitle: '순서 보존 테스트',
      bodyPlain: body,
      content: body,
      headings: [
        { title: '1. 첫 번째', content: '첫 번째 설명' },
        { title: '2. 두 번째', content: '두 번째 설명' },
        { title: '3. 세 번째', content: '세 번째 설명' },
      ],
    };

    const result = await executePublishing({ run } as any, {
      naverId: 'runtime-test',
      title: '순서 보존 테스트',
      content: body,
      structuredContent,
      publishMode: 'publish',
      _publishFlow: flow,
    }, []);

    expect(result.success).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toMatchObject({
      title: '순서 보존 테스트',
      content: body,
      structuredContent,
      publishMode: 'publish',
    });
  });

  it.each(['draft', 'schedule'] as const)('accepts %s success without a public URL', async (publishMode) => {
    const run = vi.fn(async () => ({ success: true }));
    const result = await executePublishing({ run } as any, {
      title: '저장 테스트',
      content: '저장할 본문입니다.',
      structuredContent: { selectedTitle: '저장 테스트', bodyPlain: '저장할 본문입니다.' },
      publishMode,
      scheduleDate: publishMode === 'schedule' ? '2026-07-14' : undefined,
      scheduleTime: publishMode === 'schedule' ? '09:30' : undefined,
    }, []);

    expect(result.success).toBe(true);
    expect(run.mock.calls[0][0].scheduleDate).toBe(
      publishMode === 'schedule' ? '2026-07-14 09:30' : undefined,
    );
  });

  it('fails closed when immediate publishing has no concrete post URL', async () => {
    const run = vi.fn(async () => ({ success: true }));
    const result = await executePublishing({ run } as any, {
      title: '즉시 발행 테스트',
      content: '즉시 발행 본문입니다.',
      structuredContent: { selectedTitle: '즉시 발행 테스트' },
      publishMode: 'publish',
    }, []);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/PUBLISH_UNCONFIRMED/);
  });

  it('does not consume the trusted hook when browser preflight fails before the final click', async () => {
    const beforeCommit = vi.fn(async () => undefined);
    const run = vi.fn(async () => ({
      success: false,
      message: 'PRE_PUBLISH_BLOCKED:test preflight failure',
    }));

    const result = await executePublishing({ run } as any, {
      title: 'Retryable title',
      content: 'Retryable body',
      structuredContent: { selectedTitle: 'Retryable title', bodyPlain: 'Retryable body' },
      publishMode: 'publish',
    }, [], beforeCommit);

    expect(result.success).toBe(false);
    expect(beforeCommit).not.toHaveBeenCalled();
    expect(Object.keys(run.mock.calls[0][0])).not.toContain('beforePublishCommit');
  });

  it('consumes the trusted hook exactly once when automation reaches the final click boundary', async () => {
    const beforeCommit = vi.fn(async () => undefined);
    const run = vi.fn(async (options: Record<string, unknown>) => {
      const resolved = {
        structuredContent: options.structuredContent,
        skipImages: options.skipImages,
      };
      beginMainProcessEditorCommitCandidate(options, resolved, { structured: true });
      recordMainProcessEditorCommitSemantic(resolved, { kind: 'title', text: 'Commit title' });
      recordMainProcessEditorCommitSemantic(resolved, { kind: 'body-source', text: 'Commit body' });
      recordMainProcessEditorCommitSemantic(resolved, { kind: 'hashtags', values: [] });
      bindMainProcessEditorCommitCandidate(options, resolved, options.structuredContent);
      bindMainProcessEditorVisibleSnapshot(options, {
        title: 'Commit title',
        bodyText: 'Commit body',
        linkCards: [],
        bareUrls: [],
        externalAnchorUrls: [],
        opaqueVisualCount: 0,
      });
      await invokeMainProcessBeforePublishCommit(options);
      return {
        success: true,
        url: 'https://blog.naver.com/runtime-test/223000002',
      };
    });

    const result = await executePublishing({ run } as any, {
      title: 'Commit title',
      content: 'Commit body',
      structuredContent: { selectedTitle: 'Commit title', bodyPlain: 'Commit body' },
      publishMode: 'publish',
      skipImages: true,
    }, [], beforeCommit);

    expect(result.success).toBe(true);
    expect(beforeCommit).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].skipImages).toBe(true);
    expect(beforeCommit).toHaveBeenCalledWith(expect.objectContaining({
      validatedArticle: expect.objectContaining({
        title: 'Commit title',
        bodyPlain: 'Commit body',
      }),
    }));
    await expect(invokeMainProcessBeforePublishCommit(run.mock.calls[0][0]))
      .rejects.toThrow('[content-quality-v3-publish-commit] hook_replayed');
  });
});
