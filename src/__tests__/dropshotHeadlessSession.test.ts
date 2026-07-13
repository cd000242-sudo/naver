import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  launchBrowser: vi.fn(),
  navigateToDropshotBoard: vi.fn(),
  isLoggedIn: vi.fn(),
  openDropshotImageWorkspace: vi.fn(),
  ensureDropshotControls: vi.fn(),
  closeTrackedDropshotContext: vi.fn(),
  setCached: vi.fn(),
}));

vi.mock('../image/dropshotBrowser.js', () => ({
  launchBrowser: mocks.launchBrowser,
  navigateToDropshotBoard: mocks.navigateToDropshotBoard,
  isLoggedIn: mocks.isLoggedIn,
  openDropshotImageWorkspace: mocks.openDropshotImageWorkspace,
  ensureDropshotControls: mocks.ensureDropshotControls,
}));

vi.mock('../image/dropshotSession.js', () => {
  class DropshotCleanupIncompleteError extends Error {}
  return {
    closeTrackedDropshotContext: mocks.closeTrackedDropshotContext,
    DropshotCleanupIncompleteError,
    setCached: mocks.setCached,
  };
});

import { reopenDropshotHeadlessGenerationContext } from '../image/dropshotHeadlessSession.js';

describe('Dropshot headless generation session', () => {
  const page = { id: 'hidden-page' };
  const context = {
    pages: vi.fn(() => [page]),
    newPage: vi.fn(async () => page),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.launchBrowser.mockResolvedValue(context);
    mocks.navigateToDropshotBoard.mockResolvedValue(true);
    mocks.isLoggedIn.mockResolvedValue(true);
    mocks.openDropshotImageWorkspace.mockResolvedValue(true);
    mocks.ensureDropshotControls.mockResolvedValue(undefined);
    mocks.closeTrackedDropshotContext.mockResolvedValue(true);
  });

  it('caches only a fully validated hidden session', async () => {
    await expect(reopenDropshotHeadlessGenerationContext('profile-dir')).resolves.toBe(page);

    expect(mocks.launchBrowser).toHaveBeenCalledWith('profile-dir', true);
    expect(mocks.isLoggedIn).toHaveBeenCalledWith(page);
    expect(mocks.openDropshotImageWorkspace).toHaveBeenCalledWith(page, undefined);
    expect(mocks.ensureDropshotControls).toHaveBeenCalledWith(page, undefined);
    expect(mocks.setCached).toHaveBeenCalledWith(context, page);
    expect(mocks.closeTrackedDropshotContext).not.toHaveBeenCalled();
  });

  it('closes the hidden context and refuses to cache when workspace validation fails', async () => {
    mocks.openDropshotImageWorkspace.mockResolvedValue(false);

    await expect(reopenDropshotHeadlessGenerationContext('profile-dir'))
      .rejects.toThrow('이미지 작업 화면');

    expect(mocks.setCached).not.toHaveBeenCalled();
    expect(mocks.closeTrackedDropshotContext).toHaveBeenCalledWith(context);
  });
});
