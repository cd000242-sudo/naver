/**
 * [2026-07-30] Shopping-connect 10-step conversion skeleton (EEAT-mixed).
 *
 * User-provided high-view detail-page structure, hardened with grounding
 * gates: every persuasion step fires only when crawled evidence supports it,
 * and the compliance guard bans fabricated urgency/guarantee wording at the
 * generation layer (the deterministic sanitizer is the second net).
 */
export interface AffiliateConversionStructureSource {
  personalExperience?: unknown;
}

const hasFirstPartyMemo = (source: AffiliateConversionStructureSource): boolean =>
  String(source?.personalExperience ?? '').trim().length >= 8;

export function buildAffiliateConversionStructureContract(
  source: AffiliateConversionStructureSource,
): string {
  const storyRule = hasFirstPartyMemo(source)
    ? '5. 스토리텔링 — "작성자 직접 사용 메모"에 적힌 사실만 1인칭 장면으로 쓴다. 메모에 없는 감각·기간·가족 반응은 보태지 않는다. (Experience)'
    : '5. 스토리텔링 — 독자의 하루를 2인칭으로 시뮬레이션한 장면("퇴근하고 돌아왔을 때 ○○ 때문에 …라면") 또는 구매자 후기의 장면으로 만든다. 작성자 1인칭 체험으로 위장하지 않는다. (Experience)';

  return `[CONVERSION STRUCTURE — 구매 전환 10단 골격 + EEAT]
글 전체는 아래 순서를 따른다. 각 단계는 근거가 있을 때만 쓰고, 근거가 없으면
그 단계를 조용히 건너뛴다 — 건너뛴다고 쓰거나 근거 부족을 언급하지 않는다.

1. 후킹 — 독자의 1순위 고민을 정면으로 건드리는 장면·질문으로 연다. 제품명 소개로 열지 않는다.
2. 문제 제기 — 그 고민이 어떤 조건에서 반복되고, 방치하면 무엇이 계속 남는지 구체화한다.
3. 해결책 제시 — 이 제품의 확인된 속성이 그 문제를 어떻게 줄이는지 스펙을 생활의 이득으로 번역해 설명한다. (Expertise)
4. 사회적 증거 — 구매자 후기에서 반복 확인된 결과를 보여준다. 평점·리뷰 수 같은 숫자는 입력 자료에 실제로 있을 때만 쓰고, 없으면 숫자 없이 후기 내용으로만. (Authoritativeness: 출처는 구매자 후기로 귀속)
${storyRule}
6. 시각적 분할 — 소제목·표·짧은 문단으로 스캔 가능하게 나눈다. 비교·조건은 표로 정리한다.
7. 긴급성 — 입력 자료에 실제 기간·가격·프로모션 조건이 있을 때만 그 사실을 쓴다. 없으면 "결정을 미루는 동안 계속 남는 불편·비용"으로만 만든다. 재고 수량·마감 시한을 만들어내지 않는다.
8. 행동 유도(CTA) — 마지막에 한 번만. 확인된 사실의 요약이 곧 클릭 이유가 되게 한다.
9. 안전장치 — 입력 자료에서 확인된 교환·반품·AS·옵션 확인 방법 등 구매 불안을 낮추는 사실을 안내한다. 확인된 것이 없으면 이 단계를 생략한다. (Trust)
10. 클로징 — "어떤 사람의 어떤 문제를 어떻게 줄여주는가"를 요약하고, 확인된 사실 기반으로 결정 이유를 남긴다.

[심의 가드 — 생성 단계 금지]
- 효과·수익 보장 단정 금지: "~하면 반드시/자연스럽게 ~됩니다", "N주 만에 N배" 같은 결과 보장 문형을 쓰지 않는다. 후기가 뒷받침하는 결과도 "후기에서 확인된" 범위로만.
- 근거 없는 한정 금지: 재고 수량, 마감일, "이번 주까지만", "오늘만" 등 입력 자료에 없는 희소성 표현을 만들지 않는다.
- 최상급·단정 금지: 최고·1위·유일·완벽 등은 입력 자료의 공식 표기 인용일 때만, 출처를 밝혀 쓴다.
- 건강·미용 효능은 입력 자료의 표기 범위를 넘겨 단정하지 않는다.`;
}
