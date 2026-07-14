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
      errorCode: undefined,
    });
    expect(spawnMock).toHaveBeenCalledTimes(3);
    const entitlementCall = spawnMock.mock.calls[2][0];
    expect(entitlementCall.args).toContain('--max-turns');
    expect(entitlementCall.env.ANTHROPIC_API_KEY).toBeUndefined();
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

    expect(status).toMatchObject({ loggedIn: true, available: true });
    expect(spawnMock.mock.calls[1][0].env.OPENAI_API_KEY).toBeUndefined();
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
});
