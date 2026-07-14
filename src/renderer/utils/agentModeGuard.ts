// Preflight guard for subscription-backed agent mode.
// Fail closed: login artifacts alone are never accepted as current entitlement.

import { toastManager } from './uiManagers.js';

interface AgentStatusLike {
  installed?: boolean;
  loggedIn?: boolean;
  available?: boolean;
  errorCode?: string;
  detail?: string;
}

function unavailableReason(provider: 'codex' | 'claude', status?: AgentStatusLike): string {
  if (!status?.installed) return `${provider} CLI가 설치되어 있지 않습니다.`;
  if (!status.loggedIn) return `${provider} 구독 로그인이 필요합니다.`;
  if (status.errorCode === 'subscription_inactive') {
    return 'Claude 구독 기간이 만료되었거나 활성 Claude Code 구독이 없습니다.';
  }
  if (status.errorCode === 'rate_limited') {
    return `${provider} 구독 사용 한도가 소진되었습니다. 한도 초기화 후 다시 시도해주세요.`;
  }
  return status.detail || `${provider} 구독 사용 권한을 확인하지 못했습니다.`;
}

function showBlockingMessage(message: string): void {
  try { window.alert(message); } catch { toastManager.error(message); }
}

/** Return true only when the selected subscription agent is currently usable. */
export async function ensureAgentEngineReady(generator: string): Promise<boolean> {
  if (generator !== 'agent-codex' && generator !== 'agent-claude') return true;

  const api = (window as any).api;
  const provider: 'codex' | 'claude' = generator === 'agent-codex' ? 'codex' : 'claude';
  if (typeof api?.agentStatus !== 'function') {
    showBlockingMessage(
      `에이전트 모드(${provider}) 상태 확인 기능을 불러오지 못했습니다.\n\n앱을 완전히 종료한 뒤 다시 실행해주세요.`,
    );
    return false;
  }

  try {
    const response = await api.agentStatus(provider, { forceRefresh: true });
    const status = response?.status as AgentStatusLike | undefined;
    if (response?.success && status?.available === true) return true;

    const reason = unavailableReason(provider, status);
    const action = status?.errorCode === 'subscription_inactive'
      ? 'Claude 구독을 갱신한 뒤 환경설정에서 계정을 다시 로그인해주세요.'
      : !status?.installed
        ? '환경설정의 AI 텍스트 엔진 카드에서 CLI를 설치해주세요.'
        : '환경설정의 AI 텍스트 엔진 카드에서 로그인 또는 계정 전환을 진행해주세요.';
    showBlockingMessage(`에이전트 모드(${provider})를 사용할 수 없습니다.\n\n${reason}\n\n${action}`);
    return false;
  } catch {
    showBlockingMessage(
      `에이전트 모드(${provider})의 구독 상태를 확인하지 못했습니다.\n\n네트워크를 확인한 뒤 다시 시도해주세요.`,
    );
    return false;
  }
}
