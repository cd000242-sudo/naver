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

describe('generateWithAgent readiness preflight', () => {
  beforeEach(() => {
    detectMock.mockReset();
    claudeRunMock.mockReset();
    codexRunMock.mockReset();
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

    await expect(generateWithAgent({ provider: 'claude', prompt: '글을 작성해줘' }))
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

    const result = await generateWithAgent({ provider: 'claude', prompt: '글을 작성해줘' });

    expect(result.text).toBe('완성된 글');
    expect(claudeRunMock).toHaveBeenCalledOnce();
  });
});
