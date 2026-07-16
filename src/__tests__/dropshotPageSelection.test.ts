import { describe, expect, it, vi } from 'vitest';
import { selectDropshotPage } from '../image/dropshotBrowser.js';

function makePage(url: string) {
  return {
    url: vi.fn(() => url),
    close: vi.fn(async () => undefined),
  };
}

describe('Dropshot page selection', () => {
  it('reuses the Dropshot tab and closes only redundant about:blank tabs', async () => {
    const dropshotPage = makePage('https://aistudio.dropshot.io/ko');
    const blankPage = makePage('about:blank');
    const oauthPage = makePage('https://accounts.google.com/signin');
    const context = {
      pages: vi.fn(() => [blankPage, oauthPage, dropshotPage]),
      newPage: vi.fn(),
    };

    await expect(selectDropshotPage(context)).resolves.toBe(dropshotPage);
    expect(blankPage.close).toHaveBeenCalledTimes(1);
    expect(oauthPage.close).not.toHaveBeenCalled();
    expect(dropshotPage.close).not.toHaveBeenCalled();
    expect(context.newPage).not.toHaveBeenCalled();
  });

  it('keeps the sole blank page instead of creating another tab', async () => {
    const blankPage = makePage('about:blank');
    const context = {
      pages: vi.fn(() => [blankPage]),
      newPage: vi.fn(),
    };

    await expect(selectDropshotPage(context)).resolves.toBe(blankPage);
    expect(blankPage.close).not.toHaveBeenCalled();
    expect(context.newPage).not.toHaveBeenCalled();
  });
});
