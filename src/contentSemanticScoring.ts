/**
 * Semantic scoring via LLM rubric — Phase 2 of score refactor.
 *
 * Replaces the keyword-counting scorer (analyzeNaverScore) with an LLM-as-judge
 * approach. The LLM rates the content across 4 dimensions on a 0-100 scale and
 * the result is used directly as the quality score.
 *
 * Design notes:
 * - LLM caller is injected so this module stays free of Gemini SDK coupling.
 * - Always falls back to the deterministic scorer on parse/network failure.
 * - Feature-flagged via USE_LLM_RUBRIC env so callers can A/B compare.
 */

export type SemanticScoreResult = {
  score: number;
  details: {
    expertise: number;
    originality: number;
    readability: number;
    engagement: number;
  };
  suggestions: string[];
  source: 'llm' | 'fallback';
};

export type DeterministicScoreFn = () => {
  score: number;
  details: {
    expertise: number;
    originality: number;
    readability: number;
    engagement: number;
  };
  suggestions: string[];
};

const RUBRIC_PROMPT = `You are an expert Korean blog content evaluator.
Score the body text on 4 dimensions, each 0-100. Be strict — only well-written, experience-rich human-like content reaches 90+.

Dimensions:
- expertise: density of first-hand experience, specific numbers, verifiable facts
- originality: avoidance of AI-flat phrasing, presence of personal viewpoint and surprising angles
- readability: sentence rhythm, paragraph flow, natural Korean cadence
- engagement: reader curiosity, practical takeaway, call-to-action implicit or explicit

Forbidden when scoring:
- Do NOT reward keyword matching ("솔직히", "직접" 등 단어 빈도 무관). Score the semantic content.
- Do NOT inflate scores for length alone.

Respond with ONLY this JSON, no markdown:
{"expertise":0,"originality":0,"readability":0,"engagement":0,"reason":"한 줄 근거 (한국어)"}

Body to evaluate:
---
`;

const MAX_BODY_CHARS_FOR_RUBRIC = 3500;

export function buildRubricPrompt(text: string): string {
  const trimmed = text.length > MAX_BODY_CHARS_FOR_RUBRIC
    ? text.substring(0, MAX_BODY_CHARS_FOR_RUBRIC) + '\n[...trimmed for evaluation]'
    : text;
  return RUBRIC_PROMPT + trimmed;
}

function clamp(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
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

export function parseRubricResponse(raw: string): {
  expertise: number;
  originality: number;
  readability: number;
  engagement: number;
  reason: string;
} {
  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);
  return {
    expertise: clamp(parsed.expertise),
    originality: clamp(parsed.originality),
    readability: clamp(parsed.readability),
    engagement: clamp(parsed.engagement),
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

/**
 * Analyze content using LLM rubric. Falls back to deterministic scorer on any failure.
 *
 * @param text Body plain text to evaluate
 * @param geminiCall Injected LLM caller — receives prompt, returns raw response
 * @param fallback Deterministic scorer used when LLM call or parse fails
 */
export async function analyzeContentBySemantic(
  text: string,
  geminiCall: (prompt: string) => Promise<string>,
  fallback: DeterministicScoreFn,
): Promise<SemanticScoreResult> {
  if (!text || text.trim().length < 50) {
    const fb = fallback();
    return { ...fb, source: 'fallback' };
  }

  try {
    const prompt = buildRubricPrompt(text);
    const raw = await geminiCall(prompt);
    const parsed = parseRubricResponse(raw);

    const score = Math.round(
      (parsed.expertise + parsed.originality + parsed.readability + parsed.engagement) / 4,
    );

    const suggestions: string[] = [];
    if (parsed.reason) suggestions.push(parsed.reason);
    if (parsed.expertise < 70) suggestions.push('직접 경험과 구체적 수치를 더 보강하세요');
    if (parsed.originality < 70) suggestions.push('AI 특유의 균질한 표현을 줄이고 개인적 관점을 더 드러내세요');
    if (parsed.readability < 70) suggestions.push('문장 길이와 문단 흐름을 점검하세요');
    if (parsed.engagement < 70) suggestions.push('독자 실용성과 흥미 요소를 강화하세요');

    return {
      score,
      details: {
        expertise: parsed.expertise,
        originality: parsed.originality,
        readability: parsed.readability,
        engagement: parsed.engagement,
      },
      suggestions,
      source: 'llm',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[SemanticScoring] LLM rubric failed, using deterministic fallback: ${msg.substring(0, 120)}`);
    const fb = fallback();
    return { ...fb, source: 'fallback' };
  }
}

export function isLlmRubricEnabled(config?: { useLlmRubric?: boolean }): boolean {
  if (config?.useLlmRubric === true) return true;
  if (config?.useLlmRubric === false) return false;
  return process.env.USE_LLM_RUBRIC === 'true';
}
