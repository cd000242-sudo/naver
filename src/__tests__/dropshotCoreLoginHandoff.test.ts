import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureDropshotControls: vi.fn(),
  getProfileDir: vi.fn(() => 'profile-dir'),
  isLoggedIn: vi.fn(),
  launchBrowser: vi.fn(),
  minimizeDropshotWindow: vi.fn(),
  navigateToDropshotBoard: vi.fn(),
  openDropshotImageWorkspace: vi.fn(),
  selectDropshotPage: vi.fn(),
  clearCached: vi.fn(),
  closeTrackedDropshotContext: vi.fn(),
  getCachedContext: vi.fn(() => null),
  getCachedPage: vi.fn(() => null),
  setCached: vi.fn(),
}));

vi.mock('../image/dropshotBrowser.js', () => ({
  ensureDropshotControls: mocks.ensureDropshotControls,
  getProfileDir: mocks.getProfileDir,
  isLoggedIn: mocks.isLoggedIn,
  launchBrowser: mocks.launchBrowser,
  minimizeDropshotWindow: mocks.minimizeDropshotWindow,
  navigateToDropshotBoard: mocks.navigateToDropshotBoard,
  openDropshotImageWorkspace: mocks.openDropshotImageWorkspace,
  selectDropshotPage: mocks.selectDropshotPage,
  buildDropshotPrompt: vi.fn(),
  downloadAsFileBuffer: vi.fn(),
  PROMPT_SELECTOR: 'textarea',
  sanitizeDropshotErrorMessage: vi.fn(),
}));

vi.mock('../image/dropshotSession.js', () => {
  class DropshotCleanupIncompleteError extends Error {}
  return {
    clearCached: mocks.clearCached,
    closeTrackedDropshotContext: mocks.closeTrackedDropshotContext,
    closeBrowserCache: vi.fn(),
    DropshotCleanupIncompleteError,
    getCachedContext: mocks.getCachedContext,
    getCachedPage: mocks.getCachedPage,
    setCached: mocks.setCached,
  };
});

vi.mock('../image/dropshotLogin.js', () => ({
  checkDropshotLogin: vi.fn(),
  dropshotLogin: vi.fn(),
}));

import { ensurePage } from '../image/dropshotCore.js';

describe('Dropshot generation-time login handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.navigateToDropshotBoard.mockResolvedValue(true);
    mocks.closeTrackedDropshotContext.mockResolvedValue(true);
    mocks.openDropshotImageWorkspace.mockResolvedValue(true);
    mocks.ensureDropshotControls.mockResolvedValue(undefined);
  });

  it('fails terminally instead of polling a closed page when the login window cannot be hidden', async () => {
    const headlessPage = { id: 'headless-page' };
    const visiblePage = { id: 'visible-page' };
    const headlessContext = { pages: vi.fn(() => [headlessPage]) };
    const visibleContext = {
      pages: vi.fn(() => [visiblePage]),
      on: vi.fn(),
    };
    mocks.launchBrowser.mockResolvedValueOnce(headlessContext).mockResolvedValueOnce(visibleContext);
    mocks.selectDropshotPage.mockImplementation(async (context: any) => context.pages()[0]);
    mocks.isLoggedIn.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.minimizeDropshotWindow.mockResolvedValue(false);

    const rejection = expect(ensurePage()).rejects.toThrow(/DROPSHOT_SESSION_HIDE_FAILED/);
    // One login poll is enough to detect the token. A regression that swallows
    // the terminal hide error and keeps polling for five minutes must fail here.
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    expect(mocks.setCached).not.toHaveBeenCalledWith(visibleContext, visiblePage);
    expect(mocks.closeTrackedDropshotContext).toHaveBeenCalledWith(visibleContext);
  });

  it('reuses the minimized authenticated context without launching another browser', async () => {
    const headlessPage = { id: 'headless-page' };
    const visiblePage = { id: 'visible-page', evaluate: vi.fn().mockResolvedValue('complete') };
    const headlessContext = { pages: vi.fn(() => [headlessPage]) };
    const visibleContext = {
      pages: vi.fn(() => [visiblePage]),
      on: vi.fn(),
    };
    mocks.launchBrowser.mockResolvedValueOnce(headlessContext).mockResolvedValueOnce(visibleContext);
    mocks.selectDropshotPage.mockImplementation(async (context: any) => context.pages()[0]);
    mocks.isLoggedIn.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    mocks.minimizeDropshotWindow.mockResolvedValue(true);

    const firstPagePromise = ensurePage();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(firstPagePromise).resolves.toBe(visiblePage);

    mocks.getCachedPage.mockReturnValue(visiblePage);
    mocks.getCachedContext.mockReturnValue(visibleContext);
    await expect(ensurePage()).resolves.toBe(visiblePage);

    expect(mocks.setCached).toHaveBeenCalledWith(visibleContext, visiblePage);
    expect(mocks.minimizeDropshotWindow).toHaveBeenCalledTimes(1);
    expect(mocks.launchBrowser).toHaveBeenCalledTimes(2);
  });
});
