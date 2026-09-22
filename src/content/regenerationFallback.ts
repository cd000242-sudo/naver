/**
 * [2026-09-23 실사고 20260923-000352-221hos] 품질 개선 재생성이 실패하면 **이미 완성된 글까지**
 * 버려지고 GENERATION_FAILED 로 끝났다.
 *
 * 실측 타임라인: 설계도+본문 1차 성공 115.1초 → 후처리 5단계 82.6초 → 품질게이트가 개선 재생성
 * 요청 → 2차 본문 호출이 123.6초에서 타임아웃 → 5분 22초를 기다린 사용자에게 글이 한 편도 남지
 * 않았다.
 *
 * 제품 원칙: **선택적 품질 개선 단계의 실패가 이미 성공한 사용자 결과물을 파괴해서는 안 된다.**
 * 설계도 실패는 "설계도 생략", 팩트체크 실패는 "글은 그대로 사용" 으로 이미 그렇게 움직인다.
 * 재생성 경로만 예외였다.
 *
 * 이 모듈은 판정을 하지 않는다 — 실패 사유를 분류하고, 되돌릴 스냅샷에 붙일 메타데이터를 만든다.
 * 품질 점수·publishDecision 은 **재생성 직전 값 그대로** 유지한다(성공으로 둔갑시키지 않는다).
 */

export type RegenerationFallbackReason =
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'PARSE_ERROR'
  | 'TRUNCATED'
  | 'HTTP_ERROR'
  | 'ABORTED'
  | 'UNKNOWN';

export interface RegenerationFallbackMetadata {
  readonly generationStatus: 'SUCCESS_WITH_REGEN_FALLBACK';
  readonly qualityRegeneration: 'FAILED';
  readonly fallbackUsed: true;
  readonly fallbackReason: RegenerationFallbackReason;
  /** 재생성을 시도했던 attempt 번호(0-based 루프 기준). */
  readonly attempt: number;
  /** 재생성을 부른 게이트(QualityGate / QualityGate90 / TitleAnswer …). */
  readonly regenerationTrigger: string;
  /** 원본 오류 메시지 앞부분 — 로그·런 스냅샷 추적용. */
  readonly failureMessage: string;
}

/** 사용자 취소는 복구 대상이 아니다 — 사용자가 멈춘 것을 결과로 되살리지 않는다. */
export function isUserAbortFailure(reason: RegenerationFallbackReason): boolean {
  return reason === 'ABORTED';
}

/**
 * 재생성 실패 사유 분류. 되돌릴지 말지를 정하는 게 아니라 **무엇 때문이었는지**를 남긴다.
 * (되돌리지 않는 유일한 경우는 사용자 취소다 — isUserAbortFailure 참조)
 */
export function classifyRegenerationFailure(error: unknown): RegenerationFallbackReason {
  const message = String((error as Error)?.message ?? error ?? '');
  if (!message) return 'UNKNOWN';
  if (/중지|취소|abort|cancell?ed|AbortError/i.test(message)) return 'ABORTED';
  if (/시간\s*초과|timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(message)) return 'TIMEOUT';
  if (/잘렸|truncat|max_tokens|MAX_TOKENS|불완전한 (JSON|응답)|incomplete/i.test(message)) return 'TRUNCATED';
  if (/JSON|파싱|parse|Unexpected token|SyntaxError/i.test(message)) return 'PARSE_ERROR';
  if (/\b(4\d{2}|5\d{2})\b|status code|HTTP|BILLING_OR_CREDIT|rate.?limit|overload|quota/i.test(message)) return 'HTTP_ERROR';
  if (/API|provider|network|ENOTFOUND|ECONNRESET|fetch failed|socket/i.test(message)) return 'PROVIDER_ERROR';
  return 'UNKNOWN';
}

export function buildRegenerationFallbackMetadata(input: {
  readonly error: unknown;
  readonly attempt: number;
  readonly regenerationTrigger: string;
}): RegenerationFallbackMetadata {
  return {
    generationStatus: 'SUCCESS_WITH_REGEN_FALLBACK',
    qualityRegeneration: 'FAILED',
    fallbackUsed: true,
    fallbackReason: classifyRegenerationFailure(input.error),
    attempt: input.attempt,
    regenerationTrigger: input.regenerationTrigger || 'unknown',
    failureMessage: String((input.error as Error)?.message ?? input.error ?? '').slice(0, 300),
  };
}

/** 재생성을 시작할 때 남기는 한 줄 — attempt / 직전 성공본 보유 여부 / 사유 / 창 / 엔진. */
export function describeRegenerationStart(input: {
  readonly attempt: number;
  readonly hasPreviousArtifact: boolean;
  readonly trigger: string;
  readonly timeoutMs: number;
  readonly provider: string;
  readonly model: string;
}): string {
  return `[Regeneration] attempt=${input.attempt} 직전성공=${input.hasPreviousArtifact ? '있음' : '없음'} `
    + `사유="${input.trigger}" 창=${Math.round(input.timeoutMs / 1000)}초 엔진=${input.provider}/${input.model || '기본'}`;
}

/** 복구했을 때 남기는 두 줄 — 실패와 복구를 구분해서 읽을 수 있게. */
export function describeRegenerationFallback(
  meta: RegenerationFallbackMetadata,
  preservedDecision: string,
): string[] {
  return [
    `[Regeneration] REGENERATION_FAILED reason=${meta.fallbackReason} attempt=${meta.attempt} trigger=${meta.regenerationTrigger} — ${meta.failureMessage}`,
    `[Regeneration] FALLBACK_TO_LAST_SUCCESS 직전 성공 결과를 반환합니다 (품질 판정 보존: ${preservedDecision || '미판정'})`,
  ];
}
