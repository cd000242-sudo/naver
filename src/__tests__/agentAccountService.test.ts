import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ root: '', spawn: vi.fn(), clear: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('./mocks/electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('../agentCli/spawnHelper', () => ({ spawnCollect: (...a: unknown[]) => holder.spawn(...a), startSpawnSession: vi.fn() }));
vi.mock('../agentCli/detect', () => ({ clearAgentDetectionCache: (...a: unknown[]) => holder.clear(...a), detectAgent: vi.fn() }));

import { getAgentAccountDir, getActiveAgentAccountId, resetAgentAccountRegistryCache } from '../agentCli/accounts/accountRegistry';
import {
  createAgentAccount,
  invalidateAgentIdentityCache,
  listAgentAccounts,
  removeAgentAccount,
  switchAgentAccount,
} from '../agentCli/accounts/accountService';
import { recordAgentCall } from '../agentCli/usageTracker';

function jwt(payload: Record<string, unknown>): string {
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(payload)}.sig`;
}
function writeCodexLogin(dir: string, email: string, plan: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'auth.json'), JSON.stringify({
    tokens: { id_token: jwt({ email, 'https://api.openai.com/auth': { chatgpt_plan_type: plan } }), access_token: 'TOP-SECRET-ACCESS' },
  }));
}

const savedEnv = { ...process.env };
beforeEach(() => {
  holder.root = mkdtempSync(join(tmpdir(), 'bln-acct-svc-'));
  holder.spawn.mockReset();
  holder.clear.mockReset();
  resetAgentAccountRegistryCache();
  invalidateAgentIdentityCache();
  process.env.CODEX_HOME = join(holder.root, 'default-codex-home');
});
afterEach(() => {
  process.env = { ...savedEnv };
  resetAgentAccountRegistryCache();
  rmSync(holder.root, { recursive: true, force: true });
});

describe('agent account service', () => {
  it('lists the default and saved Codex accounts with email, plan and this app\'s own usage', async () => {
    writeCodexLogin(process.env.CODEX_HOME as string, 'main@example.com', 'plus');
    const saved = createAgentAccount('codex');
    writeCodexLogin(getAgentAccountDir('codex', saved.id), 'work@example.com', 'pro');
    recordAgentCall('codex');

    const listing = await listAgentAccounts('codex');
    expect(listing.separable).toBe(true);
    expect(listing.accounts.map((a) => [a.id, a.active, a.email, a.plan])).toEqual([
      ['default', true, 'main@example.com', 'Plus'],
      [saved.id, false, 'work@example.com', 'Pro'],
    ]);
    expect(listing.accounts[0].usage.callsInWindow).toBe(1);
    expect(listing.accounts[1].usage.callsInWindow).toBe(0);
    expect(JSON.stringify(listing)).not.toContain('TOP-SECRET-ACCESS');
  });

  it('shows a logged-out default and an unreadable account as such instead of guessing', async () => {
    const saved = createAgentAccount('codex');
    mkdirSync(getAgentAccountDir('codex', saved.id), { recursive: true });
    writeFileSync(join(getAgentAccountDir('codex', saved.id), 'auth.json'), '{broken');
    const listing = await listAgentAccounts('codex');
    expect(listing.accounts[0]).toMatchObject({ id: 'default', state: 'not_logged_in' });
    expect(listing.accounts[1]).toMatchObject({ id: saved.id, state: 'unknown' });
    expect(listing.accounts[1].email).toBeUndefined();
  });

  it('reads Claude accounts through the CLI status of each account', async () => {
    createAgentAccount('claude');
    holder.spawn.mockResolvedValue({ code: 0, stderr: '', stdout: JSON.stringify({ loggedIn: true, email: 'c@example.com', subscriptionType: 'max', planTier: 'max_5x' }) });
    const listing = await listAgentAccounts('claude');
    expect(listing.accounts.map((a) => a.email)).toEqual(['c@example.com', 'c@example.com']);
    expect(listing.accounts[0].plan).toBe('Max 5x');
    expect(holder.spawn).toHaveBeenCalledTimes(2);
    expect(holder.spawn.mock.calls[1][0].env.CLAUDE_CONFIG_DIR).toContain('agent-profiles');
  });

  it('reports Antigravity as a single-login provider', async () => {
    const listing = await listAgentAccounts('gemini');
    expect(listing.separable).toBe(false);
    expect(listing.accounts).toHaveLength(1);
    expect(listing.accounts[0]).toMatchObject({ id: 'default', isDefault: true, active: true });
  });

  it('switches the active account, drops cached detection, and never switches on its own', async () => {
    const saved = createAgentAccount('codex');
    expect(getActiveAgentAccountId('codex')).toBe('default');
    switchAgentAccount('codex', saved.id);
    expect(getActiveAgentAccountId('codex')).toBe(saved.id);
    expect(holder.clear).toHaveBeenCalledWith('codex');
    expect(() => switchAgentAccount('codex', 'acct-ffffffffffff')).toThrow();
    expect(getActiveAgentAccountId('codex')).toBe(saved.id);
    expect(() => switchAgentAccount('gemini', saved.id)).toThrow();
  });

  it('removes a saved account and reports when the active one went back to default', () => {
    const saved = createAgentAccount('claude');
    switchAgentAccount('claude', saved.id);
    expect(removeAgentAccount('claude', saved.id)).toEqual({ removedActive: true });
    expect(getActiveAgentAccountId('claude')).toBe('default');
    expect(holder.clear).toHaveBeenCalledWith('claude');
    expect(() => removeAgentAccount('claude', 'default')).toThrow();
  });
});
