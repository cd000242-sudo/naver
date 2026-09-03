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

/** Probe outcomes that describe the attempt, not the account. */
function isTransientStatusCode(code: string | undefined): boolean {
  return code === 'timeout' || code === 'aborted' || code === 'spawn_failed';
}

function unavailableReason(provider: 'codex' | 'claude' | 'gemini', status?: AgentStatusLike): string {
  const providerLabel = provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : 'Claude';
  if (status?.errorCode === 'provider_disabled') {
    return status.detail
      || `${providerLabel} 구독 로그인을 현재 사용할 수 없습니다. 상태를 새로고침한 뒤 다시 시도해주세요.`;
  }
  // A probe that timed out / could not spawn says nothing about the account, so it must never
  // reach the install or login copy below.
  if (isTransientStatusCode(status?.errorCode)) {
    return status?.detail
      || `${providerLabel} 상태 확인이 지연돼 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.`;
  }
  if (!status?.installed) return `${provider} CLI가 설치되어 있지 않습니다.`;
  if (!status.loggedIn) return `${provider} 구독 로그인이 필요합니다.`;
  if (status.errorCode === 'subscription_inactive') {
    return `${providerLabel} 구독 기간이 만료되었거나 활성 ${providerLabel} 구독이 없습니다.`;
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
/** Subscription CLI engines (Claude Code / Codex / Antigravity) — they run outside the API clients. */
export function isAgentEngine(generator: string): boolean {
  return generator === 'agent-codex' || generator === 'agent-claude' || generator === 'agent-gemini';
}

export async function ensureAgentEngineReady(generator: string): Promise<boolean> {
  if (!isAgentEngine(generator)) return true;

  const api = window.api;
  const provider: 'codex' | 'claude' | 'gemini' = generator === 'agent-codex'
    ? 'codex'
    : generator === 'agent-gemini'
      ? 'gemini'
      : 'claude';
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
    const providerLabel = provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini' : 'Claude';
    const action = status?.errorCode === 'provider_disabled'
      ? '다른 연결 방식(에이전트 또는 API 키)을 직접 선택해주세요.'
      : isTransientStatusCode(status?.errorCode)
      ? '로그인은 그대로 유지되어 있습니다. 잠시 후 다시 시도해주세요.'
      : status?.errorCode === 'subscription_inactive'
      ? `${providerLabel} 구독을 갱신한 뒤 환경설정에서 계정을 다시 로그인해주세요.`
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
