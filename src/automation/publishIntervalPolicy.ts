// src/automation/publishIntervalPolicy.ts
// 연속 발행 최소 간격 정책.
//
// 왜: 기존 하드 플로어가 5분(이미지 많으면 7~8분)이라 실제 발행이 11~43분 간격으로
// 나갔다(실측 2026-08-19, 29건 중 1시간 미만 간격이 11회). SPEC-NAVER-PROTECTION-2026
// 조사 결론은 "안전 인터벌 1시간 텀(실무 합의선)"이다. 그 값을 기본으로 올리되,
// 사용자가 설정에서 내릴 수 있게 한다 — 발행 속도를 직접 바꾸는 값이라 강제하지 않는다.
//
// postLimitManager 에도 2시간짜리 최소 간격 API 가 있지만 호출하는 곳이 없다(죽은 코드).
// 실제로 발행을 늦추는 것은 이 정책뿐이다.

/** SPEC-NAVER-PROTECTION-2026 실무 합의선. */
export const RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES = 60;

/** 사용자가 아무리 낮춰도 이 아래로는 안 내려간다 — 캡차 방지 하드 플로어. */
export const ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC = 300;

/** 설정값이 없거나 망가졌을 때 쓰는 값. */
export const DEFAULT_MIN_PUBLISH_INTERVAL_MINUTES = RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES;

/** 설정에서 읽은 분 단위 값을 초로 정규화한다. 0/음수/NaN 은 기본값으로 되돌린다. */
export function normalizeConfiguredMinIntervalSec(minutes: unknown): number {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MIN_PUBLISH_INTERVAL_MINUTES * 60;
  // 24시간을 넘기는 값은 설정 실수로 본다.
  const clamped = Math.min(Math.floor(n), 24 * 60);
  return Math.max(ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC, clamped * 60);
}

export type PublishMode = 'publish' | 'draft' | 'schedule';

/**
 * 사용자 설정 간격을 적용할 모드인지.
 *
 * 임시저장·예약등록은 글이 그 자리에서 게시되지 않는다 — 발행 한도(일 100건)에도,
 * 노출 경쟁에도 들어가지 않는다. 남는 위험은 "브라우저 자동화 행위의 빈도"뿐이고
 * 그건 기존 이미지 인지 플로어(5~8분)가 이미 맡고 있다.
 * 그래서 1시간 간격은 실제 발행에만 건다.
 */
export function shouldApplyUserInterval(mode: unknown): boolean {
  return mode === undefined || mode === null || mode === '' || mode === 'publish';
}

/**
 * 실제로 적용할 하한. 이미지 소스별 플로어(느린 소스일수록 큼)와
 * 사용자 설정 중 큰 쪽을 쓴다 — 둘 다 "이보다 빠르면 위험" 이라는 뜻이라 최댓값이 맞다.
 * 임시저장·예약은 사용자 설정을 적용하지 않고 이미지 플로어만 지킨다.
 */
export function resolvePublishFloorSec(
  imageAwareFloorSec: number,
  configuredMinutes: unknown,
  mode?: unknown,
): number {
  const imageFloor = Number.isFinite(imageAwareFloorSec) && imageAwareFloorSec > 0
    ? Math.floor(imageAwareFloorSec)
    : ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC;
  if (!shouldApplyUserInterval(mode)) return imageFloor;
  return Math.max(imageFloor, normalizeConfiguredMinIntervalSec(configuredMinutes));
}

/** 권장선보다 짧게 설정했을 때 사용자에게 보여줄 안내. 없으면 null. */
export function describeIntervalRisk(configuredMinutes: unknown): string | null {
  const sec = normalizeConfiguredMinIntervalSec(configuredMinutes);
  const minutes = Math.round(sec / 60);
  if (minutes >= RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES) return null;
  return `발행 간격이 ${minutes}분입니다. 실무 권장선은 `
    + `${RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES}분이며, 짧을수록 봇 판정·캡차 위험이 올라갑니다.`;
}
