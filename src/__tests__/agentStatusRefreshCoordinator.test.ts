import { describe, expect, it } from 'vitest';

import { createAgentStatusRefreshCoordinator } from '../renderer/utils/agentStatusRefreshCoordinator';

describe('agent status refresh coordinator', () => {
  it('rejects an older refresh after a newer refresh starts', () => {
    const coordinator = createAgentStatusRefreshCoordinator();

    const stale = coordinator.beginRefresh('codex');
    const current = coordinator.beginRefresh('codex');

    expect(stale).toBeDefined();
    expect(current).toBeDefined();
    expect(coordinator.canApply(stale!)).toBe(false);
    expect(coordinator.canApply(current!)).toBe(true);
  });

  it.each(['codex', 'claude'] as const)(
    'blocks %s status writes while login is active and accepts only the post-login refresh',
    (provider) => {
      const coordinator = createAgentStatusRefreshCoordinator();
      const beforeLogin = coordinator.beginRefresh(provider);
      const login = coordinator.beginAction(provider);

      expect(beforeLogin).toBeDefined();
      expect(coordinator.canApply(beforeLogin!)).toBe(false);
      expect(coordinator.beginRefresh(provider)).toBeUndefined();

      expect(coordinator.endAction(login)).toBe(true);
      const verified = coordinator.beginRefresh(provider);

      expect(verified).toBeDefined();
      expect(coordinator.canApply(verified!)).toBe(true);
    },
  );

  it('does not let an older action finish a newer action', () => {
    const coordinator = createAgentStatusRefreshCoordinator();
    const staleAction = coordinator.beginAction('codex');
    const currentAction = coordinator.beginAction('codex');

    expect(coordinator.endAction(staleAction)).toBe(false);
    expect(coordinator.beginRefresh('codex')).toBeUndefined();
    expect(coordinator.endAction(currentAction)).toBe(true);
    expect(coordinator.beginRefresh('codex')).toBeDefined();
  });
});
