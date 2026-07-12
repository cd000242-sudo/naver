import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { cleanup, injectDependencies } from '../main/services/BlogExecutor';

describe('BlogExecutor successful publish counters', () => {
  const incrementPublishCount = vi.fn();
  const incrementTodayCount = vi.fn(async () => undefined);

  beforeEach(() => {
    incrementPublishCount.mockClear();
    incrementTodayCount.mockClear();
    injectDependencies({
      blogAccountManager: { incrementPublishCount },
      incrementTodayCount,
    } as any);
  });

  it('does not increment counters while cleaning up a failed publish', async () => {
    await cleanup({ keepBrowserOpen: true } as any, 'account-1', false);

    expect(incrementPublishCount).not.toHaveBeenCalled();
    expect(incrementTodayCount).not.toHaveBeenCalled();
  });

  it('increments counters while cleaning up a successful publish', async () => {
    await cleanup({ keepBrowserOpen: true } as any, 'account-1', true);

    expect(incrementPublishCount).toHaveBeenCalledOnce();
    expect(incrementPublishCount).toHaveBeenCalledWith('account-1');
    expect(incrementTodayCount).toHaveBeenCalledOnce();
  });
});

describe('BlogExecutor counter result wiring', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src', 'main', 'services', 'BlogExecutor.ts'),
    'utf8',
  );

  it('passes failure and final success explicitly into cleanup', () => {
    expect(source).toContain('await cleanup(effectivePayload, accountId, false)');
    expect(source).toContain('await cleanup(effectivePayload, accountId, finalResult.success === true)');
  });
});
