// Shared Homefeed body principles. This block is injected through buildFullPrompt so
// API and agent engines use the same evidence-first structure in every publishing flow.

/** Build the late Homefeed guidance block used by every content engine. */
export function buildHomefeedExposureSkeleton(): string {
  return `
═══════════════════════════════════════════
🏠 [홈판 상위노출 본문 원칙 - 근거 우선, 주제별 적용]
═══════════════════════════════════════════

1. 첫 화면에서 독자의 구체 상황과 핵심 답을 함께 보여준다. 반전이나 감정 장면이 어울리지 않는 주제에는 억지로 넣지 않는다.
2. 제목이 주체를 생략했다면 본문 첫 단락에서 바로 공개한다. 클릭을 위해 불필요하게 정체나 결론을 숨기지 않는다.
3. 모바일 문단은 보통 1~3문장으로 쓰되, 완결된 생각을 줄 수에 맞추려고 자르지 않는다.
4. [STYLE OVERRIDE]의 어미·문체는 유지하되 호들갑, 감탄사, 유행어로 사람을 흉내 내지 않는다. 표현 개수보다 문맥과 자연스러움을 우선한다.
5. 소제목은 질문·기준·비교·주의점 등 내용에 맞게 변주하고, 첫 1~2문장에서 그 소제목의 핵심 답을 준다. 각 소제목은 서로 다른 정보 단위를 맡는다.
6. 구체 팩트·숫자·고유명사는 입력 자료와 정확히 일치할 때만 사용한다. 자료 없는 경험·타인 반응·공식성·최신성을 날조하지 않는다. 실존 인물의 미확인 사생활·범죄·의혹은 단정하거나 암시하지 않는다.
7. 마무리는 핵심 판단을 짧게 정리한다. 댓글·저장·공유 유도는 독자에게 실제 도움이 되고 자연스러울 때만 하나를 선택하며, 필요 없으면 넣지 않는다.
═══════════════════════════════════════════`;
}
