import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => {
  const state = { exposed: new Map<string, any>(), invoke: vi.fn() };
  const bridge = () => ({
    contextBridge: { exposeInMainWorld: (key: string, value: unknown) => state.exposed.set(key, value) },
    ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), invoke: (...a: unknown[]) => state.invoke(...a), send: vi.fn() },
  });
  return { ...state, bridge };
});
vi.mock('electron', () => holder.bridge());
vi.mock('./mocks/electron', () => holder.bridge());

import { AGENT_ACCOUNT_CHANNELS } from '../main/ipc/agentAccountHandlers';

const loadApi = async () => {
  holder.exposed.clear();
  vi.resetModules();
  await import('../preload');
  return holder.exposed.get('api');
};

beforeEach(() => holder.invoke.mockReset());

describe('preload exposes the saved-account channels (a missing one dies silently)', () => {
  it('forwards each account call to its channel with the provider and account id', async () => {
    const api = await loadApi();
    await api.agentAccountList('codex');
    await api.agentAccountCreate('claude');
    await api.agentAccountSwitch('codex', 'acct-0123456789ab');
    await api.agentAccountRemove('claude', 'acct-0123456789ab');
    expect(holder.invoke.mock.calls).toEqual([
      ['agent-account:list', 'codex'],
      ['agent-account:create', 'claude'],
      ['agent-account:switch', 'codex', 'acct-0123456789ab'],
      ['agent-account:remove', 'claude', 'acct-0123456789ab'],
    ]);
  });

  it('keeps every handler channel reachable from the renderer bridge', () => {
    const source = readFileSync(resolve(__dirname, '..', 'preload.ts'), 'utf8');
    for (const channel of AGENT_ACCOUNT_CHANNELS) expect(source).toContain(`'${channel}'`);
  });

  it('lets a login target a saved account and leaves the plain call untouched', async () => {
    const api = await loadApi();
    await api.agentLogin('codex');
    await api.agentLogin('codex', { accountId: 'acct-0123456789ab' });
    expect(holder.invoke.mock.calls).toEqual([
      ['agent:login', 'codex'],
      ['agent:login', 'codex', { accountId: 'acct-0123456789ab' }],
    ]);
  });
});
