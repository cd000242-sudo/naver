import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  ensureDropshotControls: vi.fn(),
  getProfileDir: vi.fn(() => 'profile-dir'),
  isLoggedIn: vi.fn(),
  resolveDropshotAuthState: vi.fn(async () => 'unauthenticated'),
  launchBrowser: vi.fn(),
  minimizeDropshotWindow: vi.fn(),
  selectDropshotPage: vi.fn(),
  navigateToDropshotBoard: vi.fn(),
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
  resolveDropshotAuthState: mocks.resolveDropshotAuthState,
  launchBrowser: mocks.launchBrowser,
  minimizeDropshotWindow: mocks.minimizeDropshotWindow,
  selectDropshotPage: mocks.selectDropshotPage,
  navigateToDropshotBoard: mocks.navigateToDropshotBoard,
  openDropshotImageWorkspace: mocks.openDropshotImageWorkspace,
  sanitizeDropshotErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
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

import { dropshotLogin } from '../image/dropshotLogin.js';

const STOCK_LOGIN = 'https://stock.dropshot.io/ko/logIn';

describe('Dropshot interactive login when the tab stays on the sign-in page', () => {
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
    mocks.selectDropshotPage.mockImplementation(async (context: { pages: () => unknown[] }) => context.pages()[0]);
  });

  it('notices the login from the session, opens the board in the same tab and adopts that window', async () => {
    vi.useFakeTimers();
    const page = { id: 'login-tab', url: vi.fn(() => STOCK_LOGIN) };
    const context = {
      pages: vi.fn(() => [page]),
      newPage: vi.fn(async () => page),
      on: vi.fn(),
      cookies: vi.fn(async () => [{ domain: '.dropshot.io', name: 'ds.session-token.0', value: 'x'.repeat(150) }]),
      request: {
        get: vi.fn(async () => ({
          status: () => 200,
          text: async () => JSON.stringify({ user: { id: 'u1', name: 'n' } }),
        })),
      },
    };
    mocks.launchBrowser.mockResolvedValueOnce(context);
    // The normal in-page check says "not logged in" while the tab sits on the sign-in page, then "logged in" on the board.
    mocks.isLoggedIn.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const resultPromise = dropshotLogin();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(resultPromise).resolves.toMatchObject({ loggedIn: true });

    // 1st call = opening the board first, 2nd call = moving the sign-in tab to the board after the session appeared.
    expect(mocks.navigateToDropshotBoard).toHaveBeenCalledTimes(2);
    expect(mocks.navigateToDropshotBoard.mock.calls[1][0]).toBe(page);
    expect(mocks.setCached).toHaveBeenCalledWith(context, page);
    expect(mocks.minimizeDropshotWindow).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting without touching the tab while nobody is signed in', async () => {
    vi.useFakeTimers();
    const page = { id: 'login-tab', url: vi.fn(() => STOCK_LOGIN) };
    const context = {
      pages: vi.fn(() => [page]),
      newPage: vi.fn(async () => page),
      on: vi.fn(),
      cookies: vi.fn(async () => []),
      request: { get: vi.fn(async () => ({ status: () => 200, text: async () => 'null' })) },
    };
    mocks.launchBrowser.mockResolvedValueOnce(context);
    mocks.isLoggedIn.mockResolvedValue(false);

    const resultPromise = dropshotLogin();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.navigateToDropshotBoard).toHaveBeenCalledTimes(1);
    expect(mocks.setCached).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await expect(resultPromise).resolves.toMatchObject({ loggedIn: false });
    expect(mocks.navigateToDropshotBoard).toHaveBeenCalledTimes(1);
  });
});

describe('Dropshot generation-time login wiring', () => {
  it('uses the same session-based detection in the generation-time login loop', () => {
    const core = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotCore.ts'), 'utf8');
    expect(core).toContain('detectDropshotLogin(');
    expect(core).not.toMatch(/if \(await isLoggedIn\(page\)\)/);
  });
});
