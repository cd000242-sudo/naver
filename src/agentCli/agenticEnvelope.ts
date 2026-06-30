// Agentic envelope — turns a one-shot API prompt into an autonomous-reasoning task.
//
// Why: codex `exec` and claude `-p` are agent loops, but a "write this, output JSON"
// prompt makes them answer in a single pass — same prompt, bigger bill. This envelope
// wraps the existing prompt (which already carries the persona, materials, and quality
// rubric) so the CLI runs its OWN internal loop: analyze -> draft -> self-critique vs the
// embedded rubric -> revise until it passes -> emit ONLY the final JSON.
//
// Mode-aware: each content mode (홈판/SEO/쇼핑/사진) has a different goal, so the self-critique
// is told what to obsess over for that mode — the upgrade must beat the base prompt per mode,
// not just generically.
//
// Contract preserved: the final message must be a single JSON object so the app's existing
// safeParseJson / quality gates keep working. The iteration happens inside one subscription
// call, so request count (and rate-limit pressure) does not increase.

/** Recommended hard deadline for an agentic run — internal iteration is slower than one-shot. */
export const AGENTIC_TIMEOUT_MS = 360_000;

// Mode-specific focus injected into the self-critique step. Keyed by the app's PromptMode
// (plus 'photo' for the image-narrative path). Unknown modes fall back to no focus block.
const MODE_FOCUS: Record<string, string> = {
  homefeed: `이 글의 목적은 네이버 "홈피드 노출"입니다. 자기비평에서 다음을 특히 끌어올리세요.
   - 첫 문장이 손가락을 멈추게 하는가 — 정보 요약이 아니라 사람의 이야기로 시작
   - "상황 + 판단" 형태의 진짜 경험·관찰이 들어가 공감과 댓글을 부르는가
   - 봇 같은 상투어·AI 티가 0에 가까운가 (사람이 직접 쓴 글로 읽혀야 함)
   - 정보 나열보다 화자의 시선·감정이 살아 있는가
   - [작업 명세]의 "홈판 상위노출 본문 골격"(도입 4단·짧은 단락·추임새 절제·소제목 변별·댓글 CTA)을 빠짐없이 지켰는가`,
  seo: `이 글의 목적은 네이버 "검색 노출(SEO)"입니다. 자기비평에서 다음을 특히 끌어올리세요.
   - 핵심 키워드·서브키워드가 제목·도입부·소제목에 자연스럽게 배치됐는가
   - 검색 의도를 충족하는 정보가 충실하고 소제목 구조가 명확한가
   - E-E-A-T 신뢰 신호(실경험·근거·구체 수치)가 있는가
   - 팩트가 정확하고 추정·환각이 없는가`,
  affiliate: `이 글의 목적은 "구매 전환"입니다. 자기비평에서 다음을 특히 끌어올리세요.
   - 제품의 가치·차별점이 독자 입장에서 와닿게 설명됐는가
   - 실사용 후기·비교로 신뢰를 주는가 (과장·허위 없이)
   - 구매를 망설이는 이유를 짚고 결정을 돕는 동선이 있는가`,
  photo: `이 글은 "사진 기반" 글쓰기입니다. 자기비평에서 다음을 특히 끌어올리세요.
   - 본문이 실제 이미지/장면과 일관되는가 (없는 사실을 지어내지 않음)
   - 사진을 직접 본 사람의 시선·경험으로 서술되는가`,
};

/** Normalize the app's mode label to a MODE_FOCUS key, or undefined when there is no match. */
function resolveModeKey(mode?: string): string | undefined {
  if (!mode) return undefined;
  const m = mode.trim().toLowerCase();
  if (m === 'homefeed') return 'homefeed';
  if (m === 'seo') return 'seo';
  if (m === 'affiliate' || m === 'shopping') return 'affiliate';
  if (m === 'photo' || m === 'image-narrative' || m === 'image') return 'photo';
  return undefined;
}

function buildHeader(modeKey?: string): string {
  const focusBlock = modeKey
    ? `\n[이 모드에서 특히 끌어올릴 것]\n${MODE_FOCUS[modeKey]}\n`
    : '';
  return `당신은 네이버 블로그 글을 쓰는 자율 에이전트입니다.
아래 [작업 명세]를 한 번에 받아쓰지 말고, 스스로 반복하며 품질을 끌어올린 뒤 최종 결과만 제출하세요.
[작업 명세] 안에 목표·키워드·자료·금지사항·평가 기준이 모두 들어 있습니다.

[자율 작업 절차] — 아래는 머릿속/작업공간에서 수행하세요. 중간 산출물(초안, 채점표, 메모)은 제출하지 마세요.
1. 분석: [작업 명세]의 목표·키워드·자료·금지사항·평가 기준을 빠짐없이 읽고 요구사항을 정리한다.
2. 초안: 그 기준을 충족하는 초안을 작성한다.
3. 자기비평: 초안을 [작업 명세]의 평가 기준으로 스스로 채점한다. 특히 다음을 정량으로 점검한다.
   - 봇 같은 상투어 / AI 티가 나는 표현이 있는가
   - 감탄사·추임새("헐·ㄹㅇ·와·아니 잠깐·이거 저만 그런가요·찐으로" 류)가 글 전체 3회를 넘지 않는가 — 'AI 탐지 높음'을 부르는 1순위 원인
   - 각 소제목이 서로 다른 정보 단위인가 — 같은 결론·같은 정보를 소제목만 바꿔 반복하지 않았는가
   - 같은 단어·표현·문장 패턴을 과하게 반복하지 않았는가
   - "상황 + 판단" 형태의 진짜 경험 신호가 들어갔는가 (E-E-A-T)
   - 앱이 [작업 명세]에서 지정한 카테고리·글톤·금지어를 그대로 지켰는가
   - 키워드·서브키워드·분량·문체 요구를 모두 지켰는가
   - 요구된 JSON 스키마를 정확히 따랐는가
4. 수정: 비평에서 찾은 문제를 고친다. 기준을 통과할 때까지 3~4단계를 반복한다.
5. 제출: 통과한 최종본만 출력한다.
${focusBlock}
[제출 형식 — 절대 규칙]
- 마지막 메시지는 오직 [작업 명세]가 요구한 JSON 객체 하나여야 한다.
- 사고 과정·설명·채점 내용·마크다운 코드펜스·인사말을 최종 메시지에 절대 포함하지 마라.
- JSON 외의 텍스트가 한 글자라도 섞이면 실패로 간주된다.

────────────────────────────
[작업 명세]
`;
}

/**
 * Wrap an existing content prompt as an autonomous, mode-aware agentic task.
 *
 * The base prompt is preserved verbatim (materials and rubric must not be lost); only the
 * autonomous-workflow directive, the mode-specific focus, and the strict JSON-only output
 * rule are prepended.
 *
 * @param basePrompt The full API-style prompt already containing persona, materials, rubric,
 *                    and the JSON schema instruction.
 * @param mode       The app PromptMode ('seo' | 'homefeed' | 'affiliate') or 'photo'. Unknown
 *                    or omitted modes use the generic writing envelope (no focus block).
 * @returns The wrapped prompt, or the input unchanged when it is empty/blank.
 */
export function wrapAsAgenticTask(basePrompt: string, mode?: string): string {
  if (typeof basePrompt !== 'string' || !basePrompt.trim()) {
    return basePrompt;
  }
  return `${buildHeader(resolveModeKey(mode))}${basePrompt}`;
}
