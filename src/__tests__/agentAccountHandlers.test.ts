import { beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  service: {
    listAgentAccounts: vi.fn(), createAgentAccount: vi.fn(), switchAgentAccount: vi.fn(), removeAgentAccount: vi.fn(),
  },
}));
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => holder.handlers.set(channel, fn) } }));
vi.mock('./mocks/electron', () => ({ ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => holder.handlers.set(channel, fn) } }));
vi.mock('../agentCli/accounts/accountService', () => holder.service);

import { AGENT_ACCOUNT_CHANNELS, registerAgentAccountHandlers } from '../main/ipc/agentAccountHandlers';

const event = { sender: { id: 1 } } as never;
let trusted = true;
const runExclusive = vi.fn(async (_provider: string, op: () => Promise<unknown>) => op());
const assertAllowed = vi.fn();

function call(channel: string, ...args: unknown[]): Promise<any> {
  return Promise.resolve(holder.handlers.get(channel)!(event, ...args));
}

beforeEach(() => {
  holder.handlers.clear();
  for (const fn of Object.values(holder.service)) fn.mockReset();
  runExclusive.mockClear();
  assertAllowed.mockReset();
  trusted = true;
  registerAgentAccountHandlers({
    assertTrustedSender: () => { if (!trusted) throw Object.assign(new Error('untrusted'), { code: 'untrusted_sender' }); },
    runExclusive,
    assertProviderAllowed: assertAllowed,
  });
});

describe('agent account IPC', () => {
  it('registers exactly the documented channels', () => {
    expect([...holder.handlers.keys()].sort()).toEqual([...AGENT_ACCOUNT_CHANNELS].sort());
    expect(AGENT_ACCOUNT_CHANNELS).toEqual(['agent-account:list', 'agent-account:create', 'agent-account:switch', 'agent-account:remove']);
  });

  it('blocks every channel for an untrusted sender before touching accounts', async () => {
    trusted = false;
    for (const channel of AGENT_ACCOUNT_CHANNELS) {
      expect(await call(channel, 'codex', 'acct-0123456789ab')).toMatchObject({ success: false, code: 'untrusted_sender' });
    }
    for (const fn of Object.values(holder.service)) expect(fn).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider and a malformed account id', async () => {
    expect(await call('agent-account:list', 'openai')).toMatchObject({ success: false });
    expect(await call('agent-account:switch', 'codex', '../x')).toMatchObject({ success: false });
    expect(await call('agent-account:remove', 'codex', 42)).toMatchObject({ success: false });
    expect(holder.service.switchAgentAccount).not.toHaveBeenCalled();
    expect(holder.service.removeAgentAccount).not.toHaveBeenCalled();
  });

  it('lists accounts and returns only what the service returned', async () => {
    holder.service.listAgentAccounts.mockResolvedValue({ provider: 'codex', separable: true, accounts: [] });
    expect(await call('agent-account:list', 'codex')).toEqual({ success: true, listing: { provider: 'codex', separable: true, accounts: [] } });
  });

  it('creates an account and answers with its id', async () => {
    holder.service.createAgentAccount.mockReturnValue({ id: 'acct-0123456789ab', createdAt: 1 });
    expect(await call('agent-account:create', 'claude')).toEqual({ success: true, accountId: 'acct-0123456789ab' });
  });

  it('switches and removes under the same lock the login flow uses', async () => {
    holder.service.removeAgentAccount.mockReturnValue({ removedActive: true });
    expect(await call('agent-account:switch', 'codex', 'acct-0123456789ab')).toEqual({ success: true });
    expect(await call('agent-account:switch', 'codex', 'default')).toEqual({ success: true });
    expect(await call('agent-account:remove', 'codex', 'acct-0123456789ab')).toEqual({ success: true, removedActive: true });
    expect(runExclusive).toHaveBeenCalledTimes(3);
    expect(holder.service.switchAgentAccount).toHaveBeenCalledWith('codex', 'acct-0123456789ab');
  });

  it('applies the product policy and hides internal paths in errors', async () => {
    assertAllowed.mockImplementation(() => { throw new Error('disabled'); });
    expect(await call('agent-account:list', 'claude')).toMatchObject({ success: false });
    assertAllowed.mockReset();
    holder.service.createAgentAccount.mockImplementation(() => { throw new Error('EPERM C:\\Users\\secret\\agent-profiles'); });
    const result = await call('agent-account:create', 'codex');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
