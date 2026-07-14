import { describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { runClaude } from '../agentCli/claudeRunner';

describe('runClaude subscription isolation', () => {
  it('disables user settings, tools, MCP, and billed environment credentials', async () => {
    process.env.ANTHROPIC_API_KEY = 'paid-key';
    spawnMock.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ is_error: false, result: '완성된 글' }),
      stderr: '',
    });

    try {
      await expect(runClaude('글을 작성해줘')).resolves.toBe('완성된 글');
      const call = spawnMock.mock.calls[0][0];
      expect(call.args).toEqual(expect.arrayContaining([
        '--safe-mode',
        '--setting-sources', 'local',
        '--disallowedTools', '*',
        '--strict-mcp-config',
      ]));
      expect(call.env.ANTHROPIC_API_KEY).toBeUndefined();
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
