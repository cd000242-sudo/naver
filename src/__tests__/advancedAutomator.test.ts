import { beforeEach, describe, expect, it, vi } from 'vitest';

const cursorActions = vi.hoisted(() => ({
  click: vi.fn(async () => undefined),
  move: vi.fn(async () => undefined),
}));
const createPlaywrightCursor = vi.hoisted(() => vi.fn(async () => ({ actions: cursorActions })));

vi.mock('ghost-cursor-playwright', () => ({
  createCursor: createPlaywrightCursor,
}));

import { AdvancedAutomator } from '../crawler/advancedAutomator.ts';

describe('AdvancedAutomator Playwright cursor integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the Playwright cursor adapter without calling Puppeteer page.browser()', async () => {
    const page = {
      evaluate: vi.fn(async () => ({ innerWidth: 1200, innerHeight: 800 })),
      mouse: { wheel: vi.fn(async () => undefined) },
    };
    const automator = new AdvancedAutomator();
    automator.randomWait = vi.fn(async () => undefined);

    await automator.attach({} as any, page as any);
    await automator.organicWander();

    expect(createPlaywrightCursor).toHaveBeenCalledWith(page, { debug: false });
    expect(cursorActions.move).toHaveBeenCalledTimes(1);
    expect(page.mouse.wheel).toHaveBeenCalledTimes(1);
  });
});
