import { describe, expect, it, vi } from 'vitest';
import {
  isDropshotProfileLockError,
  minimizeDropshotWindow,
} from '../image/dropshotBrowser.js';

describe('Dropshot window hiding', () => {
  it('recognizes dedicated-profile lock errors without matching unrelated profile text', () => {
    expect(isDropshotProfileLockError(new Error('Failed to create a ProcessSingleton for your profile directory'))).toBe(true);
    expect(isDropshotProfileLockError(new Error('user data directory is already in use'))).toBe(true);
    expect(isDropshotProfileLockError(new Error('Failed to load user profile image'))).toBe(false);
  });

  it('normalizes and retries when Chrome rejects the first minimize transition', async () => {
    let minimizeAttempts = 0;
    const send = vi.fn(async (method: string, params?: any) => {
      if (method === 'Browser.getWindowForTarget') return { windowId: 77 };
      if (method === 'Browser.setWindowBounds' && params?.bounds?.windowState === 'minimized') {
        minimizeAttempts += 1;
        if (minimizeAttempts === 1) throw new Error('window state transition rejected');
      }
      return {};
    });
    const detach = vi.fn(async () => undefined);
    const context = { newCDPSession: vi.fn(async () => ({ send, detach })) };
    const page = { context: vi.fn(() => context) };

    await expect(minimizeDropshotWindow(page)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('Browser.setWindowBounds', {
      windowId: 77,
      bounds: { windowState: 'normal' },
    });
    expect(minimizeAttempts).toBe(2);
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('minimizes every Chrome window owned by the dedicated login context', async () => {
    const dropshotPage = { id: 'dropshot' };
    const oauthPopup = { id: 'oauth-popup' };
    const minimizedWindowIds: number[] = [];
    const context = {
      pages: vi.fn(() => [dropshotPage, oauthPopup]),
      newCDPSession: vi.fn(async (target: any) => ({
        send: vi.fn(async (method: string, params?: any) => {
          if (method === 'Browser.getWindowForTarget') {
            return { windowId: target === dropshotPage ? 10 : 20 };
          }
          if (method === 'Browser.setWindowBounds' && params?.bounds?.windowState === 'minimized') {
            minimizedWindowIds.push(params.windowId);
          }
          return {};
        }),
        detach: vi.fn(async () => undefined),
      })),
    };
    (dropshotPage as any).context = vi.fn(() => context);

    await expect(minimizeDropshotWindow(dropshotPage)).resolves.toBe(true);
    expect(minimizedWindowIds).toEqual([10, 20]);
  });
});
