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
  it('treats provider_disabled as stable policy guidance without install or login retry actions', async () => {
    const alert = setWindow({
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        status: {
          installed: false,
          loggedIn: false,
          available: false,
          errorCode: 'provider_disabled',
          detail: '배포 앱에서는 Claude 구독 로그인을 지원하지 않습니다. Claude API 키를 사용해주세요.',
        },
      }),
    });

    await expect(ensureAgentEngineReady('agent-claude')).resolves.toBe(false);
    const message = String(alert.mock.calls[0][0]);
    expect(message).toContain('Claude API 키');
    expect(message).not.toContain('CLI를 설치');
    expect(message).not.toContain('로그인 또는 계정 전환');
    expect(message).not.toContain('다시 시도');
  });

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

  it.each([
    ['agent-codex', 'Codex', 'Claude'],
    ['agent-claude', 'Claude', 'Codex'],
  ] as const)('uses provider-specific inactive-subscription guidance for %s', async (
    generator,
    expectedProvider,
    otherProvider,
  ) => {
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

    await expect(ensureAgentEngineReady(generator)).resolves.toBe(false);
    const message = String(alert.mock.calls[0][0]);
    expect(message).toContain(expectedProvider);
    expect(message).not.toContain(`${otherProvider} 구독을 갱신`);
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
