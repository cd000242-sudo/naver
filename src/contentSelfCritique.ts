/**
 * Self-critique 2-pass — Phase 5 of the score refactor.
 *
 * After the initial generation, the LLM is asked to re-read its own output
 * against the persona card and rewrite up to 3 sentences that read like AI
 * (cliché openings, broken tone, flat human-mimicry). The rest of the body
 * stays intact — this is targeted editing, not full regeneration.
 *
 * Triggered by ENABLE_SELF_CRITIQUE env or source.enableSelfCritique. Failures
 * always return the original body so we never regress.
 */

export type SelfCritiqueResult = {
  body: string;
  rewrote: boolean;
  source: 'critique' | 'fallback' | 'skipped';
};

const MAX_BODY_CHARS_FOR_CRITIQUE = 4500;
const MIN_BODY_CHARS_FOR_CRITIQUE = 200;

function buildCritiquePrompt(text: string, personaCard: string, extraDirective?: string): string {
  const trimmedText = text.length > MAX_BODY_CHARS_FOR_CRITIQUE
    ? text.substring(0, MAX_BODY_CHARS_FOR_CRITIQUE) + '\n[...뒷부분 평가 생략]'
    : text;

  // ✅ [v2.10.180 Phase 2.3] qualityGate retryDirective 가이드 주입
  //   patch decision 시 *구체적 미달 항목*을 selfCritique에 전달 → 정확한 patch
  const extraBlock = (extraDirective && extraDirective.trim())
    ? `\n[Quality Gate 추가 지시 — 우선 반영]\n${extraDirective.trim()}\n`
    : '';

  return `당신은 한국어 블로그 글의 편집자입니다.
아래 본문을 페르소나 일관성과 자연스러움 관점에서 점검하고, 가장 어색한 문장 최대 3개를 같은 의미를 유지하면서 더 자연스럽게 다시 쓰세요.

[페르소나 카드]
${personaCard}
${extraBlock}
[검토 기준]
1. 글 전체에서 위 페르소나의 시점과 어조가 일관되게 유지되는가?
2. AI 특유의 균질한 표현이나 정해진 클리셰("솔직히", "직접 해보니", "체감", "개인적으로" 등 단어를 정해진 위치에서 반복)가 있는가?
3. 사람이 실제로 쓴 글처럼 사후 정정, 미완 결론, 감정 흔들림, 자기 교정 같은 흔적이 보이는가?
4. 같은 어미가 2번 이상 연속되거나, 같은 보기 표현이 반복되지 않는가?
5. AI 티 나는 메타·토큰 표현이 있는가? — "[자료]/[자료N]" 토큰, "자료에 따르면/입력 자료에/관련 안내에서는/자료에 명시되어 있지 않습니다", "○월 ○일 기준" 작성일 못박기 → 발견 시 자연스러운 문장으로 고쳐라(정보는 유지, 출처·날짜 메타만 제거).

[작업 규칙]
- 문장 단위로만 수정. 전체 구조나 정보는 그대로 보존.
- 수정 대상은 가장 어색한 문장 최대 3개. 더 많이 손대지 말 것.
- 정보 추가·삭제 금지. 표현 자연스러움만 개선.
- 수정할 게 없으면 원본을 그대로 반환.

[응답 형식 — JSON only, 마크다운 펜스 금지]
{"rewrote": true 또는 false, "body": "전체 본문 (수정본 또는 원본 그대로)"}

[본문]
---
${trimmedText}`;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    return trimmed.substring(braceStart, braceEnd + 1);
  }
  return trimmed;
}

export function parseCritiqueResponse(raw: string): { rewrote: boolean; body: string } {
  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);
  const rewrote = parsed.rewrote === true;
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  return { rewrote, body };
}

/**
 * Re-evaluate generated content against the persona card and rewrite up to 3
 * awkward sentences. Returns the original text unchanged on any failure.
 */
export async function selfCritiqueAndRewrite(
  text: string,
  personaCard: string,
  geminiCall: (prompt: string) => Promise<string>,
  extraDirective?: string,
): Promise<SelfCritiqueResult> {
  if (!text || text.trim().length < MIN_BODY_CHARS_FOR_CRITIQUE) {
    return { body: text, rewrote: false, source: 'skipped' };
  }

  try {
    const prompt = buildCritiquePrompt(text, personaCard, extraDirective);
    const raw = await geminiCall(prompt);
    const parsed = parseCritiqueResponse(raw);

    if (!parsed.rewrote || !parsed.body.trim()) {
      return { body: text, rewrote: false, source: 'critique' };
    }

    // Sanity check: if the rewrite drops more than 30% of the original length,
    // assume the model truncated or lost information and reject the rewrite.
    const lengthRatio = parsed.body.length / text.length;
    if (lengthRatio < 0.7 || lengthRatio > 1.5) {
      console.warn(`[SelfCritique] 길이 변화율(${(lengthRatio * 100).toFixed(0)}%)이 안전 범위를 벗어남 — 원본 유지`);
      return { body: text, rewrote: false, source: 'fallback' };
    }

    return { body: parsed.body, rewrote: true, source: 'critique' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[SelfCritique] 호출/파싱 실패, 원본 유지: ${msg.substring(0, 120)}`);
    return { body: text, rewrote: false, source: 'fallback' };
  }
}

export function isSelfCritiqueEnabled(config?: { enableSelfCritique?: boolean }): boolean {
  if (config?.enableSelfCritique === true) return true;
  if (config?.enableSelfCritique === false) return false;
  return process.env.ENABLE_SELF_CRITIQUE === 'true';
}
