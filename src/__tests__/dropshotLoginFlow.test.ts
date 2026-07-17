import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureDropshotControls: vi.fn(),
  getProfileDir: vi.fn(() => 'profile-dir'),
  isLoggedIn: vi.fn(),
  launchBrowser: vi.fn(),
  minimizeDropshotWindow: vi.fn(),
  selectDropshotPage: vi.fn(),
  navigateToDropshotBoard: vi.fn(),
  navigateToDropshotLogin: vi.fn(),
  openDropshotImageWorkspace: vi.fn(),
  closeBrowserCache: vi.fn(),
  closeTrackedDropshotContext: vi.fn(),
  clearCached: vi.fn(),
  getCachedContext: vi.fn(),
  getCachedPage: vi.fn(),
  setCached: vi.fn(),
  tryBeginDropshotCheck: vi.fn(),
  tryBeginDropshotLogin: vi.fn(),
  endDropshotCheck: vi.fn(),
  endDropshotLogin: vi.fn(),
  getDropshotOperationState: vi.fn(() => ({ pendingGenerations: 0, loginActive: false, checkActive: false })),
}));

vi.mock('../image/dropshotBrowser.js', () => ({
  ensureDropshotControls: mocks.ensureDropshotControls,
  getProfileDir: mocks.getProfileDir,
  isLoggedIn: mocks.isLoggedIn,
  launchBrowser: mocks.launchBrowser,
  minimizeDropshotWindow: mocks.minimizeDropshotWindow,
  selectDropshotPage: mocks.selectDropshotPage,
  navigateToDropshotBoard: mocks.navigateToDropshotBoard,
  navigateToDropshotLogin: mocks.navigateToDropshotLogin,
  openDropshotImageWorkspace: mocks.openDropshotImageWorkspace,
  sanitizeDropshotErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

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

import { checkDropshotLogin, dropshotLogin } from '../image/dropshotLogin.js';

describe('Dropshot interactive login lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.tryBeginDropshotCheck.mockReturnValue(true);
    mocks.tryBeginDropshotLogin.mockReturnValue(true);
    mocks.getCachedContext.mockReturnValue(null);
    mocks.getCachedPage.mockReturnValue(null);
    mocks.navigateToDropshotBoard.mockResolvedValue(true);
    mocks.openDropshotImageWorkspace.mockResolvedValue(true);
    mocks.ensureDropshotControls.mockResolvedValue(undefined);
    mocks.closeTrackedDropshotContext.mockResolvedValue(true);
    mocks.closeBrowserCache.mockResolvedValue(undefined);
    mocks.minimizeDropshotWindow.mockResolvedValue(true);
    mocks.selectDropshotPage.mockImplementation(async (context: { pages: () => unknown[]; newPage: () => Promise<unknown> }) => (
      context.pages()[0] || context.newPage()
    ));
  });

  it('reuses an authenticated cached browser without opening another browser', async () => {
    const page = { id: 'cached-page' };
    const context = { pages: vi.fn(() => [page]), newPage: vi.fn(async () => page) };
    mocks.getCachedContext.mockReturnValue(context);
    mocks.getCachedPage.mockReturnValue(page);
    mocks.isLoggedIn.mockResolvedValue(true);

    await expect(dropshotLogin()).resolves.toMatchObject({
      loggedIn: true,
      phase: 'unlimited_ready',
      ready: true,
    });

    expect(mocks.launchBrowser).not.toHaveBeenCalled();
  });

  it('keeps passive status checks browser-free until the user explicitly starts login', async () => {
    await expect(checkDropshotLogin()).resolves.toMatchObject({
      loggedIn: false,
      phase: 'login_required',
      code: 'LOGIN_REQUIRED',
    });

    expect(mocks.launchBrowser).not.toHaveBeenCalled();
    expect(mocks.navigateToDropshotBoard).not.toHaveBeenCalled();
  });

  it('opens exactly one visible browser, then immediately minimizes and reuses that authenticated context', async () => {
    vi.useFakeTimers();
    const visiblePage = { id: 'visible-page', url: vi.fn(() => 'https://aistudio.dropshot.io/ko') };
    const closeHandlers: Array<() => void> = [];
    const visibleContext = {
      pages: vi.fn(() => [visiblePage]),
      newPage: vi.fn(async () => visiblePage),
      on: vi.fn((event: string, handler: () => void) => { if (event === 'close') closeHandlers.push(handler); }),
    };
    mocks.launchBrowser.mockResolvedValueOnce(visibleContext);
    mocks.isLoggedIn.mockResolvedValueOnce(true);
    let finishWorkspaceCheck!: (ready: boolean) => void;
    mocks.openDropshotImageWorkspace.mockImplementationOnce(() => (
      new Promise<boolean>((resolve) => { finishWorkspaceCheck = resolve; })
    ));

    const resultPromise = dropshotLogin();
    await vi.advanceTimersByTimeAsync(3_000);

    // Hiding the authenticated window must not wait for the optional workspace
    // and unlimited-mode checks, which can take tens of seconds on a slow SPA.
    expect(mocks.setCached).toHaveBeenCalledWith(visibleContext, visiblePage);
    expect(mocks.minimizeDropshotWindow).toHaveBeenCalledTimes(1);
    expect(mocks.minimizeDropshotWindow).toHaveBeenCalledWith(visiblePage, undefined);
    expect(mocks.closeTrackedDropshotContext).not.toHaveBeenCalledWith(visibleContext);

    finishWorkspaceCheck(true);
    await expect(resultPromise).resolves.toMatchObject({ loggedIn: true, ready: true });

    expect(mocks.launchBrowser).toHaveBeenCalledTimes(1);
    expect(mocks.launchBrowser).toHaveBeenCalledWith('profile-dir', false);
    expect(mocks.closeTrackedDropshotContext).not.toHaveBeenCalledWith(visibleContext);

    const launchesAfterSuccess = mocks.launchBrowser.mock.calls.length;
    const loginChecksAfterSuccess = mocks.isLoggedIn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.launchBrowser).toHaveBeenCalledTimes(launchesAfterSuccess);
    expect(mocks.isLoggedIn).toHaveBeenCalledTimes(loginChecksAfterSuccess);
  });

  it('closes the authenticated window without reopening when OS minimization fails', async () => {
    vi.useFakeTimers();
    const visiblePage = { id: 'visible-page', url: vi.fn(() => 'https://aistudio.dropshot.io/ko') };
    const visibleContext = {
      pages: vi.fn(() => [visiblePage]),
      newPage: vi.fn(async () => visiblePage),
      on: vi.fn(),
    };
    mocks.launchBrowser.mockResolvedValueOnce(visibleContext);
    mocks.isLoggedIn.mockResolvedValueOnce(true);
    mocks.minimizeDropshotWindow.mockResolvedValue(false);

    const resultPromise = dropshotLogin();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(resultPromise).resolves.toMatchObject({ loggedIn: true, ready: false });

    expect(mocks.closeTrackedDropshotContext).toHaveBeenCalledWith(visibleContext);
    expect(mocks.setCached).not.toHaveBeenCalledWith(visibleContext, visiblePage);
    expect(mocks.openDropshotImageWorkspace).not.toHaveBeenCalledWith(visiblePage, undefined);
    expect(mocks.launchBrowser).toHaveBeenCalledTimes(1);
  });
});
