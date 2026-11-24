import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertPreviousPostTailBlock, PREVIOUS_POST_SEPARATOR } from '../automation/editorTailActions.js';
import { getExpectedLinkCardMin, resolvePreviousPostCardList } from '../automation/editorTailPlan.js';
import { safeKeyboardType } from '../automation/typingUtils.js';
import { ensureTailTypingReady } from '../automation/richTextPaste.js';

vi.mock('../automation/ctaHelpers.js', () => ({ PREV_POST_HOOKS: ['hook line'] }));
vi.mock('../automation/typingUtils.js', () => ({ safeKeyboardType: vi.fn() }));
vi.mock('../automation/richTextPaste.js', () => ({ ensureTailTypingReady: vi.fn() }));

const A = 'https://blog.naver.com/my_blog/1';
const B = 'https://blog.naver.com/my_blog/2';
const C = 'https://blog.naver.com/my_blog/3';
const typed: string[] = [];

function makeSelf(cardResults: boolean[] = [true, true, true]) {
  const results = [...cardResults];
  return {
    log: vi.fn(),
    delay: vi.fn(async () => undefined),
    getAttachedFrame: vi.fn(async () => ({ ok: true })),
    waitForLinkCard: vi.fn(async () => results.shift() ?? true),
    removeBareUrlTextAfterLinkCard: vi.fn(async () => undefined),
    alignPreviousPostCards: vi.fn(async () => undefined),
  } as Record<string, any>;
}

function makePage() {
  const pressed: string[] = [];
  return { pressed, page: { keyboard: { press: vi.fn(async (key: string) => { pressed.push(key); }) } } };
}

const cards = [{ url: A, title: 'a' }, { url: B, title: 'b' }, { url: C, title: 'c' }];

beforeEach(() => {
  vi.clearAllMocks();
  typed.length = 0;
  vi.mocked(safeKeyboardType).mockImplementation(async (_page, text) => { typed.push(String(text)); });
  vi.mocked(ensureTailTypingReady).mockResolvedValue(true);
});

describe('previous-post card list', () => {
  it('starts with the legacy previous post and adds up to two more same-blog cards', () => {
    expect(resolvePreviousPostCardList({ previousPostUrl: A, previousPostTitle: 'a', previousPostCards: cards }).map(c => c.url)).toEqual([A, B, C]);
    expect(resolvePreviousPostCardList({ previousPostUrl: A }).map(c => c.url)).toEqual([A]);
    expect(resolvePreviousPostCardList({ previousPostUrl: A, previousPostCards: [...cards, { url: 'https://blog.naver.com/my_blog/4' }] })).toHaveLength(3);
  });
  it('skips duplicates, affiliate or CTA links and other blogs', () => {
    const list = resolvePreviousPostCardList({
      previousPostUrl: A,
      previousPostCards: [{ url: `${A}?x=1` }, { url: B }, { url: 'https://blog.naver.com/other/5' }, { url: C }, { url: 'https://example.com' }],
      affiliateLink: B,
      ctas: [{ link: C }],
    });
    expect(list.map(c => c.url)).toEqual([A]);
  });
  it('returns nothing when the legacy previous post repeats the affiliate link', () => {
    expect(resolvePreviousPostCardList({ previousPostUrl: 'https://naver.me/abc/', affiliateLink: 'https://naver.me/abc?NaPm=1' })).toEqual([]);
  });
  it('counts the previous-post cards actually placed', () => {
    expect(getExpectedLinkCardMin(3, [{ link: 'https://x.example' }])).toBe(4);
    expect(getExpectedLinkCardMin(0, [])).toBe(0);
    expect(getExpectedLinkCardMin(true, [])).toBe(1);
  });
});

describe('insertPreviousPostTailBlock with three cards', () => {
  it('types the separator and hook once, then each card URL in order', async () => {
    const self = makeSelf();
    const { page } = makePage();
    const result = await insertPreviousPostTailBlock(self, page as any, { previousPostUrl: A, previousPostTitle: 'a', previousPostCards: cards }, [], 'unit');
    expect(typed).toEqual([PREVIOUS_POST_SEPARATOR, 'hook line', A, B, C]);
    expect(self.waitForLinkCard).toHaveBeenCalledTimes(3);
    expect(self.waitForLinkCard).toHaveBeenCalledWith(15000, 500);
    expect(self.removeBareUrlTextAfterLinkCard.mock.calls.map((call: unknown[]) => call[0])).toEqual([A, B, C]);
    expect(self.alignPreviousPostCards).toHaveBeenCalledWith([A, B, C]);
    expect(self.__previousPostCardsAttached).toEqual([A, B, C]);
    expect(result).toEqual({ inserted: true, cardReady: true, cardCount: 3, cardUrls: [A, B, C] });
  });

  it('skips a card that does not appear in time and removes its bare URL text', async () => {
    const self = makeSelf([true, false, true]);
    const { page } = makePage();
    const result = await insertPreviousPostTailBlock(self, page as any, { previousPostUrl: A, previousPostCards: cards }, [], 'unit');
    expect(typed).toEqual([PREVIOUS_POST_SEPARATOR, 'hook line', A, B, C]);
    expect(self.removeBareUrlTextAfterLinkCard.mock.calls.map((call: unknown[]) => call[0])).toEqual([A, B, C]);
    expect(result).toMatchObject({ inserted: true, cardReady: true, cardCount: 2, cardUrls: [A, C] });
    expect(self.alignPreviousPostCards).toHaveBeenCalledWith([A, C]);
  });

  it('reports no ready card when every card times out', async () => {
    const self = makeSelf([false, false, false]);
    const { page } = makePage();
    const result = await insertPreviousPostTailBlock(self, page as any, { previousPostUrl: A, previousPostCards: cards }, [], 'unit');
    expect(result).toMatchObject({ inserted: true, cardReady: false, cardCount: 0, cardUrls: [] });
    expect(self.alignPreviousPostCards).not.toHaveBeenCalled();
  });

  it('works without the alignment hook and survives a failing hook', async () => {
    const self = makeSelf();
    delete self.alignPreviousPostCards;
    const { page } = makePage();
    await expect(insertPreviousPostTailBlock(self, page as any, { previousPostUrl: A, previousPostCards: cards }, [], 'unit')).resolves.toMatchObject({ cardCount: 3 });
    const failing = makeSelf();
    failing.alignPreviousPostCards = vi.fn(async () => { throw new Error('nope'); });
    await expect(insertPreviousPostTailBlock(failing, page as any, { previousPostUrl: A, previousPostCards: cards }, [], 'unit')).resolves.toMatchObject({ cardCount: 3 });
  });

  it('keeps the single-card result shape and timeout behaviour unchanged', async () => {
    const self = makeSelf([false]);
    const { page, pressed } = makePage();
    const result = await insertPreviousPostTailBlock(self, page as any, { previousPostUrl: A }, [], 'unit');
    expect(result).toEqual({ inserted: true, cardReady: false });
    expect(pressed).toEqual(['Enter', 'Enter', 'Enter', 'Enter']);
    expect(self.removeBareUrlTextAfterLinkCard).not.toHaveBeenCalled();
    expect(self.__previousPostCardsAttached).toEqual([A]);
  });
});
