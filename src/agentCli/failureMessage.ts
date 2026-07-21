import { sanitizeUserVisibleError } from '../runtime/userVisibleError.js';
import type { AgentErrorCode, AgentProvider } from './types.js';

const GUIDANCE: Readonly<Record<AgentErrorCode, string>> = Object.freeze({
  provider_disabled: '이 제공 방식은 배포 앱 정책상 사용할 수 없습니다.',
  not_installed: 'CLI를 찾지 못했습니다. 설정에서 설치 상태를 확인해주세요.',
  not_logged_in: '로그인이 확인되지 않았습니다. 설정에서 로그인해주세요.',
  subscription_inactive: '구독 계정이 아닌 인증이거나 현재 구독을 사용할 수 없습니다.',
  rate_limited: '현재 구독 사용 한도가 소진되었습니다. 한도 초기화 후 다시 시도해주세요.',
  timeout: '제한 시간 안에 응답을 받지 못해 요청을 중단했습니다.',
  aborted: '사용자 취소 또는 상위 작업 중단으로 요청을 종료했습니다.',
  spawn_failed: 'CLI 프로세스를 시작하지 못했습니다.',
  nonzero_exit: 'CLI가 오류 상태로 종료되었습니다.',
  empty_output: 'CLI가 최종 응답을 반환하지 않았습니다.',
  bad_json: 'CLI 응답을 글 데이터 형식으로 해석하지 못했습니다.',
});

// [v2.11.135] These transient output-shape failures now get one automatic
// retry inside generateWithAgent (subscription CLI — no extra API cost).
const RETRIED_ONCE_CODES: ReadonlySet<AgentErrorCode> = new Set(['bad_json', 'empty_output', 'timeout']);

export function buildAgentFailureMessage(
  provider: AgentProvider,
  code: AgentErrorCode,
  detail?: unknown,
): string {
  const providerLabel = provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini CLI' : 'Claude Code';
  const safeDetail = detail == null || String(detail).trim() === ''
    ? ''
    : ` 상세: ${sanitizeUserVisibleError(detail)}`;
  const retryNote = RETRIED_ONCE_CODES.has(code)
    ? ' 1회 자동 재시도 후에도 실패한 결과입니다.'
    : ' 같은 요청은 자동 재시도하지 않았습니다.';
  return `${providerLabel} 생성 실패 (원인 코드: ${code}). ${GUIDANCE[code]}${safeDetail}${retryNote}`;
}
