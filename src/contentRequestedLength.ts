// src/contentRequestedLength.ts
// The body length a user wrote in the request field ("1500~2000자 이상 적어주세요").
// The app's own contract is "length is a result, there is no character count to fill" (2026-08-26). A count the user
// typed is their instruction, so it replaces that sentence for this post only (owner, 2026-11-25). Prompt-only: a short
// result is still never regenerated or blocked.
// No imports: contentRequestSections and contentJsonPromptFormat both use this file.

export type RequestedBodyLength =
  | { readonly kind: 'atLeast'; readonly min: number }
  | { readonly kind: 'atMost'; readonly max: number }
  | { readonly kind: 'range'; readonly min: number; readonly max: number }
  | { readonly kind: 'around'; readonly target: number; readonly min: number; readonly max: number };

/** Start of the app's homefeed editorial block appended to customPrompt (same text as DAILY_EDITORIAL_MARKER). */
const APP_EDITORIAL_MARKER = '[DAILY HOMEFEED EDITORIAL]';
/** A post body is never this short or this long; smaller counts are titles, headings or paragraphs. */
const BODY_MIN = 500;
const BODY_MAX = 20000;
const NUMBER = '(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(천|만)?';
// "자" of a count, not the start of a word (2000자료, 3000자동 …). Particles and "이상/내외" may follow directly.
const UNIT = '\\s*(?:글자|자)(?![동료격리녀산본금신연유체주세막극랑기])';
const RANGE_OR_SINGLE = new RegExp(`${NUMBER}(?:\\s*(?:글자|자))?\\s*(?:[~\\-–—]|에서|부터)\\s*${NUMBER}${UNIT}|${NUMBER}${UNIT}`, 'g');
/** A count that directly follows one of these words ("제목은 30자", "문단마다 600자") is about that part, not the body. */
const OTHER_PART = /(제목|소제목|문단|단락|문장|한\s*줄|요약|도입부?|서론|결론|마무리|댓글|해시태그|메타|설명란|썸네일|캡션)(?:은|는|이|가|을|를|의|도|마다|당|별로?)?\s*(?:약|최대|최소|각각?)?\s*$/;
const AT_LEAST = /^\s*(?:이상|넘게|넘는|넘도록|초과)/;
const AT_MOST = /^\s*(?:이내|이하|미만|안으로|안쪽|(?:을|를)?\s*넘지)/;

function toNumber(digits: string | undefined, unit: string | undefined): number {
  const value = Number(String(digits || '').replace(/,/g, ''));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * (unit === '천' ? 1000 : unit === '만' ? 10000 : 1));
}

const inBodyRange = (value: number): boolean => value >= BODY_MIN && value <= BODY_MAX;

/** The first body-length request in the user's own text; null when there is none. */
export function parseRequestedBodyLength(prompt: string | undefined): RequestedBodyLength | null {
  const whole = String(prompt || '');
  const cut = whole.indexOf(APP_EDITORIAL_MARKER);
  const text = cut >= 0 ? whole.slice(0, cut) : whole;
  for (const match of text.matchAll(RANGE_OR_SINGLE)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 20), match.index ?? 0);
    if (OTHER_PART.test(before)) continue;
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 10);
    if (match[3] !== undefined) {
      const low = toNumber(match[1], match[2] ?? match[4]);
      const high = toNumber(match[3], match[4]);
      if (!inBodyRange(low) || !inBodyRange(high) || high < low) continue;
      if (AT_LEAST.test(after)) return { kind: 'atLeast', min: low };
      return { kind: 'range', min: low, max: high };
    }
    const value = toNumber(match[5], match[6]);
    if (!inBodyRange(value)) continue;
    if (AT_LEAST.test(after)) return { kind: 'atLeast', min: value };
    if (AT_MOST.test(after)) return { kind: 'atMost', max: value };
    return { kind: 'around', target: value, min: Math.round(value * 0.9), max: Math.round(value * 1.1) };
  }
  return null;
}

const count = (value: number): string => value.toLocaleString('en-US');

export function describeRequestedLength(length: RequestedBodyLength): string {
  if (length.kind === 'atLeast') return `${count(length.min)}자 이상`;
  if (length.kind === 'atMost') return `${count(length.max)}자 이내`;
  if (length.kind === 'range') return `${count(length.min)}~${count(length.max)}자`;
  return `${count(length.target)}자 안팎(${count(length.min)}~${count(length.max)}자)`;
}

/** Item 1 of the final conditions when the user gave a count (replaces "length is a result"). */
export function buildRequestedLengthContract(length: RequestedBodyLength): string {
  return `
1. 사용자가 본문 분량을 직접 지정했다: ${describeRequestedLength(length)}. 이 요구는 seo R0-5("채워야 할 글자수는 없다")보다 우선한다.
   본문(모든 소제목의 content 를 합친 글자 수, 공백 포함)이 이 분량이 되도록 쓴다. 출력 전에 글자 수를 세어 확인한다.
   분량은 소제목마다 근거 · 조건 · 예시 · 주의할 점 · 다음 행동을 더 풀어서 채우고, 모자라면 소제목을 늘린다.
   같은 말을 바꿔 반복하거나 일반론을 붙여 늘리지 않는다. 자료에 없는 사실을 지어내 늘리지도 않는다.`;
}

/** One line for the reminder block at the very end of the prompt. */
export function buildRequestedLengthReminder(length: RequestedBodyLength): string {
  return `본문 분량: ${describeRequestedLength(length)} (공백 포함) — 사용자가 직접 지정한 분량이다. 모자라거나 넘치면 맞춘 뒤에 출력한다.`;
}

/** The reminder block with the requested length added as its last line; unchanged when there is no block or no count. */
export function appendRequestedLengthReminder(block: string, prompt: string | undefined): string {
  const length = block ? parseRequestedBodyLength(prompt) : null;
  return length ? [block, buildRequestedLengthReminder(length)].join('\n') : block;
}

/** The working length target (timeouts, output budget, warning line): raised to the requested minimum, never lowered. */
export function raiseMinCharsForRequest(minChars: number, prompt: string | undefined): number {
  const length = parseRequestedBodyLength(prompt);
  if (!length || length.kind === 'atMost') return minChars;
  return Math.max(minChars, length.min);
}
