import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => holder.root } }));
vi.mock('./mocks/electron', () => ({ app: { getPath: () => holder.root } }));

import {
  createAgentAccountRecord,
  resetAgentAccountRegistryCache,
  setActiveAgentAccount,
} from '../agentCli/accounts/accountRegistry';
import { getAgentUsageWindow, recordAgentCall, recordAgentRateLimit } from '../agentCli/usageTracker';

beforeEach(() => {
  holder.root = mkdtempSync(join(tmpdir(), 'bln-acct-usage-'));
  resetAgentAccountRegistryCache();
});
afterEach(() => {
  resetAgentAccountRegistryCache();
  rmSync(holder.root, { recursive: true, force: true });
});

describe('agent usage is kept per saved account', () => {
  it('counts the default account exactly as before', () => {
    recordAgentCall('codex');
    recordAgentCall('codex');
    expect(getAgentUsageWindow('codex').callsInWindow).toBe(2);
    const stored = JSON.parse(readFileSync(join(holder.root, 'agent-usage.json'), 'utf8'));
    expect(Object.keys(stored)).toEqual(['codex']);
  });

  it('keeps a saved account separate from the default one', () => {
    const account = createAgentAccountRecord('codex');
    recordAgentCall('codex');
    setActiveAgentAccount('codex', account.id);
    expect(getAgentUsageWindow('codex').callsInWindow).toBe(0);
    recordAgentCall('codex');
    recordAgentCall('codex');
    recordAgentCall('codex');
    expect(getAgentUsageWindow('codex').callsInWindow).toBe(3);
    expect(getAgentUsageWindow('codex', Date.now(), 'default').callsInWindow).toBe(1);
    expect(getAgentUsageWindow('codex', Date.now(), account.id).callsInWindow).toBe(3);
    setActiveAgentAccount('codex', 'default');
    expect(getAgentUsageWindow('codex').callsInWindow).toBe(1);
  });

  it('does not let one account rate limit mark another account as limited', () => {
    const account = createAgentAccountRecord('claude');
    setActiveAgentAccount('claude', account.id);
    recordAgentRateLimit('claude', 'limit reached, try again in 2 hours');
    expect(getAgentUsageWindow('claude').rateLimitedAt).toBeTypeOf('number');
    expect(getAgentUsageWindow('claude', Date.now(), 'default').rateLimitedAt).toBeUndefined();
  });

  it('never stores an account id outside the generated pattern in the usage file', () => {
    const account = createAgentAccountRecord('codex');
    setActiveAgentAccount('codex', account.id);
    recordAgentCall('codex');
    const keys = Object.keys(JSON.parse(readFileSync(join(holder.root, 'agent-usage.json'), 'utf8')));
    expect(keys).toEqual([`codex:${account.id}`]);
  });
});
