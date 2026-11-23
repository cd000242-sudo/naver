// src/main/ipc/agentAccountHandlers.ts
// Saved-account IPC for the subscription agents (list / create / switch / remove).
// Logging in to a saved account reuses the existing `agent:login` channel with an accountId.
//
// Every channel is registered in preload.ts too: a channel missing there fails silently.
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { sanitizeUserVisibleError } from '../../runtime/userVisibleError.js';
import { requireAgentProvider } from '../../agentCli/validation.js';
import { DEFAULT_ACCOUNT_ID, isValidAgentAccountId } from '../../agentCli/accounts/accountRegistry.js';
import type { AgentProvider } from '../../agentCli/types.js';

export const AGENT_ACCOUNT_CHANNELS = [
  'agent-account:list',
  'agent-account:create',
  'agent-account:switch',
  'agent-account:remove',
] as const;

export interface AgentAccountHandlerDeps {
  readonly assertTrustedSender: (event: IpcMainInvokeEvent) => void;
  /** Same per-provider lock as login/logout, so an account never changes under a running login. */
  readonly runExclusive: <T>(provider: AgentProvider, operation: () => Promise<T>) => Promise<T>;
  readonly assertProviderAllowed: (provider: AgentProvider) => void;
}

function requireAccountId(value: unknown): string {
  if (value === DEFAULT_ACCOUNT_ID || isValidAgentAccountId(value)) return value as string;
  throw Object.assign(new Error('계정 정보가 올바르지 않습니다.'), { code: 'invalid_input' });
}

function failure(error: unknown, fallback: string): { success: false; code?: string; message: string } {
  const e = error as { code?: string; message?: string } | undefined;
  return {
    success: false,
    ...(e?.code ? { code: e.code } : {}),
    message: e?.message ? sanitizeUserVisibleError(e.message) : fallback,
  };
}

export function registerAgentAccountHandlers(deps: AgentAccountHandlerDeps): void {
  // One guard for every channel: trusted sender, known provider, product policy, safe error text.
  const guarded = (
    fallback: string,
    run: (provider: AgentProvider, args: readonly unknown[]) => Promise<Record<string, unknown>>,
  ) => async (event: IpcMainInvokeEvent, provider: unknown, ...args: unknown[]) => {
    try {
      deps.assertTrustedSender(event);
      const validated = requireAgentProvider(provider);
      deps.assertProviderAllowed(validated);
      return { success: true, ...(await run(validated, args)) };
    } catch (error) {
      return failure(error, fallback);
    }
  };

  // Literal channel names on purpose: scripts/lint-ipc.mjs finds registrations by that exact form.
  ipcMain.handle('agent-account:list', guarded('계정 목록을 불러오지 못했습니다.', async (provider) => {
    const { listAgentAccounts } = await import('../../agentCli/accounts/accountService.js');
    return { listing: await listAgentAccounts(provider) };
  }));

  ipcMain.handle('agent-account:create', guarded('계정 칸을 만들지 못했습니다.', async (provider) => {
    const { createAgentAccount } = await import('../../agentCli/accounts/accountService.js');
    return { accountId: createAgentAccount(provider).id };
  }));

  ipcMain.handle('agent-account:switch', guarded('계정을 바꾸지 못했습니다.', async (provider, [accountId]) => {
    const target = requireAccountId(accountId);
    const { switchAgentAccount } = await import('../../agentCli/accounts/accountService.js');
    await deps.runExclusive(provider, async () => switchAgentAccount(provider, target));
    return {};
  }));

  ipcMain.handle('agent-account:remove', guarded('계정을 빼지 못했습니다.', async (provider, [accountId]) => {
    const target = requireAccountId(accountId);
    const { removeAgentAccount } = await import('../../agentCli/accounts/accountService.js');
    return deps.runExclusive(provider, async () => removeAgentAccount(provider, target));
  }));
}
