import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
const startSessionMock = vi.fn();
const detectAgentMock = vi.fn();
const clearAgentDetectionCacheMock = vi.fn();

vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
  startSpawnSession: (...args: unknown[]) => startSessionMock(...args),
}));

vi.mock('../agentCli/detect', () => ({
  clearAgentDetectionCache: (...args: unknown[]) => clearAgentDetectionCacheMock(...args),
  detectAgent: (...args: unknown[]) => detectAgentMock(...args),
}));

import { loginAgent } from '../agentCli/installer';

describe('loginAgent status verification', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    startSessionMock.mockReset();
    detectAgentMock.mockReset();
    clearAgentDetectionCacheMock.mockReset();
    spawnMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    startSessionMock.mockImplementation((options) => ({
      result: Promise.resolve(spawnMock(options)),
      writeLine: vi.fn().mockResolvedValue('accepted'),
      closeInput: vi.fn(),
      cancel: vi.fn(),
    }));
    detectAgentMock.mockResolvedValue({
      provider: 'codex',
      installed: true,
      loggedIn: false,
      available: false,
      errorCode: 'not_logged_in',
    });
  });

  it('rejects when the login command exits zero but the account is still logged out', async () => {
    await expect(loginAgent('codex')).rejects.toMatchObject({
      name: 'AgentCliError',
      code: 'not_logged_in',
      provider: 'codex',
    });

    expect(clearAgentDetectionCacheMock).toHaveBeenCalledWith('codex');
    expect(detectAgentMock).toHaveBeenCalledWith('codex', { forceRefresh: true });
  });
});
