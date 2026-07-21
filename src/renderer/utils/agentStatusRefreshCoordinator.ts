export type AgentStatusProvider = 'codex' | 'claude' | 'gemini';

export interface AgentStatusLease {
  readonly provider: AgentStatusProvider;
  readonly version: number;
}

interface ProviderRefreshState {
  readonly version: number;
  readonly activeActionVersion?: number;
}

export interface AgentStatusRefreshCoordinator {
  beginRefresh(provider: AgentStatusProvider): AgentStatusLease | undefined;
  canApply(lease: AgentStatusLease): boolean;
  beginAction(provider: AgentStatusProvider): AgentStatusLease;
  endAction(lease: AgentStatusLease): boolean;
}

const INITIAL_PROVIDER_STATE: ProviderRefreshState = Object.freeze({ version: 0 });

function freezeLease(provider: AgentStatusProvider, version: number): AgentStatusLease {
  return Object.freeze({ provider, version });
}

/**
 * Coordinates asynchronous login/status work per provider.
 *
 * A newer refresh invalidates older responses. While an install/login/logout action is
 * active, background refreshes are rejected so they cannot replace the progress state.
 */
export function createAgentStatusRefreshCoordinator(): AgentStatusRefreshCoordinator {
  let states: Readonly<Record<AgentStatusProvider, ProviderRefreshState>> = Object.freeze({
    codex: INITIAL_PROVIDER_STATE,
    claude: INITIAL_PROVIDER_STATE,
    gemini: INITIAL_PROVIDER_STATE,
  });

  const replaceState = (provider: AgentStatusProvider, next: ProviderRefreshState): void => {
    states = Object.freeze({ ...states, [provider]: Object.freeze(next) });
  };

  return Object.freeze({
    beginRefresh(provider: AgentStatusProvider): AgentStatusLease | undefined {
      const current = states[provider];
      if (current.activeActionVersion !== undefined) return undefined;

      const version = current.version + 1;
      replaceState(provider, { version });
      return freezeLease(provider, version);
    },

    canApply(lease: AgentStatusLease): boolean {
      const current = states[lease.provider];
      return current.activeActionVersion === undefined && current.version === lease.version;
    },

    beginAction(provider: AgentStatusProvider): AgentStatusLease {
      const version = states[provider].version + 1;
      replaceState(provider, { version, activeActionVersion: version });
      return freezeLease(provider, version);
    },

    endAction(lease: AgentStatusLease): boolean {
      const current = states[lease.provider];
      if (current.activeActionVersion !== lease.version) return false;

      replaceState(lease.provider, { version: current.version + 1 });
      return true;
    },
  });
}
