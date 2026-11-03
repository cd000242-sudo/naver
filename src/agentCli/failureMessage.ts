import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';
import type { AgentErrorCode, AgentProvider } from './types.js';
import { rateLimitNoticeFrom } from './rateLimitReset.js';

const GUIDANCE: Readonly<Record<AgentErrorCode, string>> = Object.freeze({
  provider_disabled: '이 제공 방식은 배포 앱 정책상 사용할 수 없습니다.',
  not_installed: 'CLI를 찾지 못했습니다. 설정에서 설치 상태를 확인해주세요.',
  not_logged_in: '로그인이 확인되지 않았습니다. 설정에서 로그인해주세요.',
  subscription_inactive: '구독 계정이 아닌 인증이거나 현재 구독을 사용할 수 없습니다.',
  rate_limited: '현재 구독 사용 한도가 소진되었습니다. 한도 초기화 후 다시 시도해주세요.',
  timeout: '제한 시간 안에 응답을 받지 못해 요청을 중단했습니다.',
  aborted: '사용자 취소 또는 상위 작업 중단으로 요청을 종료했습니다.',
  spawn_failed: 'CLI 프로세스를 시작하지 못했습니다.',
  server_overloaded: 'AI 서버가 일시적으로 과부하 상태(529)입니다. 잠시 후 다시 시도해주세요.',
  model_unavailable: '고른 모델을 이 구독에서 쓸 수 없습니다.',
  update_required: 'CLI 버전이 낮습니다. 설정에서 [연결하기]로 앱 전용 폴더에 새 버전을 설치해주세요.',
  nonzero_exit: 'CLI가 오류 상태로 종료되었습니다.',
  empty_output: 'CLI가 최종 응답을 반환하지 않았습니다.',
  bad_json: 'CLI 응답을 글 데이터 형식으로 해석하지 못했습니다.',
});

// [v2.11.135] These transient output-shape failures now get one automatic
// retry inside generateWithAgent (subscription CLI — no extra API cost).
const RETRIED_ONCE_CODES: ReadonlySet<AgentErrorCode> = new Set(['bad_json', 'empty_output', 'timeout', 'server_overloaded']);

function providerLabelOf(provider: AgentProvider): string {
  return provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini CLI' : 'Claude Code';
}

export function buildAgentFailureMessage(
  provider: AgentProvider,
  code: AgentErrorCode,
  detail?: unknown,
): string {
  const providerLabel = providerLabelOf(provider);
  const safeDetail = detail == null || String(detail).trim() === ''
    ? ''
    : ` 상세: ${sanitizeUserVisibleError(detail)}`;
  const retryNote = RETRIED_ONCE_CODES.has(code)
    ? ' 1회 자동 재시도 후에도 실패한 결과입니다.'
    : ' 같은 요청은 자동 재시도하지 않았습니다.';
  // A usage-limit message that names the reset moment is shown as a dated notice (no engine switch).
  const resetNotice = code === 'rate_limited' ? rateLimitNoticeFrom(provider, detail) : '';
  const guidance = resetNotice ? `${resetNotice}.` : GUIDANCE[code];
  return `${providerLabel} 생성 실패 (원인 코드: ${code}). ${guidance}${safeDetail}${retryNote}`;
}

/**
 * [2026-11-03] The subscription refused the model. Says which model and that nothing else was tried:
 * the app never swaps in another model on its own (no silent fallback).
 */
export function buildModelUnavailableMessage(
  provider: AgentProvider,
  model: string | undefined,
  detail?: unknown,
): string {
  const safeDetail = detail == null || String(detail).trim() === ''
    ? ''
    : ` 상세: ${sanitizeUserVisibleError(detail)}`;
  return `${providerLabelOf(provider)} 구독에서 ${model || '고른 모델'} 를 쓸 수 없습니다 — 구독 플랜에 없는 모델이거나 이름이 바뀌었을 수 있습니다. `
    + '환경설정의 에이전트 모델에서 다른 모델을 직접 골라 주세요. 다른 모델로 자동 전환하지 않았고 같은 요청은 다시 시도하지 않았습니다.'
    + safeDetail;
}
