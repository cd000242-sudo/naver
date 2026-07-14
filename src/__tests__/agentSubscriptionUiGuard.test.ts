import { afterEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('../renderer/utils/uiManagers', () => ({
  toastManager: { error: toastError },
}));

import { ensureAgentEngineReady } from '../renderer/utils/agentModeGuard';

function setWindow(api: Record<string, unknown>, alert = vi.fn()): ReturnType<typeof vi.fn> {
  vi.stubGlobal('window', { api, alert });
  return alert;
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastError.mockReset();
});

describe('Claude subscription UI guard', () => {
  it('allows a Claude agent only when live availability is explicitly true', async () => {
    const agentStatus = vi.fn().mockResolvedValue({
      success: true,
      status: { installed: true, loggedIn: true, available: true },
    });
    setWindow({
      agentStatus,
    });

    await expect(ensureAgentEngineReady('agent-claude')).resolves.toBe(true);
    expect(agentStatus).toHaveBeenCalledWith('claude', { forceRefresh: true });
  });

  it('blocks an inactive subscription and explains renewal', async () => {
    const alert = setWindow({
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        status: {
          installed: true,
          loggedIn: true,
          available: false,
          errorCode: 'subscription_inactive',
        },
      }),
    });

    await expect(ensureAgentEngineReady('agent-claude')).resolves.toBe(false);
    expect(alert.mock.calls[0][0]).toContain('구독 기간이 만료');
  });

  it('fails closed when the status bridge is missing or the status request throws', async () => {
    const missingAlert = setWindow({});
    await expect(ensureAgentEngineReady('agent-claude')).resolves.toBe(false);
    expect(missingAlert).toHaveBeenCalledOnce();

    const thrownAlert = setWindow({
      agentStatus: vi.fn().mockRejectedValue(new Error('bridge failure')),
    });
    await expect(ensureAgentEngineReady('agent-claude')).resolves.toBe(false);
    expect(thrownAlert).toHaveBeenCalledOnce();
  });
});
