// Pre-flight guard for agent mode (codex/claude subscription CLI).
//
// Blocks generation early with a clear blocking modal when the selected agent engine is not
// ready, instead of letting the backend fail mid-run. NOT a silent fallback — it never swaps
// the engine; it stops and tells the user exactly what to do (install / login in settings).

import { toastManager } from './uiManagers.js';

/**
 * Returns true when it is OK to proceed with generation.
 * For non-agent engines, always true. For agent engines, checks install+login status and,
 * if not ready, shows a blocking alert directing the user to the settings buttons.
 */
export async function ensureAgentEngineReady(generator: string): Promise<boolean> {
  if (generator !== 'agent-codex' && generator !== 'agent-claude') return true;

  const api = (window as any).api;
  const provider = generator === 'agent-codex' ? 'codex' : 'claude';
  // If the status bridge is unavailable, defer to the backend's clear error (not a silent swap).
  if (typeof api?.agentStatus !== 'function') return true;

  try {
    const res = await api.agentStatus(provider);
    const s = res?.status;
    if (s?.installed && s?.loggedIn) return true;

    const action = !s?.installed ? '자동 설치' : '로그인';
    const reason = !s?.installed
      ? `${provider} CLI가 설치되어 있지 않습니다.`
      : `${provider} 구독 로그인이 필요합니다.`;
    const msg =
      `🤖 에이전트 모드(${provider})를 사용할 수 없습니다.\n\n` +
      `${reason}\n\n` +
      `환경설정 → AI 텍스트 엔진 카드의 "${action}" 버튼으로 준비한 뒤 다시 시도해주세요.`;
    try { window.alert(msg); } catch { toastManager.error(reason); }
    return false;
  } catch {
    // 상태 확인 자체가 실패하면 백엔드 AgentCliError에 위임 (명시적 에러 — silent 폴백 아님)
    return true;
  }
}
