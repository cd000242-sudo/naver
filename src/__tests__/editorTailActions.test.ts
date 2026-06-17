import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
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

describe('editor tail debug instrumentation', () => {
  it('keeps TailDebug instrumentation on previous-post and hashtag tail steps', () => {
    const source = readFileSync(new URL('../automation/editorTailActions.ts', import.meta.url), 'utf8');
    expect(source).toContain('[TailDebug]');
    expect(source).toContain('previous-post-card-check');
    expect(source).toContain('tail-hashtag-start');
    expect(source).toContain('tail-hashtag-gap');
    expect(source).toContain('tail-hashtag-typed');
    expect(source).toContain('tail-hashtag-card-timeout-continue');
  });
});

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
    vi.clearAllMocks();
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
    ]);
    expect(self.waitForLinkCard).toHaveBeenCalledWith(15000, 500);
    expect(self.removeBareUrlTextAfterLinkCard).toHaveBeenCalledTimes(1);
    expect(ensureTailTypingReady).toHaveBeenCalled();
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

  it('verifies the editor tail before typing hashtags', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: true,
      previousPostCardReady: true,
      hashtagsToApply: ['#one', '#two'],
    });

    expect(pressed).toEqual([]);
    expect(ensureTailTypingReady).toHaveBeenCalledTimes(1);
    expect(self.delay).toHaveBeenCalledWith(1000);
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one', '#two'], {
      ensureTailReady: true,
      leadingEnterCount: 5,
      previousPostTailInserted: true,
    });
  });

  it('waits for any tail link card before adding five blank lines and hashtags', async () => {
    const self = makeSelf();
    const { page } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: false,
      previousPostCardReady: false,
      tailLinkCardInserted: true,
      tailLinkCardReady: true,
      hashtagsToApply: ['#one'],
    });

    expect(self.waitForLinkCard).not.toHaveBeenCalled();
    expect(self.delay).toHaveBeenCalledWith(1000);
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one'], {
      ensureTailReady: true,
      leadingEnterCount: 5,
      previousPostTailInserted: true,
    });
  });

  it('does not re-wait for a tail link card and still keeps five-line hashtag spacing after timeout', async () => {
    const self = makeSelf();
    const { page } = makePage();
    self.waitForLinkCard.mockResolvedValueOnce(false);

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: false,
      previousPostCardReady: false,
      tailLinkCardInserted: true,
      tailLinkCardReady: false,
      hashtagsToApply: ['#one'],
    });

    expect(self.waitForLinkCard).not.toHaveBeenCalled();
    expect(self.delay).toHaveBeenCalledWith(3000);
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one'], {
      ensureTailReady: false,
      leadingEnterCount: 5,
      previousPostTailInserted: false,
    });
  });

  it('continues with five-line spacing when the editor tail readiness probe is unstable after a previous-post card', async () => {
    vi.mocked(ensureTailTypingReady).mockResolvedValueOnce(false);
    const self = makeSelf();
    const { page } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: true,
      previousPostCardReady: true,
      hashtagsToApply: ['#one'],
    });

    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one'], {
      ensureTailReady: true,
      leadingEnterCount: 5,
      previousPostTailInserted: false,
    });
  });

  it('does not re-wait for a delayed previous-post card before typing hashtags', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: true,
      previousPostCardReady: false,
      hashtagsToApply: ['#one'],
    });

    expect(self.waitForLinkCard).not.toHaveBeenCalled();
    expect(self.removeBareUrlTextAfterLinkCard).not.toHaveBeenCalled();
    expect(pressed.filter((key) => key === 'Enter')).toHaveLength(0);
    expect(self.delay).toHaveBeenCalledWith(3000);
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one'], {
      ensureTailReady: false,
      leadingEnterCount: 5,
      previousPostTailInserted: false,
    });
  });

  it('continues with five-line spacing when the previous-post card wait times out', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();
    self.waitForLinkCard.mockResolvedValueOnce(false);

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: true,
      previousPostCardReady: false,
      hashtagsToApply: ['#one'],
    });

    expect(pressed).toEqual([]);
    expect(self.waitForLinkCard).not.toHaveBeenCalled();
    expect(self.delay).toHaveBeenCalledWith(3000);
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one'], {
      ensureTailReady: false,
      leadingEnterCount: 5,
      previousPostTailInserted: false,
    });
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

    expect(pressed.filter((key) => key === 'Enter')).toHaveLength(0);
    expect(ensureTailTypingReady).not.toHaveBeenCalled();
    expect(self.delay).not.toHaveBeenCalledWith(300);
    expect(self.applyHashtagsInBody).not.toHaveBeenCalled();
  });

  it('uses text-bearing tail focus and then hashtags directly when no previous post exists', async () => {
    const self = makeSelf();
    const { page, pressed } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: false,
      previousPostCardReady: false,
      hashtagsToApply: ['#one'],
    });

    expect(pressed.filter((key) => key === 'Enter')).toHaveLength(0);
    expect(ensureTailTypingReady).toHaveBeenCalledWith(
      page,
      { ok: true },
      expect.any(Function),
      { allowEmptyParagraph: false },
    );
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one'], {
      ensureTailReady: true,
      leadingEnterCount: 3,
      previousPostTailInserted: false,
    });
  });

  it('continues to hashtag input when no previous post exists even if tail readiness probe is unstable', async () => {
    vi.mocked(ensureTailTypingReady).mockResolvedValueOnce(false);
    const self = makeSelf();
    const { page, pressed } = makePage();

    await applyTailHashtagsAfterCards({
      self,
      page: page as any,
      previousPostTailInserted: false,
      previousPostCardReady: false,
      hashtagsToApply: ['#one', '#two'],
    });

    expect(pressed.filter((key) => key === 'Enter')).toHaveLength(0);
    expect(ensureTailTypingReady).toHaveBeenCalledWith(
      page,
      { ok: true },
      expect.any(Function),
      { allowEmptyParagraph: false },
    );
    expect(self.applyHashtagsInBody).toHaveBeenCalledWith(['#one', '#two'], {
      ensureTailReady: true,
      leadingEnterCount: 3,
      previousPostTailInserted: false,
    });
  });

  it('keeps strict hashtag tail mode but does not abort publishing on tail verification false positives', async () => {
    const tailSource = readFileSync(new URL('../automation/editorTailActions.ts', import.meta.url), 'utf8');
    expect(tailSource).toContain('const strictHashtagTail = linkCardInsertedBeforeHashtags');
    expect(tailSource).toContain('confirmedTailLinkCardReady');
    expect(tailSource).toContain('tailCursorVerified');

    const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    expect(source).toContain('allowBestEffortTailWithoutPreviousPost');
    expect(source).toContain('options.previousPostTailInserted !== true');
    expect(source).toContain('apply-hashtags-tail-not-ready-fail-open');
    expect(source).not.toContain('throw new Error(`HASHTAG_TAIL_NOT_READY');
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
      'https://example.com/product',
    ]);
    expect(pressed).toEqual(['Enter', 'Enter', 'Enter', 'Enter']);
    expect(self.waitForLinkCard).toHaveBeenCalledWith(15000, 500);
    expect(self.removeBareUrlTextAfterLinkCard).toHaveBeenCalledTimes(1);
  });
});
