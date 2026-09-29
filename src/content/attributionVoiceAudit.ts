/**
 * Document-narrator voice audit.
 *
 * Policy: confirmed facts must be stated flat. ONLY actor-subject attribution is allowed
 * ("소속사 측은 ~라고 밝혔다", "국토교통부 발표에 따르면", "구매자 후기에서 반복해 나온 지적은").
 * Document-as-speaker forms ("~라고 적혀 있습니다", "읽는 편이 맞겠습니다") reveal the writer is
 * relaying a source document instead of stating the fact directly — the reader is told to go
 * read the material rather than being told the material's content.
 *
 * This module is LOG-ONLY: no repair, no LLM call, no publish block. It only reports.
 */

export type AttributionVoiceKind = 'document-speaker' | 'reading-advice' | 'source-relay';

export interface AttributionVoiceHit {
  kind: AttributionVoiceKind;
  sentence: string;
  match: string;
}

export interface AttributionVoiceReport {
  hits: AttributionVoiceHit[];
  count: number;
  kinds: AttributionVoiceKind[];
}

/**
 * The writer quotes a document as if the document itself spoke ("~라고 적혀 있다").
 * "에 따르면" is only flagged when the noun immediately before it is a document/text noun
 * (기사, 자료, 공지, 안내문, 원문, 본문, 보도 내용, 보도자료, 글, 포스팅, 블로그) — NOT an
 * institution or media outlet name like "국토교통부" or "OO일보".
 */
const DOCUMENT_SPEAKER_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:라|다)?고\s*적혀\s*있/u,
  /(?:라|다)?고\s*나와\s*있/u,
  /(?:라|다)?고\s*안내되어\s*있/u,
  // "되어 있" alone is ordinary state ("설치가 잘 되어 있다"); only the quoted form is document voice.
  /(?:라|다)고\s*되어\s*있/u,
  /(?:라|다)?고\s*쓰여\s*있/u,
  /(?:라|다)?고\s*명시되어\s*있/u,
  /(?:라|다)?고\s*표기되어\s*있/u,
  /본문에는[^.!?]*(?:라고|다고)/u,
  /해당\s*(?:보도|기사)(?:는|가)[^.!?]*(?:라고|다고)\s*전(?:했|한)다/u,
  /(?:기사|자료|공지|안내문|원문|본문|보도\s*내용|보도자료|기사\s*내용|글|포스팅|블로그)에\s*따르면/u,
  /(?:기사|자료)를\s*보면/u,
  /원문을\s*(?:읽어\s*보면|보면)/u,
  /내용을\s*확인해\s*보면/u,
]);

/**
 * The writer tells the reader to go read the material instead of stating its content.
 * Anchored to reading/checking verbs — plain advice ("사는 편이 좋다") is the writer's own
 * judgement and stays untouched.
 */
const READING_ADVICE_PATTERNS: readonly RegExp[] = Object.freeze([
  /(?:읽|읽어\s*보|참고하|확인해\s*보|확인하|살펴보|찾아보)(?:는|시는)\s*편이\s*(?:맞|좋|낫)/u,
  /참고하시기\s*바랍/u,
  /확인해\s*보시기\s*바랍/u,
]);

/** A fact is relayed with no actor attached — passive voice, no subject to attribute to. */
const SOURCE_RELAY_PATTERNS: readonly RegExp[] = Object.freeze([
  // "전해지다" honorific contracts to "전해집니다" (지 + ㅂ니다 -> 집니다), so match both forms.
  /(?:라고|다고)\s*전해(?:지|집)/u,
  /(?:라고|다고)\s*알려져\s*있/u,
  /(?:라고|다고)\s*소개되어\s*있/u,
  /(?:으)?로\s*소개됐다/u,
  /(?:라고|다고)\s*언급되어\s*있/u,
]);

const KIND_PATTERNS: readonly [AttributionVoiceKind, readonly RegExp[]][] = [
  ['document-speaker', DOCUMENT_SPEAKER_PATTERNS],
  ['reading-advice', READING_ADVICE_PATTERNS],
  ['source-relay', SOURCE_RELAY_PATTERNS],
];

const MAX_REPORTED = 5;

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/gu, ' ');
}

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

function scanSentence(
  sentence: string,
  kind: AttributionVoiceKind,
  patterns: readonly RegExp[],
  seen: Set<string>,
  hits: AttributionVoiceHit[],
): void {
  const key = `${kind}::${sentence}`;
  if (seen.has(key)) return;
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (!match) continue;
    seen.add(key);
    hits.push({ kind, sentence, match: match[0] });
    break;
  }
}

export function auditAttributionVoice(text: string): AttributionVoiceReport {
  const body = stripHtml(String(text ?? ''));
  const sentences = splitSentences(body);
  const hits: AttributionVoiceHit[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    for (const [kind, patterns] of KIND_PATTERNS) {
      scanSentence(sentence, kind, patterns, seen, hits);
    }
  }
  const kinds = Array.from(new Set(hits.map((h) => h.kind)));
  return { hits, count: hits.length, kinds };
}

const quote = (s: string) => `"${s.length > 120 ? `${s.slice(0, 120)}…` : s}"`;

export function describeAttributionVoice(report: AttributionVoiceReport): string {
  if (!report || report.count === 0) return '';
  const shown = report.hits.slice(0, MAX_REPORTED).map((h) => quote(h.sentence)).join(', ');
  return `[AttributionVoice] ⚠️ 자료를 화자로 세운 문장 ${report.count}건 — ${shown}`;
}
