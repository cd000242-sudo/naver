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
  /** 레거시 토글. 명시적 true만 허용 (undefined는 OFF로 본다). */
  enableSearchGrounding?: unknown;
}

export function isGroundingExplicitlyEnabled(
  source?: GroundingCostPolicySource | null,
): boolean {
  if (!source) return false;
  if (String(source.factCheckEngine ?? '').trim() === 'gemini-grounding') return true;
  // 과거 기본값이 opt-out(`!== false`)이라 키가 없으면 켜졌다. 이제 명시적 true만.
  return source.enableSearchGrounding === true;
}

/** 로그용 사유 — 왜 껐는지 사용자가 알 수 있게. */
export function describeGroundingDecision(enabled: boolean): string {
  return enabled
    ? '💎 Gemini 그라운딩 ON (사용자가 명시적으로 선택 — 글당 약 ₩50 과금)'
    : '⏭️ Gemini 그라운딩 OFF (비용 보호 기본값 — 팩트체크 엔진에서 직접 선택 시에만 사용)';
}
