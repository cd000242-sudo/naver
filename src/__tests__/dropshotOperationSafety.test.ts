import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  endDropshotCheck,
  endDropshotGeneration,
  endDropshotLogin,
  closeAllDropshotContexts,
  clearCached,
  closeBrowserCache,
  getCachedPage,
  getGenerationChain,
  getDropshotOperationState,
  getCachedContext,
  hasTrackedDropshotContexts,
  invalidateBrowserCache,
  setCached,
  setGenerationChain,
  trackDropshotContext,
  untrackDropshotContext,
  tryBeginDropshotCheck,
  tryBeginDropshotGeneration,
  tryBeginDropshotLogin,
} from '../image/dropshotSession';
import { assertDropshotNavigationOpened } from '../image/dropshotCore';

function resetOperationState(): void {
  for (let i = 0; i < 10; i += 1) endDropshotGeneration();
  endDropshotLogin();
  endDropshotCheck();
}

describe('Dropshot operation coordination', () => {
  beforeEach(resetOperationState);
  afterEach(resetOperationState);

  it('blocks login and status checks while queued generations own the profile', () => {
    expect(tryBeginDropshotGeneration()).toBe(true);
    expect(tryBeginDropshotGeneration()).toBe(true);
    expect(getDropshotOperationState()).toEqual({
      pendingGenerations: 2,
      loginActive: false,
      checkActive: false,
    });

    expect(tryBeginDropshotLogin()).toBe(false);
    expect(tryBeginDropshotCheck()).toBe(false);

    endDropshotGeneration();
    endDropshotGeneration();
    expect(tryBeginDropshotLogin()).toBe(true);
  });

  it('keeps login and status checks mutually exclusive with generation', () => {
    expect(tryBeginDropshotCheck()).toBe(true);
    expect(tryBeginDropshotCheck()).toBe(false);
    expect(tryBeginDropshotLogin()).toBe(false);
    expect(tryBeginDropshotGeneration()).toBe(false);

    endDropshotCheck();
    expect(tryBeginDropshotLogin()).toBe(true);
    expect(tryBeginDropshotGeneration()).toBe(false);
  });

  it('wires generation ownership and fatal invalidation into finally-safe cleanup', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'image', 'dropshotCapture.ts'),
      'utf8',
    );

    expect(source).toContain('tryBeginDropshotGeneration()');
    expect(source).toContain('endDropshotGeneration();');
    expect(source).toContain('await invalidateBrowserCache();');
    expect(source).toMatch(/return await next;[\s\S]*finally[\s\S]*endDropshotGeneration\(\)/);
  });

  it('fails immediately when the interactive login route cannot open', () => {
    expect(() => assertDropshotNavigationOpened(false)).toThrow(/Dropshot 사이트 연결/);
    expect(() => assertDropshotNavigationOpened(true)).not.toThrow();

    const source = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotCore.ts'), 'utf8');
    expect(source).toContain('const loginBoardOpened = await navigateToDropshotBoard(page, onLog);');
    expect(source).toContain('assertDropshotNavigationOpened(loginBoardOpened);');
  });

  it('closes cached and non-cached live contexts during shutdown', async () => {
    const cachedContext = { close: vi.fn().mockResolvedValue(undefined) };
    const interactiveContext = { close: vi.fn().mockResolvedValue(undefined) };
    trackDropshotContext(cachedContext);
    trackDropshotContext(interactiveContext);
    setCached(cachedContext, {});

    await closeAllDropshotContexts();

    expect(cachedContext.close).toHaveBeenCalledTimes(1);
    expect(interactiveContext.close).toHaveBeenCalledTimes(1);
    expect(getCachedContext()).toBeNull();
  });

  it('keeps cache and generation-chain helpers consistent', async () => {
    const context = { close: vi.fn().mockResolvedValue(undefined) };
    const page = { id: 'page' };
    const chain = Promise.resolve('done');

    setCached(context, page);
    setGenerationChain(chain);
    expect(getCachedContext()).toBe(context);
    expect(getCachedPage()).toBe(page);
    expect(getGenerationChain()).toBe(chain);

    clearCached();
    expect(getCachedContext()).toBeNull();
    expect(getCachedPage()).toBeNull();
    await closeAllDropshotContexts();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('closes cached contexts on explicit close and fatal invalidation', async () => {
    const first = { close: vi.fn().mockResolvedValue(undefined) };
    setCached(first, {});
    await closeBrowserCache();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(getCachedContext()).toBeNull();

    const second = { close: vi.fn().mockResolvedValue(undefined) };
    setCached(second, {});
    await invalidateBrowserCache();
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(getCachedContext()).toBeNull();
  });

  it('retains cache ownership when close times out so the locked profile cannot relaunch', async () => {
    const context = { close: vi.fn(() => new Promise<void>(() => undefined)) };
    const page = { id: 'locked-page' };
    setCached(context, page);

    await expect(closeBrowserCache(5)).rejects.toThrow();

    expect(getCachedContext()).toBe(context);
    expect(getCachedPage()).toBe(page);

    context.close.mockResolvedValueOnce(undefined);
    await closeBrowserCache(50);
    expect(getCachedContext()).toBeNull();
  });

  it('does not close explicitly untracked contexts in the shutdown sweep', async () => {
    const context = { close: vi.fn().mockResolvedValue(undefined) };
    trackDropshotContext(context);
    untrackDropshotContext(context);

    await closeAllDropshotContexts();
    expect(context.close).not.toHaveBeenCalled();
  });

  it('preserves cached ownership when close-all times out and releases it after retry', async () => {
    const context = { close: vi.fn(() => new Promise<void>(() => undefined)) };
    const page = { id: 'abort-locked-page' };
    setCached(context, page);

    await expect(closeAllDropshotContexts(5)).rejects.toThrow();
    expect(getCachedContext()).toBe(context);
    expect(getCachedPage()).toBe(page);
    expect(hasTrackedDropshotContexts()).toBe(true);

    context.close.mockResolvedValueOnce(undefined);
    await closeAllDropshotContexts(50);
    expect(getCachedContext()).toBeNull();
    expect(hasTrackedDropshotContexts()).toBe(false);
  });

  it('closes the Dropshot persistent context during every app shutdown path', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

    expect(source).toContain("closeAllDropshotContexts as closeDropshotBrowserContexts");
    expect(source).toContain("runCleanupStep('Dropshot contexts', () => closeDropshotBrowserContexts())");
    for (const shutdownPath of [
      "_runFullCleanup('before-quit')",
      "_runFullCleanup('window-all-closed')",
      "_runFullCleanup('SIGTERM')",
      "_runFullCleanup('SIGINT')",
      "_runFullCleanup('uncaughtException')",
    ]) {
      expect(source).toContain(shutdownPath);
    }
  });
});
