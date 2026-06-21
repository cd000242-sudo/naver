/**
 * SPEC-IMAGE-RECOVERY-001: error -> recovery decision classifier.
 *
 * Classifies an incoming error into one of:
 *   retry / skip-heading / abort-batch / block(B1~B7)
 *
 * Pure function — no side effects. The coordinator owns counters and notifications.
 */

import type {
  HeadingContext,
  RecoveryAttempts,
  RecoveryDecision,
  BlockingModalCode,
} from './types';

const R2_BACKOFF_MS = [2000, 4000, 8000];
const R2_MAX_ATTEMPTS = R2_BACKOFF_MS.length;
const R5_MAX_EXTENSIONS = 5; // 5 minutes base + 5 * 5 minutes = 30 minutes total cap (acceptance.md 정합)
// C4: 503 storm 가드 — 같은 헤딩에서 503이 N회 누적되면 R2 retry 대신 B3 차단 (한도 가속 소진 방지)
const C4_503_STORM_THRESHOLD = 2;

interface ClassifyInput {
  readonly errorMessage: string;
  readonly errorCode?: string;
  readonly httpStatus?: number;
  readonly attempts: RecoveryAttempts;
  readonly context: HeadingContext;
}

export function classifyError(input: ClassifyInput): RecoveryDecision {
  const { errorCode, httpStatus, attempts } = input;
  // V2: ReDoS 방어 — 외부 에러 메시지를 정규식 적용 전 길이 상한
  const errorMessage = (input.errorMessage ?? '').slice(0, 512);
  const msg = errorMessage.toLowerCase();

  // C3: IMAGEFX_QUOTA_EXCEEDED는 시간당 한도(B3)이지 브라우저 미설치(B4) 아님.
  if (errorCode === 'IMAGEFX_QUOTA_EXCEEDED') {
    return blockDecision('B3', '시간당 한도 초과 (IMAGEFX_QUOTA_EXCEEDED)', errorCode);
  }
  // Flow 무료 할당량(일일 한도) 소진 — 재시도 무의미, 즉시 차단 + 업그레이드/다른 엔진 안내.
  if (errorCode === 'FLOW_QUOTA_EXCEEDED') {
    return blockDecision('B3', 'Flow 무료 할당량 한도 도달 (FLOW_QUOTA_EXCEEDED) — 업그레이드/다른 엔진 유도', errorCode);
  }
  // ✅ [v2.10.299] BOT_DETECTED — 봇감지 의심 (오늘 성공 < 100장에서 429 발생).
  //   B3와 modalCode는 동일하지만 errorCode가 BOT_DETECTED로 보존되어 ProgressModal에서
  //   "한도 아님 → 다른 엔진 즉시 전환" 메시지로 차별화 표시됨.
  if (errorCode === 'IMAGEFX_BOT_DETECTED' || errorCode === 'FLOW_BOT_DETECTED' || errorCode === 'FLOW_BOT_BLOCKED') {
    return blockDecision('B3', `봇감지/차단 의심 (${errorCode}) — 사용자 다른 엔진 전환 유도`, errorCode);
  }
  // PLAYWRIGHT_INSTALL_FAILED만 B4로 분리.
  if (errorCode === 'PLAYWRIGHT_INSTALL_FAILED') {
    return blockDecision('B4', '브라우저 미설치 또는 설치 실패', errorCode);
  }

  // --- B1: forbidden (HTTP 403 / IP block) ---
  if (
    httpStatus === 403 ||
    errorCode === 'IMAGEFX_FORBIDDEN' ||
    /forbidden|한국 ip|ip 차단|access.*denied/i.test(errorMessage)
  ) {
    return blockDecision('B1', 'Google 접근 거부 (HTTP 403 또는 IP 차단)', errorCode ?? 'HTTP_403');
  }

  // --- B2: safety filter ---
  if (
    /safety|blocked|harmful|policy|안전 필터/i.test(errorMessage) ||
    errorCode === 'IMAGEFX_SAFETY_BLOCKED'
  ) {
    return blockDecision('B2', '프롬프트가 안전 필터에 차단됨', errorCode);
  }

  // --- B3: hourly quota (HTTP 429) ---
  if (httpStatus === 429 || /HTTP_429|시간당 한도/i.test(errorMessage)) {
    return blockDecision('B3', '시간당 한도 초과', errorCode ?? 'HTTP_429');
  }

  // --- B5: explicit login timeout ---
  if (
    errorCode === 'FLOW_LOGIN_TIMEOUT' ||
    /Google 로그인 시간 초과|로그인 시간이 \d+분을 넘었/i.test(errorMessage)
  ) {
    if (attempts.r5LoginExtended >= R5_MAX_EXTENSIONS) {
      return blockDecision('B5', '로그인 30분 누적 초과', errorCode);
    }
    return retryDecision('R5', '로그인 활성도 감지 — timeout 5분 추가 연장', 0);
  }

  // --- R1: session expired (HTTP 401 / AUTH_EXPIRED) ---
  if (
    httpStatus === 401 ||
    errorCode === 'IMAGEFX_AUTH_EXPIRED' ||
    errorCode === 'FLOW_SESSION_LOST' ||
    /session.*expired|세션이 만료|세션이 끊겼/i.test(errorMessage)
  ) {
    if (!attempts.r1Tried) {
      return retryDecision('R1', '세션 만료 — 토큰 캐시 폐기 후 1회 재로그인', 0);
    }
    return blockDecision('B5', 'R1 자동 재로그인 실패', errorCode);
  }

  // --- B6: Flow UI changed — user must wait or switch engine manually ---
  if (
    errorCode === 'FLOW_NEW_PROJECT_BUTTON_NOT_FOUND' ||
    errorCode === 'FLOW_PROMPT_INPUT_NOT_FOUND' ||
    errorCode === 'FLOW_SUBMIT_BUTTON_NOT_FOUND' ||
    errorCode === 'FLOW_PROMPT_INPUT_ALL_FAILED'
  ) {
    // R4 selector fallback handled outside (closer to UI). If we reach here all selectors failed.
    return blockDecision('B6', 'Flow UI 셀렉터 모두 실패', errorCode);
  }

  // --- R6: small image (<1KB) — Flow thumbnail → full-resolution swap pattern ---
  // C5: 분류기에 명시 분기 추가. 실제 재요청은 flowGenerator의 downloadImageAsBuffer가 수행.
  // 분류기는 메트릭/통계용으로만 R6를 retry로 표기 (헤딩 단위에서는 이미 다운로드 단계가 처리함).
  if (
    errorCode === 'FLOW_IMAGE_DOWNLOAD_TINY' ||
    /너무 작|tiny|<\s*1024\s*bytes/i.test(errorMessage)
  ) {
    if (!attempts.r6SmallImageRetried) {
      return retryDecision('R6', '소형 이미지 감지 — 5초 대기 후 재요청', 5000);
    }
    return { action: 'skip-heading', reason: 'R6 재요청 후에도 < 1KB — 헤딩 격리' };
  }

  // --- C4: 503 storm 가드 — Google 서버 한도 임박 시 R2 가속 소진 방지 ---
  // 같은 헤딩에서 503이 임계 회수 누적되면 R2 retry 대신 B3 차단으로 escalate.
  if (httpStatus === 503 && attempts.c4Server503Count >= C4_503_STORM_THRESHOLD) {
    return blockDecision('B3', `503 storm 감지 (${attempts.c4Server503Count + 1}회) — 시간당 한도 임박 가능`, 'C4_STORM');
  }

  // Flow 이미지 생성 timeout은 generateSingleImageWithFlow 내부에서 이미 새 프로젝트 격리 후 2회 시도한다.
  // 여기서 R2 재시도까지 추가하면 한 소제목이 10~30분을 잡아먹을 수 있어 즉시 격리한다.
  if (errorCode === 'FLOW_IMAGE_TIMEOUT' || errorCode === 'FLOW_IMAGE_TIMEOUT_NET') {
    return { action: 'skip-heading', reason: 'Flow 이미지 timeout — 내부 재시도 완료 후 다음 이미지로 격리' };
  }

  // --- R2: transient timeout/network/server-5xx — backoff retry ---
  if (
    httpStatus === 503 ||
    httpStatus === 502 ||
    httpStatus === 504 ||
    httpStatus === 500 ||
    errorCode === 'IMAGEFX_NO_IMAGES' ||
    errorCode === 'IMAGEFX_EXCEPTION' ||
    errorCode === 'FLOW_IMAGE_TIMEOUT' ||
    errorCode === 'FLOW_IMAGE_TIMEOUT_NET' ||
    errorCode === 'FLOW_PROJECT_REDIRECT_TIMEOUT' ||
    errorCode === 'FLOW_IMAGE_DOWNLOAD_FAILED' ||
    /timeout|navigation|connection|5\d\d/i.test(errorMessage)
  ) {
    if (attempts.r2Count >= R2_MAX_ATTEMPTS) {
      return { action: 'skip-heading', reason: `R2 ${R2_MAX_ATTEMPTS}회 백오프 후 실패 — 다음 헤딩으로 격리` };
    }
    const backoffMs = R2_BACKOFF_MS[attempts.r2Count];
    return retryDecision('R2', `일시 오류 백오프 ${attempts.r2Count + 1}/${R2_MAX_ATTEMPTS}`, backoffMs);
  }

  // --- Unknown / unclassified — abort current heading but keep batch ---
  return { action: 'skip-heading', reason: `미분류 오류: ${errorMessage.slice(0, 200)}` };
}

function retryDecision(
  tag: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8',
  reason: string,
  backoffMs: number,
): RecoveryDecision {
  return { action: 'retry', tag, reason, backoffMs };
}

function blockDecision(
  modalCode: BlockingModalCode,
  reason: string,
  errorCode?: string,
): RecoveryDecision {
  return { action: 'block', modalCode, reason, errorCode };
}

export const RECOVERY_CONSTANTS = {
  R2_BACKOFF_MS,
  R2_MAX_ATTEMPTS,
  R5_MAX_EXTENSIONS,
} as const;
