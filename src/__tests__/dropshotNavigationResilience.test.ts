import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BOARD_URL,
  DROPSHOT_LOGIN_URL,
  DROPSHOT_HOME_URL,
  hasDropshotAuthInStorageState,
  isLoggedIn,
  isUsableDropshotJwt,
  navigateToDropshotBoard,
  navigateToDropshotLogin,
  sanitizeDropshotErrorMessage,
} from '../image/dropshotBrowser';

function jwtWithExpiry(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('Dropshot board navigation resilience', () => {
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

  it('accepts only unexpired Cognito JWTs', () => {
    const nowMs = Date.UTC(2026, 6, 11, 0, 0, 0);
    const nowSeconds = Math.floor(nowMs / 1000);

    expect(isUsableDropshotJwt(jwtWithExpiry(nowSeconds + 120), nowMs)).toBe(true);
    expect(isUsableDropshotJwt(jwtWithExpiry(nowSeconds - 1), nowMs)).toBe(false);
    expect(isUsableDropshotJwt('opaque-token-that-is-longer-than-twenty-characters', nowMs)).toBe(false);
    expect(isUsableDropshotJwt(`a.${'A'.repeat(20_000)}.b`, nowMs)).toBe(false);
  });

  it('detects persisted auth in local storage or cookies without opening the board route', () => {
    const nowMs = Date.UTC(2026, 6, 11, 0, 0, 0);
    const validJwt = jwtWithExpiry(Math.floor(nowMs / 1000) + 120);
    const expiredJwt = jwtWithExpiry(Math.floor(nowMs / 1000) - 1);
    const tokenName = 'CognitoIdentityServiceProvider.client.user.idToken';

    expect(hasDropshotAuthInStorageState({
      cookies: [],
      origins: [{ origin: DROPSHOT_HOME_URL, localStorage: [{ name: tokenName, value: validJwt }] }],
    }, nowMs)).toBe(true);
    expect(hasDropshotAuthInStorageState({
      cookies: [{ name: tokenName, value: validJwt, domain: '.dropshot.io' }],
      origins: [],
    }, nowMs)).toBe(true);
    expect(hasDropshotAuthInStorageState({
      cookies: [{ name: tokenName, value: expiredJwt, domain: 'aistudio.dropshot.io' }],
      origins: [],
    }, nowMs)).toBe(false);
  });

  it('ignores Cognito-shaped tokens from unrelated origins and cookie domains', () => {
    const nowMs = Date.UTC(2026, 6, 11, 0, 0, 0);
    const validJwt = jwtWithExpiry(Math.floor(nowMs / 1000) + 120);
    const tokenName = 'CognitoIdentityServiceProvider.client.user.accessToken';

    expect(hasDropshotAuthInStorageState({
      cookies: [],
      origins: [{ origin: 'https://example.com', localStorage: [{ name: tokenName, value: validJwt }] }],
    }, nowMs)).toBe(false);
    expect(hasDropshotAuthInStorageState({
      cookies: [{ name: tokenName, value: validJwt, domain: 'dropshot.io.example.com' }],
      origins: [],
    }, nowMs)).toBe(false);
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
