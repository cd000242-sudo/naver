import { describe, expect, it, vi } from 'vitest';
import {
  classifyDropshotSessionReply,
  createDropshotLoginTabAdvancer,
  detectDropshotLogin,
  isDropshotSessionCookie,
} from '../image/dropshotLoginWatch.js';

const STOCK_LOGIN = 'https://stock.dropshot.io/ko/logIn';
const BOARD = 'https://aistudio.dropshot.io/ko/workspace/board?panel=image';
const LONG_COOKIE = { domain: '.dropshot.io', name: 'ds.session-token.0', value: 'x'.repeat(150) };

type Reply = { status: number; body: string } | 'error';

function fakeContext(opts: { reply?: Reply; cookies?: unknown[] } = {}) {
  const get = vi.fn(async () => {
    if (!opts.reply || opts.reply === 'error') throw new Error('net::ERR_FAILED');
    const reply = opts.reply;
    return { status: () => reply.status, text: async () => reply.body };
  });
  return {
    context: { request: { get }, cookies: vi.fn(async () => opts.cookies ?? []) },
    get,
  };
}
const pageAt = (url: string) => ({ url: () => url });
const SIGNED_IN: Reply = { status: 200, body: JSON.stringify({ user: { id: 'u1', name: 'n' } }) };
const SIGNED_OUT: Reply = { status: 200, body: 'null' };

describe('Dropshot session reply classification', () => {
  it('reads three states from the session API answer', () => {
    expect(classifyDropshotSessionReply(200, SIGNED_IN.body)).toBe('authenticated');
    expect(classifyDropshotSessionReply(200, 'null')).toBe('unauthenticated');
    expect(classifyDropshotSessionReply(200, '{}')).toBe('unauthenticated');
    expect(classifyDropshotSessionReply(200, JSON.stringify({ user: { id: '  ' } }))).toBe('unauthenticated');
    expect(classifyDropshotSessionReply(401, '')).toBe('unauthenticated');
    expect(classifyDropshotSessionReply(403, '')).toBe('unauthenticated');
    expect(classifyDropshotSessionReply(500, '')).toBe('unavailable');
    expect(classifyDropshotSessionReply(200, '<html>challenge</html>')).toBe('unavailable');
  });

  it('accepts only the long httpOnly session cookie of Dropshot', () => {
    expect(isDropshotSessionCookie(LONG_COOKIE)).toBe(true);
    expect(isDropshotSessionCookie({ ...LONG_COOKIE, value: 'short' })).toBe(false);
    expect(isDropshotSessionCookie({ ...LONG_COOKIE, name: 'other' })).toBe(false);
    expect(isDropshotSessionCookie({ ...LONG_COOKIE, domain: '.example.com' })).toBe(false);
    expect(isDropshotSessionCookie(null)).toBe(false);
  });
});

describe('Dropshot login tab advancer (tab stays on the sign-in page after login)', () => {
  it('opens the board when the session API names a user while the tab sits on the sign-in page', async () => {
    const { context } = fakeContext({ reply: SIGNED_IN, cookies: [LONG_COOKIE] });
    const navigateToBoard = vi.fn(async () => true);
    const advance = createDropshotLoginTabAdvancer({ navigateToBoard });
    const page = pageAt(STOCK_LOGIN);
    await expect(advance(context, page)).resolves.toBe(true);
    expect(navigateToBoard).toHaveBeenCalledTimes(1);
    expect(navigateToBoard.mock.calls[0][0]).toBe(page);
  });

  it('ignores a stale cookie when the session API says nobody is signed in', async () => {
    const { context } = fakeContext({ reply: SIGNED_OUT, cookies: [LONG_COOKIE] });
    const navigateToBoard = vi.fn(async () => true);
    const advance = createDropshotLoginTabAdvancer({ navigateToBoard });
    await expect(advance(context, pageAt(STOCK_LOGIN))).resolves.toBe(false);
    expect(navigateToBoard).not.toHaveBeenCalled();
  });

  it('uses a long session cookie as the hint when the session API cannot be read', async () => {
    const { context } = fakeContext({ reply: 'error', cookies: [LONG_COOKIE] });
    const navigateToBoard = vi.fn(async () => true);
    const advance = createDropshotLoginTabAdvancer({ navigateToBoard });
    await expect(advance(context, pageAt(STOCK_LOGIN))).resolves.toBe(true);
    expect(navigateToBoard).toHaveBeenCalledTimes(1);
  });

  it('does not probe on every tick without a cookie (first tick and every 10th only)', async () => {
    const { context, get } = fakeContext({ reply: SIGNED_OUT, cookies: [] });
    const advance = createDropshotLoginTabAdvancer({ navigateToBoard: vi.fn(async () => true) });
    for (let i = 0; i < 10; i += 1) await advance(context, pageAt(STOCK_LOGIN));
    expect(get).toHaveBeenCalledTimes(1);
    await advance(context, pageAt(STOCK_LOGIN));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('leaves tabs on the board origin to the normal in-page check and never touches third-party tabs', async () => {
    const { context, get } = fakeContext({ reply: SIGNED_IN, cookies: [LONG_COOKIE] });
    const navigateToBoard = vi.fn(async () => true);
    const advance = createDropshotLoginTabAdvancer({ navigateToBoard });
    await expect(advance(context, pageAt(BOARD))).resolves.toBe(false);
    await expect(advance(context, pageAt('https://accounts.google.com/v3/signin/identifier'))).resolves.toBe(false);
    await expect(advance(context, pageAt('about:blank'))).resolves.toBe(false);
    await expect(advance(context, {})).resolves.toBe(false);
    expect(navigateToBoard).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('limits board navigation attempts: 20 s apart, at most 4', async () => {
    const { context } = fakeContext({ reply: SIGNED_IN, cookies: [LONG_COOKIE] });
    const navigateToBoard = vi.fn(async () => false);
    let now = 1_000;
    const advance = createDropshotLoginTabAdvancer({ navigateToBoard, now: () => now });
    const page = pageAt(STOCK_LOGIN);
    await advance(context, page);
    await advance(context, page);
    expect(navigateToBoard).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 6; i += 1) {
      now += 21_000;
      await advance(context, page);
    }
    expect(navigateToBoard).toHaveBeenCalledTimes(4);
  });
});

describe('detectDropshotLogin', () => {
  it('returns at once when the normal check already sees the login', async () => {
    const { context, get } = fakeContext({ reply: SIGNED_IN, cookies: [LONG_COOKIE] });
    const isLoggedIn = vi.fn(async () => true);
    await expect(detectDropshotLogin(context, pageAt(BOARD), { isLoggedIn, navigateToBoard: vi.fn() })).resolves.toBe(true);
    expect(isLoggedIn).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });

  it('opens the board and re-checks when the tab stays on the sign-in page', async () => {
    const { context } = fakeContext({ reply: SIGNED_IN, cookies: [LONG_COOKIE] });
    const isLoggedIn = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const navigateToBoard = vi.fn(async () => true);
    await expect(detectDropshotLogin(context, pageAt(STOCK_LOGIN), { isLoggedIn, navigateToBoard })).resolves.toBe(true);
    expect(navigateToBoard).toHaveBeenCalledTimes(1);
    expect(isLoggedIn).toHaveBeenCalledTimes(2);
  });

  it('stays false (one normal check only) when nobody is signed in', async () => {
    const { context } = fakeContext({ reply: SIGNED_OUT, cookies: [] });
    const isLoggedIn = vi.fn(async () => false);
    await expect(detectDropshotLogin(context, pageAt(STOCK_LOGIN), { isLoggedIn, navigateToBoard: vi.fn() })).resolves.toBe(false);
    expect(isLoggedIn).toHaveBeenCalledTimes(1);
  });
});
