import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTailHashtagsAfterCards,
  insertTailLinkCardBlock,
  insertPreviousPostTailBlock,
  PREVIOUS_POST_SEPARATOR,
} from '../automation/editorTailActions.js';
import { safeKeyboardType } from '../automation/typingUtils.js';
import { ensureTailTypingReady } from '../automation/richTextPaste.js';

vi.mock('../automation/ctaHelpers.js', () => ({
  PREV_POST_HOOKS: ['hook line'],
}));

vi.mock('../automation/typingUtils.js', () => ({
  safeKeyboardType: vi.fn(),
}));

vi.mock('../automation/richTextPaste.js', () => ({
  ensureTailTypingReady: vi.fn(),
}));

const typed: string[] = [];

function makePage() {
  const pressed: string[] = [];
  const page = {
    keyboard: {
      press: vi.fn(async (key: string) => {
        pressed.push(key);
      }),
      down: vi.fn(async (key: string) => {
        pressed.push(`down:${key}`);
      }),
      up: vi.fn(async (key: string) => {
        pressed.push(`up:${key}`);
      }),
    },
  };
  return { page, pressed };
}

function makeSelf() {
  return {
    DELAYS: {
      SHORT: 150,
      MEDIUM: 200,
    },
    log: vi.fn(),
    delay: vi.fn(async () => undefined),
    getAttachedFrame: vi.fn(async () => ({ ok: true })),
    applyHashtagsInBody: vi.fn(async () => undefined),
    waitForLinkCard: vi.fn(async () => true),
    removeBareUrlTextAfterLinkCard: vi.fn(async () => undefined),
  };
}

describe('editor tail actions', () => {
  beforeEach(() => {
    typed.length = 0;
    vi.mocked(safeKeyboardType).mockImplementation(async (_page, text) => {
      typed.push(String(text));
    });
    vi.mocked(ensureTailTypingReady).mockResolvedValue(true);
  });

  it('types the previous-post tail block before hashtag insertion can start', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    const result = await insertPreviousPostTailBlock(
      self,
      page as any,
      { previousPostUrl: 'https://blog.naver.com/rimi_77-/224299610946' },
      [],
      'unit'
    );

    expect(result).toEqual({ inserted: true, cardReady: true });
    expect(typed).toEqual([
      PREVIOUS_POST_SEPARATOR,
      'hook line',
      'https://blog.naver.com/rimi_77-/224299610946',
    ]);
    expect(pressed).toEqual([
      'Enter',
      'Enter',
      'Enter',
      'Enter',
      'End',
      'down:Control',
      'End',
      'up:Control',
    ]);
    expect(self.waitForLinkCard).toHaveBeenCalledWith(15000, 500);
    expect(self.removeBareUrlTextAfterLinkCard).toHaveBeenCalledTimes(1);
  });

  it('skips the previous-post block when the affiliate URL is the same target', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    const result = await insertPreviousPostTailBlock(
      self,
      page as any,
      {
        affiliateLink: 'https://naver.me/abc?NaPm=tracked',
        previousPostUrl: 'https://naver.me/abc/',
      },
      [],
      'unit'
    );

    expect(result).toEqual({ inserted: false, cardReady: false });
    expect(typed).toEqual([]);
    expect(pressed).toEqual([]);
  });

  it('moves below the previous-post card before typing hashtags', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: true,
      previousPostCardReady: true,
      hashtagsToApply: ['#one', '#two'],
    });

    expect(pressed).toEqual([
      'End',
      'down:Control',
      'End',
      'up:Control',
      'Enter',
      'Enter',
      'Enter',
      'Enter',
      'Enter',
      'End',
    ]);
    expect(self.delay).toHaveBeenCalledWith(1000);
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one', '#two']);
  });

  it('uses the shorter hashtag gap when no previous-post card was inserted', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: false,
      previousPostCardReady: false,
      hashtagsToApply: [],
    });

    expect(pressed.filter((key) => key === 'Enter')).toHaveLength(3);
    expect(self.delay).toHaveBeenCalledWith(3000);
    expect(self.applyHashtagsInBody).not.toHaveBeenCalled();
  });

  it('types a reusable tail link-card block for CTA and official-site links', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    const result = await insertTailLinkCardBlock({
      self,
      page: page as any,
      label: '📎 자세히 보러가기',
      url: 'https://example.com/product',
    });

    expect(result).toEqual({ cardReady: true });
    expect(typed).toEqual([
      PREVIOUS_POST_SEPARATOR,
      '📎 자세히 보러가기',
      '👉 https://example.com/product',
    ]);
    expect(pressed).toEqual(['Enter', 'Enter', 'Enter', 'Enter']);
    expect(self.waitForLinkCard).toHaveBeenCalledWith(15000, 500);
  });
});
