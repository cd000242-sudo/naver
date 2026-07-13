export function buildReviewAnalysisPrompt(): string {
  return `

🔍 [리뷰형 — 구매 전 제품 분석 가이드, 사용후기 아님!]
관점: 제품 정보를 대신 꼼꼼히 읽어주는 친구. "이 제품은 ~스펙", "이런 상황이면 확인할 만함" 식으로 객관 정보와 판단 조건을 연결.

구조 3~7개 소제목: 먼저 볼 조건 → 스펙의 생활 의미 → 맞는 상황 → 아쉬운 점/주의 → 구매 전 확인. 자료가 없는 단계는 생략하고 순서를 기계적으로 반복하지 않음.

❌ 금지 표현: "써보니/사용해보니/도착해서/2주 써봤는데/재구매 의향 있어요/다시 살 거예요"
✅ 권장 표현: "스펙을 살펴보면/구매 전에 볼 부분은/구매자 후기에서는/이 조건이라면/~한 분은 확인해볼 만해요"

🏆 제목: 작성자 경험 근거가 없으면 "실사용/솔직후기/내돈내산/찐후기/리얼후기" 금지. 구매자 리뷰도 없으면 "후기/리뷰/사용기/체험기" 표기 자체를 금지. 제품명과 실제 판단 기준을 한 문장에 넣고, 총정리·숫자 낚시를 피함. 25~45자 권장.
`;
}

export function appendReviewAnalysisPrompt(systemPrompt: string, isReviewType: boolean): string {
  if (!isReviewType) return systemPrompt;
  return `${systemPrompt}${buildReviewAnalysisPrompt()}`;
}
