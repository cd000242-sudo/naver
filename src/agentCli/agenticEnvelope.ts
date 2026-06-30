// Agentic envelope — turns a one-shot API prompt into an autonomous-reasoning task.
//
// Why: codex `exec` and claude `-p` are agent loops, but a "write this, output JSON"
// prompt makes them answer in a single pass — same prompt, bigger bill. This envelope
// wraps the existing prompt (which already carries the persona, materials, and quality
// rubric) so the CLI runs its OWN internal loop: analyze -> draft -> self-critique vs the
// embedded rubric -> revise until it passes -> emit ONLY the final JSON.
//
// Contract preserved: the final message must be a single JSON object so the app's existing
// safeParseJson / quality gates keep working. The iteration happens inside one subscription
// call, so request count (and rate-limit pressure) does not increase.

/** Recommended hard deadline for an agentic run — internal iteration is slower than one-shot. */
export const AGENTIC_TIMEOUT_MS = 360_000;

const ENVELOPE_HEADER = `당신은 네이버 블로그 글을 쓰는 자율 에이전트입니다.
아래 [작업 명세]를 한 번에 받아쓰지 말고, 스스로 반복하며 품질을 끌어올린 뒤 최종 결과만 제출하세요.
[작업 명세] 안에 목표·키워드·자료·금지사항·평가 기준이 모두 들어 있습니다.

[자율 작업 절차] — 아래는 머릿속/작업공간에서 수행하세요. 중간 산출물(초안, 채점표, 메모)은 제출하지 마세요.
1. 분석: [작업 명세]의 목표·키워드·자료·금지사항·평가 기준을 빠짐없이 읽고 요구사항을 정리한다.
2. 초안: 그 기준을 충족하는 초안을 작성한다.
3. 자기비평: 초안을 [작업 명세]의 평가 기준으로 스스로 채점한다. 특히 다음을 점검한다.
   - 봇 같은 상투어 / AI 티가 나는 표현이 있는가
   - "상황 + 판단" 형태의 진짜 경험 신호가 들어갔는가 (E-E-A-T)
   - 키워드·서브키워드·분량·문체 요구를 모두 지켰는가
   - 요구된 JSON 스키마를 정확히 따랐는가
4. 수정: 비평에서 찾은 문제를 고친다. 기준을 통과할 때까지 3~4단계를 반복한다.
5. 제출: 통과한 최종본만 출력한다.

[제출 형식 — 절대 규칙]
- 마지막 메시지는 오직 [작업 명세]가 요구한 JSON 객체 하나여야 한다.
- 사고 과정·설명·채점 내용·마크다운 코드펜스·인사말을 최종 메시지에 절대 포함하지 마라.
- JSON 외의 텍스트가 한 글자라도 섞이면 실패로 간주된다.

────────────────────────────
[작업 명세]
`;

/**
 * Wrap an existing content prompt as an autonomous agentic task.
 *
 * The base prompt is preserved verbatim (materials and rubric must not be lost); only the
 * autonomous-workflow directive and the strict JSON-only output rule are prepended.
 *
 * @param basePrompt The full API-style prompt already containing persona, materials, rubric,
 *                    and the JSON schema instruction.
 * @returns The wrapped prompt, or the input unchanged when it is empty/blank.
 */
export function wrapAsAgenticTask(basePrompt: string): string {
  if (typeof basePrompt !== 'string' || !basePrompt.trim()) {
    return basePrompt;
  }
  return `${ENVELOPE_HEADER}${basePrompt}`;
}
