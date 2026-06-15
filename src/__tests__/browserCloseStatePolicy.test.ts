import { describe, expect, it } from 'vitest';
import { resolveBrowserCloseStateReset } from '../automation/browserCloseStatePolicy.js';

describe('resolveBrowserCloseStateReset', () => {
  it('resets browser, page, and mainFrame after a browser close path', () => {
    expect(resolveBrowserCloseStateReset()).toEqual({
      browser: null,
      page: null,
      mainFrame: null,
      closed: true,
    });
  });

  it('returns a fresh immutable reset object each time', () => {
    const first = resolveBrowserCloseStateReset();
    const second = resolveBrowserCloseStateReset();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
