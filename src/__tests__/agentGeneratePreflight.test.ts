import { beforeEach, describe, expect, it, vi } from 'vitest';

const detectMock = vi.hoisted(() => vi.fn());
const claudeRunMock = vi.hoisted(() => vi.fn());
const codexRunMock = vi.hoisted(() => vi.fn());

vi.mock('../agentCli/detect', () => ({
  detectAgent: (...args: unknown[]) => detectMock(...args),
  clearAgentDetectionCache: vi.fn(),
}));
vi.mock('../agentCli/claudeRunner', () => ({
  runClaude: (...args: unknown[]) => claudeRunMock(...args),
}));
vi.mock('../agentCli/codexRunner', () => ({
  runCodex: (...args: unknown[]) => codexRunMock(...args),
}));

import { generateWithAgent } from '../agentCli';
import { createAgentProductPolicyContext } from '../agentCli/productPolicy';

describe('generateWithAgent readiness preflight', () => {
  beforeEach(() => {
    detectMock.mockReset();
    claudeRunMock.mockReset();
    codexRunMock.mockReset();
  });

  it('runs Claude Code at the final CLI boundary without a development-only context', async () => {
    detectMock.mockResolvedValue({
      provider: 'claude',
      installed: true,
      loggedIn: true,
      available: true,
    });
    claudeRunMock.mockResolvedValue('완성된 글');

    await expect(generateWithAgent({ provider: 'claude', prompt: '글을 작성해줘' }))
      .resolves.toMatchObject({ provider: 'claude', text: '완성된 글' });

    expect(detectMock).toHaveBeenCalledWith('claude', { forceRefresh: true });
    expect(claudeRunMock).toHaveBeenCalledOnce();
  });

  it('blocks every Claude generation entry point when the subscription is inactive', async () => {
    detectMock.mockResolvedValue({
      provider: 'claude',
      installed: true,
      loggedIn: true,
      available: false,
      errorCode: 'subscription_inactive',
      detail: 'Claude 구독 기간이 만료되었습니다.',
    });

    const developmentContext = createAgentProductPolicyContext({ allowClaudeSubscription: true });
    await expect(generateWithAgent(
      { provider: 'claude', prompt: '글을 작성해줘' },
      developmentContext,
    ))
      .rejects.toMatchObject({ code: 'subscription_inactive', provider: 'claude' });
    expect(detectMock).toHaveBeenCalledWith('claude', { forceRefresh: true });
    expect(claudeRunMock).not.toHaveBeenCalled();
  });

  it('runs Claude only after the entitlement preflight reports ready', async () => {
    detectMock.mockResolvedValue({
      provider: 'claude',
      installed: true,
      loggedIn: true,
      available: true,
    });
    claudeRunMock.mockResolvedValue('완성된 글');

    const developmentContext = createAgentProductPolicyContext({ allowClaudeSubscription: true });
    const result = await generateWithAgent(
      { provider: 'claude', prompt: '글을 작성해줘' },
      developmentContext,
    );

    expect(result.text).toBe('완성된 글');
    expect(claudeRunMock).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'an external API-key login',
      {
        provider: 'codex',
        installed: true,
        loggedIn: true,
        available: false,
        errorCode: 'subscription_inactive',
        detail: 'Codex is using a non-ChatGPT billing route.',
      },
      'subscription_inactive',
    ],
    [
      'an external logout',
      {
        provider: 'codex',
        installed: true,
        loggedIn: false,
        available: false,
        errorCode: 'not_logged_in',
      },
      'not_logged_in',
    ],
  ] as const)(
    'force-refreshes a cached ChatGPT status before generation after %s',
    async (_transition, refreshedStatus, expectedCode) => {
      const cachedChatGptStatus = {
        provider: 'codex',
        installed: true,
        loggedIn: true,
        available: true,
        availabilityCheck: 'authentication',
      } as const;
      detectMock.mockImplementation((
        _provider: string,
        options?: { forceRefresh?: boolean },
      ) => Promise.resolve(options?.forceRefresh ? refreshedStatus : cachedChatGptStatus));
      codexRunMock.mockResolvedValue('must not run');

      await expect(generateWithAgent({ provider: 'codex', prompt: 'write a post' }))
        .rejects.toMatchObject({ code: expectedCode, provider: 'codex' });

      expect(detectMock).toHaveBeenCalledWith('codex', { forceRefresh: true });
      expect(codexRunMock).not.toHaveBeenCalled();
    },
  );
});
