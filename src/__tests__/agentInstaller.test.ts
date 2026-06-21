/**
 * Agent CLI installer/login — unit tests.
 *
 * Live execution (npm i -g / OAuth login) has side effects, so the spawn layer is mocked and
 * we assert the EXACT command + args. This guards the verified package names and login commands
 * (npm i -g @openai/codex · @anthropic-ai/claude-code · codex login · claude auth login --claudeai).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawnMock = vi.fn();
vi.mock('../agentCli/spawnHelper', () => ({
  spawnCollect: (...args: unknown[]) => spawnMock(...args),
}));

import { installAgent, loginAgent, AGENT_NPM_PACKAGES } from '../agentCli/installer';

beforeEach(() => {
  spawnMock.mockReset();
  // Default: success with a version-like stdout (used by post-install detect()).
  spawnMock.mockResolvedValue({ code: 0, stdout: 'codex-cli 0.141.0', stderr: '' });
});

describe('AGENT_NPM_PACKAGES', () => {
  it('maps providers to verified npm package names', () => {
    expect(AGENT_NPM_PACKAGES.codex).toBe('@openai/codex');
    expect(AGENT_NPM_PACKAGES.claude).toBe('@anthropic-ai/claude-code');
  });
});

describe('installAgent', () => {
  it('runs `npm install -g <pkg>` and verifies the binary afterwards', async () => {
    const r = await installAgent('codex');
    const first = spawnMock.mock.calls[0][0];
    expect(first.command).toBe('npm');
    expect(first.args).toEqual(['install', '-g', '@openai/codex']);
    expect(r.version).toBeTruthy(); // detect() ran via the mocked spawn
  });

  it('uses the claude package for claude', async () => {
    await installAgent('claude');
    expect(spawnMock.mock.calls[0][0].args).toEqual(['install', '-g', '@anthropic-ai/claude-code']);
  });

  it('throws AgentCliError on npm failure', async () => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'EACCES: permission denied' });
    await expect(installAgent('claude')).rejects.toMatchObject({ name: 'AgentCliError' });
  });
});

describe('loginAgent', () => {
  it('codex → `codex login`', async () => {
    await loginAgent('codex');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('codex');
    expect(c.args).toEqual(['login']);
  });

  it('claude → `claude auth login --claudeai`', async () => {
    await loginAgent('claude');
    const c = spawnMock.mock.calls[0][0];
    expect(c.command).toBe('claude');
    expect(c.args).toEqual(['auth', 'login', '--claudeai']);
  });

  it('throws AgentCliError when login exits non-zero', async () => {
    spawnMock.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'login cancelled' });
    await expect(loginAgent('codex')).rejects.toMatchObject({ name: 'AgentCliError' });
  });
});
