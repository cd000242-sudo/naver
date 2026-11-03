// src/image/codex/codexImageReadiness.ts
// Checked before any Codex image run: the CLI must be installed, new enough, logged in and not out of quota.
// Same status source as generateWithAgent (a fresh detectAgent), but the messages point at the image engine's setup.

import { detectAgent } from '../../agentCli/detect.js';
import { assertAgentProviderAllowed } from '../../agentCli/productPolicy.js';
import { rateLimitNoticeFrom } from '../../agentCli/rateLimitReset.js';
import { AgentCliError, type AgentCliStatus } from '../../agentCli/types.js';

export const CODEX_IMAGE_CONNECT_MESSAGE = 'Codex 구독 이미지는 Codex 연결이 필요합니다 — 설정에서 [연결하기]';

type DetectFn = (provider: 'codex', options?: { forceRefresh?: boolean }) => Promise<AgentCliStatus>;

function needsConnect(code: 'not_installed' | 'not_logged_in' | 'update_required', reason: string): AgentCliError {
  return new AgentCliError(code, 'codex', `${CODEX_IMAGE_CONNECT_MESSAGE}. ${reason}`.trim());
}

export async function assertCodexImageReady(detect: DetectFn = detectAgent): Promise<void> {
  assertAgentProviderAllowed('codex');
  const status = await detect('codex', { forceRefresh: true });
  // A probe that could not answer is not evidence of a logout (see detectResilience).
  if (status.errorCode === 'timeout' || status.errorCode === 'aborted' || status.errorCode === 'spawn_failed') {
    throw new AgentCliError(status.errorCode, 'codex', status.detail ?? 'Codex 상태 확인이 지연돼 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  if (status.errorCode === 'update_required') {
    throw needsConnect('update_required', status.detail ?? 'Codex CLI 업데이트가 필요합니다.');
  }
  if (!status.installed) throw needsConnect('not_installed', 'Codex CLI 가 설치되어 있지 않습니다.');
  if (!status.loggedIn) throw needsConnect('not_logged_in', 'ChatGPT 구독 로그인이 필요합니다.');
  if (!status.available) {
    const code = status.errorCode ?? 'nonzero_exit';
    if (code === 'rate_limited') {
      const notice = rateLimitNoticeFrom('codex', status.detail) || 'Codex 구독 한도가 소진되었습니다';
      throw new AgentCliError(code, 'codex', `Codex 구독 이미지를 지금은 쓸 수 없습니다 — ${notice}. 다른 이미지 엔진으로 바꾸지 않았습니다.`, status.detail);
    }
    throw new AgentCliError(code, 'codex', status.detail || 'Codex 에이전트를 현재 사용할 수 없습니다.', status.detail);
  }
}
