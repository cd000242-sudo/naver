/**
 * [2026-07-30] Gemini Google Search grounding — single cost gate.
 *
 * 사용자 실측 피해: 이틀에 ₩15,000+ 소진. 코드 주석이 스스로 비용을 명시한다
 * ("비용: +$0.035/글 (grounding)" ≈ ₩50/글). 그런데 grounding 부착 지점이
 * 7곳이었고 그중 6곳이 무게이트 또는 기본 ON이었다:
 *   - contentGenerator 본문 생성: `enableSearchGrounding !== false` = 기본 ON
 *   - gemini.ts 2곳: 주석에 "상시 활성화" — 게이트 자체가 없음
 *   - researchWithGeminiGrounding: 함수 내부 게이트 없음 (호출자 2곳)
 *   - 공식 사이트 URL 조회: 무게이트
 * UI는 "그라운딩은 비용이 높아 자동 폴백에서 제외 — 필요할 때만 직접 선택"이라
 * 약속하는데 실제 동작이 정반대였다.
 *
 * 정책: **옵트인 전용**. 사용자가 명시적으로 켠 경우에만 과금이 발생한다.
 * 새 grounding 호출 지점을 추가할 때는 반드시 이 함수를 통과시켜야 한다.
 */
export interface GroundingCostPolicySource {
  /** 팩트체크 엔진 선택값. 'gemini-grounding'이면 사용자가 직접 고른 것. */
  factCheckEngine?: unknown;
  /**
   * 레거시 토글 — 더 이상 그라운딩을 켜지 못한다.
   * 타입만 남겨 과거 설정 파일을 읽을 때 타입 오류가 나지 않게 한다.
   */
  enableSearchGrounding?: unknown;
}

/**
 * [2026-08-04] 레거시 토글(enableSearchGrounding) 분기 제거.
 *
 * 그 필드는 UI에 토글이 없어 사용자가 끌 수 없는데, 과거 설정 파일에 true가
 * 남아 있으면 글마다 그라운딩이 자동으로 붙어 과금됐다. 사용자 지시대로
 * "자동으로 켜지는 구간"을 없애기 위해, 팩트체크 엔진을 그라운딩으로 직접
 * 고른 경우만 인정한다. 본문 생성 경로는 이 게이트와 무관하게 항상 OFF다
 * (contentGenerator의 callGemini 참조).
 */
export function isGroundingExplicitlyEnabled(
  source?: GroundingCostPolicySource | null,
): boolean {
  if (!source) return false;
  return String(source.factCheckEngine ?? '').trim() === 'gemini-grounding';
}

/** 로그용 사유 — 왜 껐는지 사용자가 알 수 있게. */
export function describeGroundingDecision(enabled: boolean): string {
  return enabled
    ? '💎 Gemini 그라운딩 ON (사용자가 명시적으로 선택 — 글당 약 ₩50 과금)'
    : '⏭️ Gemini 그라운딩 OFF (비용 보호 기본값 — 팩트체크 엔진에서 직접 선택 시에만 사용)';
}
