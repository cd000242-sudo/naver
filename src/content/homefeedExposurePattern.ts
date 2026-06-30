// Home-feed exposure skeleton — the verified body structure of posts that actually reached
// Naver's home feed top slots (decoded from 20 live top-exposure posts).
//
// This is injected into the BASE homefeed prompt (buildFullPrompt), so EVERY engine
// (Gemini/OpenAI/Claude/Perplexity/agent) and EVERY flow (반자동/풀오토/연속/다중계정) gets it
// through the single shared pipeline — not just the agent path.
//
// Conflict note: the casual tone tables (e.g. community_fan) push "ㄹㅇ·찐 호들갑 어휘". The real
// winners are calm. So point 4 keeps the tone's 어미/문체 but caps interjection frequency — it
// governs frequency, not voice, to avoid fighting [STYLE OVERRIDE].

/**
 * Build the home-feed exposure skeleton block for direct LLM consumption.
 * Appended late in the homefeed prompt for recency. Category-agnostic structure;
 * the hidden-identity step (2) only triggers when the title withholds the subject.
 */
export function buildHomefeedExposureSkeleton(): string {
  return `
═══════════════════════════════════════════
🏠 [홈판 상위노출 본문 골격 — 실측 패턴, 반드시 그대로 따를 것]
═══════════════════════════════════════════
실제 네이버 홈피드 상단에 노출된 글들의 공통 구조입니다.

1. 도입 4단 구성: [일반 관찰/상황] → [반전·긴장] → [주인공·핵심 호명] → [읽을 이유 약속]
2. 제목이 정체를 숨긴 경우(예: "의외의 연예인", "톱스타 여배우"), 본문 첫 단락에서 바로 누구/무엇인지 공개해 호기심을 즉시 해소
3. 단락은 1~3문장으로 짧게 끊고, 단락 사이를 비워 모바일 가독성을 확보
4. [STYLE OVERRIDE]의 어미·문체는 그대로 유지하되, 호들갑·감탄사 "빈도"만 이 골격을 우선 적용해 절제: 과한 감탄("헐/ㄹㅇ/와/대박/미쳤다")은 상위노출 글에서 오히려 드뭅니다. 추임새·감탄사는 글 전체 3회 이하
5. 소제목은 호기심형(질문·대비). 각 소제목은 서로 다른 정보 단위 — 같은 결론을 소제목만 바꿔 반복 금지
6. 구체 팩트·숫자·고유명사로 신뢰와 흥미를 동시에 (입력 자료에 있는 사실만 — 날조 절대 금지)
7. 마무리는 요약 한 줄 + 독자에게 묻는 댓글 유도 문장("여러분은 ~ 어떠셨나요?")
═══════════════════════════════════════════`;
}
