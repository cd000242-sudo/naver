import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureDropshotControls: vi.fn(),
  getProfileDir: vi.fn(() => 'profile-dir'),
  launchBrowser: vi.fn(),
  minimizeDropshotWindow: vi.fn(),
  navigateToDropshotBoard: vi.fn(),
  navigateToDropshotLogin: vi.fn(),
  openDropshotImageWorkspace: vi.fn(),
  selectDropshotPage: vi.fn(),
  clearCached: vi.fn(),
  closeBrowserCache: vi.fn(),
  closeTrackedDropshotContext: vi.fn(),
  endDropshotCheck: vi.fn(),
  endDropshotLogin: vi.fn(),
  getCachedContext: vi.fn(),
  getCachedPage: vi.fn(),
  getDropshotOperationState: vi.fn(() => ({ pendingGenerations: 0, loginActive: false, checkActive: false })),
  setCached: vi.fn(),
  tryBeginDropshotCheck: vi.fn(() => true),
  tryBeginDropshotLogin: vi.fn(() => true),
}));

vi.mock('../image/dropshotBrowser.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../image/dropshotBrowser.js')>();
  return {
    ...original,
    ensureDropshotControls: mocks.ensureDropshotControls,
    getProfileDir: mocks.getProfileDir,
    launchBrowser: mocks.launchBrowser,
    minimizeDropshotWindow: mocks.minimizeDropshotWindow,
    navigateToDropshotBoard: mocks.navigateToDropshotBoard,
    navigateToDropshotLogin: mocks.navigateToDropshotLogin,
    openDropshotImageWorkspace: mocks.openDropshotImageWorkspace,
    selectDropshotPage: mocks.selectDropshotPage,
  };
});

vi.mock('../image/dropshotSession.js', () => {
  class DropshotCleanupIncompleteError extends Error {}
  return {
    clearCached: mocks.clearCached,
    closeBrowserCache: mocks.closeBrowserCache,
    closeTrackedDropshotContext: mocks.closeTrackedDropshotContext,
    DropshotCleanupIncompleteError,
    endDropshotCheck: mocks.endDropshotCheck,
    endDropshotLogin: mocks.endDropshotLogin,
    getCachedContext: mocks.getCachedContext,
    getCachedPage: mocks.getCachedPage,
    getDropshotOperationState: mocks.getDropshotOperationState,
    setCached: mocks.setCached,
    tryBeginDropshotCheck: mocks.tryBeginDropshotCheck,
    tryBeginDropshotLogin: mocks.tryBeginDropshotLogin,
  };
});

import { dropshotLogin } from '../image/dropshotLogin.js';

function createPage(id: string, context: unknown): Record<string, unknown> {
  return {
    id,
    url: vi.fn(() => 'https://aistudio.dropshot.io/ko/workspace/board'),
    context: vi.fn(() => context),
    evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
  };
}

describe('Dropshot Auth.js login handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('window', { location: { origin: 'https://aistudio.dropshot.io' } });
    mocks.getCachedContext.mockReturnValue(null);
    mocks.getCachedPage.mockReturnValue(null);
    mocks.navigateToDropshotBoard.mockResolvedValue(true);
    mocks.navigateToDropshotLogin.mockResolvedValue(true);
    mocks.openDropshotImageWorkspace.mockResolvedValue(true);
    mocks.ensureDropshotControls.mockResolvedValue(undefined);
    mocks.closeTrackedDropshotContext.mockResolvedValue(true);
    mocks.closeBrowserCache.mockResolvedValue(undefined);
    mocks.minimizeDropshotWindow.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('detects the new session on the next poll and immediately hides and adopts that context', async () => {
    const visibleContext: any = { pages: vi.fn(), newPage: vi.fn(), on: vi.fn() };
    const visiblePage = createPage('visible-page', visibleContext);
    visibleContext.pages.mockReturnValue([visiblePage]);
    visibleContext.newPage.mockResolvedValue(visiblePage);
    mocks.launchBrowser.mockResolvedValueOnce(visibleContext);
    mocks.selectDropshotPage.mockImplementation(async (context: any) => context.pages()[0]);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: { id: 'authenticated-user' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = dropshotLogin();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(resultPromise).resolves.toMatchObject({ loggedIn: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.minimizeDropshotWindow).toHaveBeenCalledTimes(1);
    expect(mocks.minimizeDropshotWindow).toHaveBeenCalledWith(visiblePage, undefined);
    expect(mocks.setCached).toHaveBeenCalledWith(visibleContext, visiblePage);
    expect(mocks.closeTrackedDropshotContext).not.toHaveBeenCalledWith(visibleContext);
    expect(mocks.launchBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.launchBrowser).toHaveBeenCalledWith('profile-dir', false);
  });
});
