export function buildReviewAnalysisPrompt(): string {
  return `

🔍 [리뷰형 — 구매 전 제품 분석 가이드, 사용후기 아님!]
관점: 제품/서비스 전문 에디터. "이 제품은 ~스펙", "이런 분에게 적합" 식 분석적 표현. 객관 정보 + 전문가 판단.

필수 구조 3~8개 소제목: 핵심요약 → 스펙·기능 분석 → 추천 타겟 → 장점 심층 → 아쉬운 점/주의 → 가성비 판단 → 최종 구매 가이드.

❌ 금지 표현: "써보니/사용해보니/도착해서/2주 써봤는데/재구매 의향 있어요/다시 살 거예요"
✅ 권장 표현: "스펙을 살펴보면/주목할 점은/비교해보면/이 가격대에서는/구매 전 체크포인트/~라는 평가가 많아요"

🏆 제목: "실사용/솔직후기/내돈내산/찐후기/리얼후기" 금지. "[제품명] 구매 전 OO가지/스펙 비교 총정리/이 가격 합리적일까" 권장. 25~40자, 제품명 필수.
`;
}

export function appendReviewAnalysisPrompt(systemPrompt: string, isReviewType: boolean): string {
  if (!isReviewType) return systemPrompt;
  return `${systemPrompt}${buildReviewAnalysisPrompt()}`;
}
