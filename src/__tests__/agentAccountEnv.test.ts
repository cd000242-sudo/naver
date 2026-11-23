import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('./mocks/electron', () => ({ app: { getPath: () => holder.root } }));

import {
  createAgentAccountRecord,
  getAgentAccountDir,
  resetAgentAccountRegistryCache,
  setActiveAgentAccount,
} from '../agentCli/accounts/accountRegistry';
import {
  buildClaudeSubscriptionEnv,
  buildCodexSubscriptionEnv,
  buildGeminiSubscriptionEnv,
} from '../agentCli/subscriptionEnv';

const SOURCE = {
  PATH: 'C:\\tools',
  TEMP: 'C:\\temp',
  USERPROFILE: 'C:\\Users\\tester',
  OPENAI_API_KEY: 'must-not-leak',
  ANTHROPIC_API_KEY: 'must-not-leak',
  CODEX_HOME: 'C:\\user-chosen\\codex',
  CLAUDE_CONFIG_DIR: 'C:\\user-chosen\\claude',
};

beforeEach(() => {
  holder.root = mkdtempSync(join(tmpdir(), 'bln-acct-env-'));
  resetAgentAccountRegistryCache();
});
afterEach(() => {
  resetAgentAccountRegistryCache();
  rmSync(holder.root, { recursive: true, force: true });
});

describe('agent account environment injection', () => {
  it('leaves the default account exactly as before, including a user-chosen home', () => {
    expect(buildCodexSubscriptionEnv(SOURCE).CODEX_HOME).toBe('C:\\user-chosen\\codex');
    expect(buildClaudeSubscriptionEnv(SOURCE).CLAUDE_CONFIG_DIR).toBe('C:\\user-chosen\\claude');
  });

  it('points Codex at the chosen account folder once it is active', () => {
    const account = createAgentAccountRecord('codex');
    setActiveAgentAccount('codex', account.id);
    const env = buildCodexSubscriptionEnv(SOURCE);
    expect(env.CODEX_HOME).toBe(getAgentAccountDir('codex', account.id));
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('points Claude Code at the chosen account folder and keeps the providers independent', () => {
    const account = createAgentAccountRecord('claude');
    setActiveAgentAccount('claude', account.id);
    expect(buildClaudeSubscriptionEnv(SOURCE).CLAUDE_CONFIG_DIR).toBe(getAgentAccountDir('claude', account.id));
    expect(buildCodexSubscriptionEnv(SOURCE).CODEX_HOME).toBe('C:\\user-chosen\\codex');
  });

  it('follows a switch immediately and returns to the default when asked', () => {
    const a = createAgentAccountRecord('codex');
    const b = createAgentAccountRecord('codex');
    setActiveAgentAccount('codex', a.id);
    expect(buildCodexSubscriptionEnv(SOURCE).CODEX_HOME).toContain(a.id);
    setActiveAgentAccount('codex', b.id);
    expect(buildCodexSubscriptionEnv(SOURCE).CODEX_HOME).toContain(b.id);
    setActiveAgentAccount('codex', 'default');
    expect(buildCodexSubscriptionEnv(SOURCE).CODEX_HOME).toBe('C:\\user-chosen\\codex');
  });

  it('lets a login target a not-yet-active account without changing the active one', () => {
    const account = createAgentAccountRecord('codex');
    const loginEnv = buildCodexSubscriptionEnv(SOURCE, account.id);
    expect(loginEnv.CODEX_HOME).toBe(getAgentAccountDir('codex', account.id));
    expect(buildCodexSubscriptionEnv(SOURCE).CODEX_HOME).toBe('C:\\user-chosen\\codex');
  });

  it('can address the default account explicitly even while another one is active', () => {
    const account = createAgentAccountRecord('claude');
    setActiveAgentAccount('claude', account.id);
    expect(buildClaudeSubscriptionEnv(SOURCE, 'default').CLAUDE_CONFIG_DIR).toBe('C:\\user-chosen\\claude');
  });

  it('refuses an unknown explicit account instead of quietly using another one', () => {
    expect(() => buildCodexSubscriptionEnv(SOURCE, 'acct-aaaaaaaaaaaa')).toThrow();
    expect(() => buildClaudeSubscriptionEnv(SOURCE, '../escape')).toThrow();
  });

  it('never hands Antigravity an account folder variable', () => {
    const account = createAgentAccountRecord('codex');
    setActiveAgentAccount('codex', account.id);
    const env = buildGeminiSubscriptionEnv(SOURCE);
    expect(env).not.toHaveProperty('CODEX_HOME');
    expect(env).not.toHaveProperty('CLAUDE_CONFIG_DIR');
  });
});
