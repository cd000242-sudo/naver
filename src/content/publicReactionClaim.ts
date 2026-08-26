/**
 * Ungrounded public-reaction claims — "this became a talking point", "opinion was split".
 *
 * [2026-08-27] Measured on a real article: the source's 15 direct quotes were all carried
 * over (100% fact retention), and yet three sentences asserted a public reaction the source
 * never mentioned — that the scene "keeps being talked about", that people who saw only the
 * clip were confused, that a prop changed the mood.
 *
 * This is quieter than inventing a name or a number, and more dangerous in an article about
 * a real person: a claim about what the public thinks cannot be checked by the reader, and
 * it can cut against the person it describes. The defamation guard covers accusations; this
 * covers the softer form.
 *
 * Grounded reactions pass. If the source says the scene drew laughs, the article may say so.
 * Warning-only: never throws, never blocks publishing.
 */

/**
 * Words that assert a public reaction. Closed list, so a normal sentence cannot trip it.
 * Each entry is the stem actually written in Korean prose.
 */
const REACTION_PHRASES: readonly string[] = [
  '화제', '회자', '갑론을박', '설왕설래', '논란', '뭇매', '질타',
  '반응이 뜨겁', '반응이 폭발', '반응이 갈렸', '반응이 달라졌',
  '누리꾼', '네티즌', '갑론을박이', '시청자들은', '팬들은',
  '이목이 쏠', '관심이 집중', '주목을 받', '눈길을 끌', '입방아',
];

/** Below this the source is too thin to judge against — say nothing rather than guess. */
const MIN_SOURCE_CHARS = 80;

export interface ReactionClaim {
  /** The phrase that asserted a reaction. */
  readonly phrase: string;
  /** The sentence it appeared in, clipped for the log. */
  readonly sentence: string;
}

const clip = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

const splitSentences = (text: string): string[] =>
  String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Reaction claims the source does not support.
 *
 * Grounding is checked against the whole source rather than the sentence's neighbourhood:
 * a source that mentions the reaction anywhere licenses the article to mention it.
 */
export function findUngroundedReactionClaims(
  article: string | undefined,
  sourceText: string | undefined,
): ReactionClaim[] {
  try {
    const body = String(article || '').trim();
    const source = String(sourceText || '').trim();
    if (!body) return [];
    // 자료가 얇으면 대조할 근거 자체가 없다. 추측으로 경고하지 않는다.
    if (source.length < MIN_SOURCE_CHARS) return [];

    const claims: ReactionClaim[] = [];
    const seen = new Set<string>();
    for (const sentence of splitSentences(body)) {
      for (const phrase of REACTION_PHRASES) {
        if (!sentence.includes(phrase)) continue;
        if (source.includes(phrase)) continue; // 원문이 이미 말한 반응이다.
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        claims.push({ phrase, sentence: clip(sentence, 70) });
      }
    }
    return claims;
  } catch {
    return []; // 검사 실패로 발행을 막지 않는다.
  }
}

/** One warning line, or empty when there is nothing to say. */
export function describePublicReactionClaims(claims: ReactionClaim[]): string {
  if (!Array.isArray(claims) || claims.length === 0) return '';
  const named = claims.map((c) => `"${c.phrase}"`).join(', ');
  return `자료에 없는 반응을 ${claims.length}건 적었다 — ${named}. `
    + `실존 인물 글에서 여론 서술은 확인할 수 없는 주장이다.`;
}
