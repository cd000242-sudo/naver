import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_URL,
  DROPSHOT_LOGIN_URL,
  DROPSHOT_HOME_URL,
  isLoggedIn,
  navigateToDropshotBoard,
  navigateToDropshotLogin,
  probeDropshotAuthSession,
  sanitizeDropshotErrorMessage,
} from '../image/dropshotBrowser';

function jwtWithExpiry(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('Dropshot board navigation resilience', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'https://aistudio.dropshot.io' } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses the early commit signal instead of waiting for all DOM content', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue(BOARD_URL),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(true),
    };

    await expect(navigateToDropshotBoard(page, undefined, 12_000)).resolves.toBe(true);
    expect(page.goto).toHaveBeenCalledWith(BOARD_URL, {
      waitUntil: 'commit',
      timeout: 12_000,
    });
  });

  it('does not accept a committed but blank document as a successful navigation', async () => {
    let currentUrl = 'about:blank';
    const page = {
      goto: vi.fn().mockImplementation(async (url: string) => {
        currentUrl = url;
      }),
      reload: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => currentUrl),
      waitForFunction: vi.fn().mockRejectedValue(new Error('render timeout')),
      evaluate: vi.fn().mockResolvedValue(false),
    };

    await expect(navigateToDropshotBoard(page, undefined, 12_000)).resolves.toBe(false);
    expect(page.goto).toHaveBeenNthCalledWith(1, BOARD_URL, expect.any(Object));
    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenNthCalledWith(2, DROPSHOT_HOME_URL, expect.any(Object));
  });

  it('recovers a blank committed board with one controlled reload', async () => {
    let currentUrl = 'about:blank';
    const page = {
      goto: vi.fn().mockImplementation(async (url: string) => {
        currentUrl = url;
      }),
      reload: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => currentUrl),
      waitForFunction: vi
        .fn()
        .mockRejectedValueOnce(new Error('first render timeout'))
        .mockResolvedValueOnce(undefined),
      evaluate: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };

    await expect(navigateToDropshotBoard(page, undefined, 12_000)).resolves.toBe(true);
    expect(page.reload).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledTimes(1);
  });

  it('opens the dedicated subscription login page when unlimited entitlement is missing', async () => {
    let currentUrl = 'about:blank';
    const page = {
      goto: vi.fn().mockImplementation(async (url: string) => {
        currentUrl = url;
      }),
      url: vi.fn(() => currentUrl),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(true),
    };

    await expect(navigateToDropshotLogin(page)).resolves.toBe(true);
    expect(page.goto).toHaveBeenCalledWith(DROPSHOT_LOGIN_URL, {
      waitUntil: 'commit',
      timeout: 30_000,
    });
  });

  it('opens the Dropshot home page when the board route times out', async () => {
    let currentUrl = 'about:blank';
    const page = {
      goto: vi
        .fn()
        .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_TIMED_OUT'))
        .mockImplementationOnce(async (url: string) => {
          currentUrl = url;
        }),
      url: vi.fn(() => currentUrl),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(true),
    };
    const logs: string[] = [];

    await expect(
      navigateToDropshotBoard(page, (message) => logs.push(message), 45_000),
    ).resolves.toBe(true);
    expect(page.goto).toHaveBeenNthCalledWith(2, DROPSHOT_HOME_URL, {
      waitUntil: 'commit',
      timeout: 20_000,
    });
    expect(logs.join('\n')).toContain('ERR_CONNECTION_TIMED_OUT');
  });

  it('returns false instead of leaking a page.goto error when both routes fail', async () => {
    const page = {
      goto: vi.fn().mockRejectedValue(new Error('net::ERR_CONNECTION_TIMED_OUT')),
      url: vi.fn().mockReturnValue('about:blank'),
    };

    await expect(navigateToDropshotBoard(page)).resolves.toBe(false);
  });

  it('removes ANSI sequences, control characters, and multiline Playwright noise', () => {
    const raw = '\u001b[2m - navigating to "https://aistudio.dropshot.io"\u001b[22m\nCall log:\tERR_CONNECTION_TIMED_OUT';
    const clean = sanitizeDropshotErrorMessage(raw, 500);

    expect(clean).toContain('ERR_CONNECTION_TIMED_OUT');
    expect(clean).not.toContain('\u001b');
    expect(clean).not.toMatch(/[\r\n\t]/);
  });

  it('detects the current Auth.js session even when legacy Cognito JWTs expired', async () => {
    const nowMs = Date.UTC(2026, 6, 17, 1, 0, 0);
    const nowSeconds = Math.floor(nowMs / 1000);
    const expiredJwt = jwtWithExpiry(nowSeconds - 60);
    const tokenName = 'CognitoIdentityServiceProvider.client.user.idToken';
    const storageState = {
      origins: [{ origin: DROPSHOT_HOME_URL, localStorage: [{ name: tokenName, value: expiredJwt }] }],
      cookies: [
        {
          name: 'ds.session-token.0',
          value: `chunk-zero-${'a'.repeat(200)}`,
          domain: '.dropshot.io',
          httpOnly: true,
          secure: true,
          expires: nowSeconds + 30 * 24 * 60 * 60,
        },
        {
          name: 'ds.session-token.1',
          value: `chunk-one-${'b'.repeat(200)}`,
          domain: '.dropshot.io',
          httpOnly: true,
          secure: true,
          expires: nowSeconds + 30 * 24 * 60 * 60,
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ user: { id: 'authenticated-user' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      context: vi.fn().mockReturnValue({ storageState: vi.fn().mockResolvedValue(storageState) }),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    }));
  });

  it('recognizes the Auth.js session before the login route finishes redirecting', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ user: { id: 'authenticated-user' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(DROPSHOT_LOGIN_URL),
      context: vi.fn().mockReturnValue({ storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }) }),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    }));
  });

  it('does not trust split session cookie metadata when the Auth.js endpoint is unauthenticated', async () => {
    const nowMs = Date.UTC(2026, 6, 17, 1, 0, 0);
    const nowSeconds = Math.floor(nowMs / 1000);
    const chunk = `opaque-session-${'x'.repeat(200)}`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(null),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      context: vi.fn().mockReturnValue({
        storageState: vi.fn().mockResolvedValue({
          cookies: [
            {
              name: 'ds.session-token.0',
              value: chunk,
              domain: '.dropshot.io',
              httpOnly: true,
              secure: true,
              expires: nowSeconds + 3_600,
            },
            {
              name: 'ds.session-token.1',
              value: chunk,
              domain: '.dropshot.io',
              httpOnly: true,
              secure: true,
              expires: nowSeconds + 3_600,
            },
          ],
          origins: [],
        }),
      }),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['HTTP 401', vi.fn().mockResolvedValue({ ok: false, status: 401 })],
    ['network failure', vi.fn().mockRejectedValue(new Error('network unavailable'))],
  ])('does not throw or authenticate when the Auth.js probe has %s', async (_label, fetchMock) => {
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      context: vi.fn().mockReturnValue({ storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }) }),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not trust a legacy Cognito JWT when the authoritative session API is unavailable', async () => {
    const tokenName = 'CognitoIdentityServiceProvider.client.user.idToken';
    const validJwt = jwtWithExpiry(Math.floor(Date.now() / 1000) + 120);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      context: vi.fn().mockReturnValue({
        storageState: vi.fn().mockResolvedValue({
          cookies: [],
          origins: [{ origin: DROPSHOT_HOME_URL, localStorage: [{ name: tokenName, value: validJwt }] }],
        }),
      }),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honors an explicit unauthenticated session response over a stale legacy JWT', async () => {
    const tokenName = 'CognitoIdentityServiceProvider.client.user.idToken';
    const validJwt = jwtWithExpiry(Math.floor(Date.now() / 1000) + 120);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(null),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      context: vi.fn().mockReturnValue({
        storageState: vi.fn().mockResolvedValue({
          cookies: [],
          origins: [{ origin: DROPSHOT_HOME_URL, localStorage: [{ name: tokenName, value: validJwt }] }],
        }),
      }),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never probes or accepts a session from a non-Studio Dropshot subdomain', async () => {
    const page = {
      url: vi.fn().mockReturnValue('https://stock.dropshot.io/auth/callback'),
      evaluate: vi.fn().mockResolvedValue('authenticated'),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('rechecks the document origin inside evaluate when OAuth navigation races the probe', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://stock.dropshot.io' } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ user: { id: 'wrong-product-session' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      evaluate: vi.fn(async (callback: (arg?: unknown) => unknown, arg?: unknown) => await callback(arg)),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds a renderer-side session probe that never resolves', async () => {
    vi.useFakeTimers();
    const page = {
      url: vi.fn().mockReturnValue(BOARD_URL),
      evaluate: vi.fn(() => new Promise(() => undefined)),
    };

    const probe = probeDropshotAuthSession(page, 500);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(probe).resolves.toBe('unavailable');
  });

  it('does not report success while the visible browser is on an explicit Dropshot login page', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenName = 'CognitoIdentityServiceProvider.client.user.idToken';
    const page = {
      url: vi.fn().mockReturnValue(
        'https://stock.dropshot.io/ko/logIn?redirectTo=https%3A%2F%2Faistudio.dropshot.io',
      ),
      context: vi.fn().mockReturnValue({
        storageState: vi.fn().mockResolvedValue({
          origins: [{
            origin: DROPSHOT_HOME_URL,
            localStorage: [{ name: tokenName, value: jwtWithExpiry(nowSeconds + 120) }],
          }],
        }),
      }),
      evaluate: vi.fn().mockResolvedValue([]),
    };

    await expect(isLoggedIn(page)).resolves.toBe(false);
  });

  it('routes login checks and generation setup through the resilient navigator', () => {
    const loginSource = readFileSync(
      join(process.cwd(), 'src', 'image', 'dropshotLogin.ts'),
      'utf8',
    );
    const coreSource = readFileSync(
      join(process.cwd(), 'src', 'image', 'dropshotCore.ts'),
      'utf8',
    );

    expect(loginSource).toContain('navigateToDropshotBoard');
    expect(coreSource).toContain('navigateToDropshotBoard');
    expect(loginSource).not.toMatch(/\bpage\.goto\(BOARD_URL/);
    expect(coreSource).not.toMatch(/\b(?:page|hpage)\.goto\(BOARD_URL/);
  });
});
