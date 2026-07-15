import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { clearAgentDetectionCache, detectAgent } from '../agentCli/detect';

function versionResult() {
  return { code: 0, stdout: '2.1.0', stderr: '' };
}

function authResult(subscriptionType = 'pro') {
  return {
    code: 0,
    stdout: JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      subscriptionType,
    }),
    stderr: '',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return Object.freeze({ promise, resolve });
}

describe('detectAgent Claude subscription entitlement', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    clearAgentDetectionCache();
    process.env.ANTHROPIC_API_KEY = 'must-not-reach-claude-agent';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('marks Claude ready only after a live subscription entitlement probe succeeds', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('pro'))
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ is_error: false, result: 'READY' }),
        stderr: '',
      });

    const status = await detectAgent('claude');

    expect(status).toMatchObject({
      provider: 'claude',
      installed: true,
      loggedIn: true,
      available: true,
      availabilityCheck: 'live',
      errorCode: undefined,
    });
    expect(spawnMock).toHaveBeenCalledTimes(3);
    const entitlementCall = spawnMock.mock.calls[2][0];
    expect(entitlementCall.args).toContain('--max-turns');
    expect(entitlementCall.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('keeps a successful noisy version probe installed without exposing logs or secret URLs', async () => {
    spawnMock
      .mockResolvedValueOnce({
        code: 0,
        stdout: '[Startup-Async] exposurePoller started\ntoken=secret-token',
        stderr: 'Proxy https://alice:secret@proxy.example failed',
      })
      .mockResolvedValueOnce(authResult('free'));

    const status = await detectAgent('claude');

    expect(status.installed).toBe(true);
    expect(status.version).toBe('Claude Code');
    expect(JSON.stringify(status)).not.toContain('Startup-Async');
    expect(JSON.stringify(status)).not.toContain('secret-token');
    expect(JSON.stringify(status)).not.toContain('proxy.example');
  });

  it('fails closed when the entitlement response is not exactly READY', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('pro'))
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ is_error: false, result: 'READY and available' }),
        stderr: '',
      });

    await expect(detectAgent('claude')).resolves.toMatchObject({
      loggedIn: true,
      available: false,
      errorCode: 'bad_json',
    });
  });

  it('recognizes an explicitly free or inactive auth status without claiming readiness', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('free'));

    const status = await detectAgent('claude');

    expect(status).toMatchObject({
      installed: true,
      loggedIn: true,
      available: false,
      errorCode: 'subscription_inactive',
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('recognizes a subscription that expired while OAuth credentials remain logged in', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('pro'))
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Your Claude subscription has expired. Renew your subscription to continue.',
      });

    const status = await detectAgent('claude');

    expect(status).toMatchObject({
      installed: true,
      loggedIn: true,
      available: false,
      errorCode: 'subscription_inactive',
    });
    expect(status.detail).toContain('구독');
  });

  it('distinguishes a temporary usage limit from a lapsed subscription', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('max'))
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: '5-hour usage limit reached' });

    const status = await detectAgent('claude');

    expect(status).toMatchObject({
      loggedIn: true,
      available: false,
      errorCode: 'rate_limited',
    });
  });

  it('redacts proxy credentials from renderer-facing entitlement detail', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('pro'))
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Proxy https://alice:s3cr3t@proxy.example failed unexpectedly',
      });

    const status = await detectAgent('claude');

    expect(status.detail).not.toContain('s3cr3t');
    expect(status.detail).toContain('[redacted]');
  });

  it('rejects apiKeyHelper and gateway auth sources before any billed probe can run', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
          apiKeySource: 'apiKeyHelper',
          subscriptionType: 'pro',
        }),
        stderr: '',
      });

    const helperStatus = await detectAgent('claude');
    expect(helperStatus).toMatchObject({
      available: false,
      errorCode: 'subscription_inactive',
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);

    clearAgentDetectionCache();
    spawnMock.mockReset();
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude_apps_gateway',
          apiProvider: 'gateway',
          subscriptionType: 'enterprise',
        }),
        stderr: '',
      });

    const gatewayStatus = await detectAgent('claude');
    expect(gatewayStatus).toMatchObject({
      available: false,
      errorCode: 'subscription_inactive',
    });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('accepts first-party Claude.ai subscription metadata managed by /login', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
          apiKeySource: '/login managed key',
          subscriptionType: 'pro',
        }),
        stderr: '',
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ is_error: false, result: 'READY' }),
        stderr: '',
      });

    const status = await detectAgent('claude');

    expect(status).toMatchObject({
      available: true,
      errorCode: undefined,
    });
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it('fails closed when an older Claude CLI cannot report structured auth provenance', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({ code: 0, stdout: 'Logged in', stderr: '' });

    const status = await detectAgent('claude');

    expect(status).toMatchObject({
      loggedIn: false,
      available: false,
      errorCode: 'subscription_inactive',
    });
    expect(status.detail).toContain('최신 Claude Code');
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('force-refreshes entitlement for generation instead of trusting a ready UI cache', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('pro'))
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ is_error: false, result: 'READY' }),
        stderr: '',
      });
    expect((await detectAgent('claude')).available).toBe(true);

    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce(authResult('pro'))
      .mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Your Claude subscription has expired.',
      });

    const refreshed = await detectAgent('claude', { forceRefresh: true });
    expect(refreshed).toMatchObject({
      available: false,
      errorCode: 'subscription_inactive',
    });
    expect(spawnMock).toHaveBeenCalledTimes(6);
  });
});

describe('detectAgent Codex subscription authentication', () => {
  it('extracts an ANSI-wrapped version from mixed output without forwarding surrounding logs', async () => {
    spawnMock
      .mockResolvedValueOnce({
        code: 0,
        stdout: '[IPC] handlers registered\n\u001b[32mcodex-cli 0.141.0\u001b[0m',
        stderr: 'https://auth.openai.com/oauth/authorize?token=secret',
      })
      .mockResolvedValueOnce({ code: 0, stdout: 'Logged in using ChatGPT', stderr: '' });

    const status = await detectAgent('codex');

    expect(status.version).toBe('Codex CLI 0.141.0');
    expect(JSON.stringify(status)).not.toContain('handlers registered');
    expect(JSON.stringify(status)).not.toContain('oauth/authorize');
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  beforeEach(() => {
    spawnMock.mockReset();
    clearAgentDetectionCache();
    process.env.OPENAI_API_KEY = 'must-not-reach-codex-agent';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('accepts only explicit ChatGPT subscription login', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({ code: 0, stdout: 'Logged in using ChatGPT', stderr: '' });

    const status = await detectAgent('codex');

    expect(status).toMatchObject({
      loggedIn: true,
      available: true,
      availabilityCheck: 'authentication',
    });
    expect(spawnMock.mock.calls[1][0].env.OPENAI_API_KEY).toBeUndefined();
  });

  it('checks both status streams and gives explicit logout text precedence', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({
        code: 0,
        stdout: 'Update warning',
        stderr: 'Logged in using ChatGPT',
      });

    await expect(detectAgent('codex')).resolves.toMatchObject({
      loggedIn: true,
      available: true,
    });

    clearAgentDetectionCache('codex');
    spawnMock.mockReset();
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({
        code: 0,
        stdout: 'Not logged in using ChatGPT',
        stderr: 'Logged in using ChatGPT',
      });

    await expect(detectAgent('codex')).resolves.toMatchObject({
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
  });

  it('fails closed when Codex is authenticated with an API key', async () => {
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({ code: 0, stdout: 'Logged in using API key', stderr: '' });

    const status = await detectAgent('codex');

    expect(status).toMatchObject({
      loggedIn: true,
      available: false,
      errorCode: 'subscription_inactive',
    });
  });

  it('does not let an older in-flight detection overwrite a newer verified cache entry', async () => {
    const staleAuth = deferred<{ code: number; stdout: string; stderr: string }>();
    spawnMock
      .mockResolvedValueOnce(versionResult())
      .mockReturnValueOnce(staleAuth.promise)
      .mockResolvedValueOnce(versionResult())
      .mockResolvedValueOnce({ code: 0, stdout: 'Logged in using ChatGPT', stderr: '' });

    const staleDetection = detectAgent('codex', { forceRefresh: true });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));

    clearAgentDetectionCache('codex');
    const verified = await detectAgent('codex', { forceRefresh: true });
    expect(verified).toMatchObject({ loggedIn: true, available: true });

    staleAuth.resolve({ code: 1, stdout: '', stderr: 'Not logged in' });
    await expect(staleDetection).resolves.toMatchObject({ loggedIn: false, available: false });

    const cached = await detectAgent('codex');
    expect(cached).toMatchObject({ loggedIn: true, available: true });
    expect(spawnMock).toHaveBeenCalledTimes(4);
  });
});
