/**
 * intervalJitter.ts — 발행 간격 jitter 유틸
 *
 * 고정 발행 간격은 대량 발행 시 기계적 패턴으로 노출되어 네이버 제재
 * 트리거가 된다. 항목별로 간격에 랜덤 편차를 주어 패턴화를 완화한다.
 */

/** ±40% jitter 범위 (factor 0.6 ~ 1.4) */
const JITTER_RATIO = 0.4;

/** 발행 간격 상한 — 24시간 (multiAccountManager의 기존 invariant와 일치) */
const MAX_INTERVAL_SECONDS = 86400;

/**
 * 발행 간격(초)에 ±40% 랜덤 jitter를 적용한다.
 *
 * - 0 이하 입력은 그대로 반환(대기 없음 의미 보존).
 * - 결과는 최소 1초, 최대 24시간(86400초)으로 클램프.
 *
 * @param intervalSeconds 기준 발행 간격(초)
 * @returns jitter가 적용된 간격(초)
 */
export function applyIntervalJitter(intervalSeconds: number): number {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    return intervalSeconds;
  }
  // factor: 1 - JITTER_RATIO ~ 1 + JITTER_RATIO
  const jitterFactor = 1 + (Math.random() * 2 - 1) * JITTER_RATIO;
  const jittered = Math.round(intervalSeconds * jitterFactor);
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(1, jittered));
}
