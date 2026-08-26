/**
 * Title-payoff check — does the body deliver what the title promised?
 *
 * [2026-08-26] The click contract had only one half wired. `evaluateTitleQuality`
 * scores whether a homefeed title *provokes* a click (summary-noun endings −50, …),
 * but nothing anywhere measured whether the body *repays* it. `grep payoff` returned
 * zero. A title could promise "the reason" and the intro could never mention a reason.
 *
 * The promise is what the title adds *around* the keyword — everyone puts the keyword
 * in, so the keyword is not a promise. Payoff is checked in the opening only: a reader
 * who clicked for a reason and does not find it in the first screen leaves.
 *
 * Lexical, not semantic — this reports a word the title raised and the opening never
 * touched. It cannot tell whether the answer given is a *good* one. That limit is the
 * price of keeping it free (no extra LLM call).
 *
 * Warning-only by contract: never throws, never blocks publishing.
 */
import { toHashtagCandidate } from './hashtagCandidateFilter';
import { looksLikeConjugatedVerb } from './koreanFactTokens';

/**
 * Words that carry no promise. Closed list, and deliberately much shorter than
 * koreanFactTokens' COMMON_WORDS: that list exists to keep only *proper nouns*, so it
 * throws away "이유", "내용", "정도" — which is exactly what a homefeed title promises.
 * Only connectives, pronouns and degree adverbs are dropped here.
 */
const FUNCTION_WORDS = new Set([
  '그리고', '하지만', '그러나', '그래서', '그런데', '또한', '다만', '오히려', '게다가',
  '우리', '자신', '여러', '모든', '다른', '많은', '같은', '이런', '그런', '저런', '어떤',
  '정말', '진짜', '너무', '아주', '매우', '특히', '물론', '역시', '바로', '먼저', '다시', '함께',
  '가장', '더욱', '훨씬', '조금', '거의', '결국', '이제', '아직', '항상', '전혀',
  '때문', '통해', '대해', '위해', '관련', '지금', '오늘', '이번',
]);

/** Particles that commonly end a two-letter fragment. */
const PARTICLE_TAILS = new Set(['과', '을', '를', '이', '가', '는', '은', '에', '도', '와', '로', '의', '만']);

/** One title word reduced to the noun it promises, or null when it promises nothing. */
function toPromiseToken(rawWord: string): string | null {
  const core = toHashtagCandidate(rawWord);
  if (!core) return null;
  if (core.length < 2 || core.length > 12) return null;
  if (!/^[가-힣]+$/.test(core)) return null;
  if (FUNCTION_WORDS.has(core)) return null;
  // Conjugated forms are grammar, not promise, and their endings shift between title
  // and body ("있었다" vs "있습니다") so matching them would only invent false gaps.
  if (looksLikeConjugatedVerb(core)) return null;
  if (core.endsWith('다')) return null;
  // A two-letter word ending in a particle is a fragment, not a promise
  // ("오는", "글과"). Longer words already had their particle stripped above.
  if (core.length === 2 && PARTICLE_TAILS.has(core[1])) return null;
  return core;
}

/** Below this share of promised words present in the opening, the title reads unpaid. */
export const PAYOFF_COVERAGE_FLOOR = 0.6;

/** Promises worth judging — one stray word should not fail a title. */
const MIN_PROMISE_TOKENS = 2;

export interface TitlePayoffInput {
  title: string;
  primaryKeyword?: string;
  /** Opening of the article — introduction plus the first section is the honest zone. */
  payoffZone: string;
}

export interface TitlePayoffResult {
  /** False when there was nothing to judge — never warn on absent material. */
  checked: boolean;
  coverage: number;
  promised: string[];
  unpaid: string[];
  message: string;
}

const EMPTY: TitlePayoffResult = {
  checked: false,
  coverage: 0,
  promised: [],
  unpaid: [],
  message: '',
};

const splitWords = (text: string): string[] =>
  String(text || '').split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);

/**
 * Words the title promises, i.e. everything but the keyword.
 *
 * A multi-word keyword is removed word by word: "김윤주 권정열" must not leave
 * "김윤주" behind as if the title had promised it.
 */
export function extractTitlePromise(title: string, primaryKeyword?: string): string[] {
  const keywordTokens = new Set<string>();
  for (const word of splitWords(primaryKeyword || '')) {
    const token = toPromiseToken(word);
    if (token) keywordTokens.add(token);
    keywordTokens.add(word);
  }

  const seen = new Set<string>();
  const promise: string[] = [];
  for (const word of splitWords(title)) {
    const token = toPromiseToken(word);
    if (!token) continue;
    if (keywordTokens.has(token) || keywordTokens.has(word)) continue;
    // A keyword often survives inside a longer word ("택배없는날인데"); the promise
    // must not be the keyword wearing a particle.
    if ([...keywordTokens].some((k) => k.length >= 2 && token.includes(k))) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    promise.push(token);
  }
  return promise;
}

/**
 * Reports which of the title's promises the opening never touches.
 *
 * Substring matching is deliberate: Korean is agglutinative, so "이유" is found
 * inside "이유는" without any stemming.
 */
export function checkTitlePayoff(input: TitlePayoffInput): TitlePayoffResult {
  try {
    const title = String(input?.title || '').trim();
    const zone = String(input?.payoffZone || '').trim();
    if (!title || !zone) return EMPTY;

    const promised = extractTitlePromise(title, input?.primaryKeyword);
    if (promised.length < MIN_PROMISE_TOKENS) return EMPTY;

    const unpaid = promised.filter((token) => !zone.includes(token));
    const coverage = (promised.length - unpaid.length) / promised.length;

    return {
      checked: true,
      coverage,
      promised,
      unpaid,
      // 미상환 낱말은 바닥 아래일 때만 이름을 부른다. 활용형("놀란"→본문 "놀라게")은
      // 형태가 흔들려 한두 개는 늘 어긋나는데, 그걸 매번 경고하면 진짜 신호가 묻힌다.
      message:
        coverage >= PAYOFF_COVERAGE_FLOOR
          ? `제목의 약속 ${promised.length}개 중 ${promised.length - unpaid.length}개를 도입부가 받았다`
          : `제목이 꺼낸 "${unpaid.join('", "')}" 을(를) 도입부가 받지 않았다`,
    };
  } catch {
    return EMPTY; // 검사 실패로 발행을 막지 않는다.
  }
}

/** One log line, or empty when there is nothing worth saying. */
export function describeTitlePayoff(result: TitlePayoffResult): string {
  if (!result?.checked) return '';
  const pct = Math.round(result.coverage * 100);
  return result.coverage >= PAYOFF_COVERAGE_FLOOR
    ? `[TitlePayoff] ✅ 제목 상환 ${pct}% — ${result.message}`
    : `[TitlePayoff] ⚠️ 제목 상환 ${pct}% — ${result.message}`;
}
