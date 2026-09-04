/**
 * SPEC-BLUEPRINT-2026 Phase 3 — put a verified quote into a body that came back with none.
 *
 * A full regeneration to earn one quotation costs a whole body call. This asks the selected engine
 * a short question instead: which paragraph, which quote, one bridging sentence. The quote text is
 * checked byte-for-byte after the model answers, so the patch can never alter what someone said.
 */
import type { BlueprintQuote } from './blueprintSchema';
import { escapeUnescapedQuotes } from './parseBlueprint';

export interface QuoteInsertionHeading {
  readonly title: string;
  readonly content: string;
}

export interface QuoteInsertionInput {
  readonly headings: readonly QuoteInsertionHeading[];
  readonly quotes: readonly BlueprintQuote[];
  readonly maxInsertions?: number;
}

export interface QuoteInsertion {
  readonly heading: number;
  readonly afterParagraph: number;
  readonly sentence: string;
}

export interface QuoteInsertionResult {
  readonly headings: QuoteInsertionHeading[];
  readonly inserted: number;
  readonly reason: 'ok' | 'no-input' | 'unparsable' | 'rejected' | 'error' | 'timeout';
}

export const QUOTE_INSERTION_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_INSERTIONS = 2;
const BRIDGE_MAX_EXTRA_CHARS = 120;

function paragraphsOf(content: string): string[] {
  return String(content || '').split(/\n+/u).map((p) => p.trim()).filter(Boolean);
}

export function buildQuoteInsertionPrompt(input: QuoteInsertionInput): string {
  const max = input.maxInsertions ?? DEFAULT_MAX_INSERTIONS;
  const headings = input.headings.map((h, i) => {
    const paras = paragraphsOf(h.content).map((p, j) => `    (${j}) ${p}`).join('\n');
    return `  [${i}] ${h.title}\n${paras}`;
  }).join('\n');
  const quotes = input.quotes.map((q, i) => `  ${i}. "${q.text}"${q.speaker ? ` — ${q.speaker}` : ''}`).join('\n');
  return [
    `아래 본문에는 당사자 발언 인용이 없다. 아래 [발언] 중 최대 ${max}개를 가장 어울리는 문단 뒤에 한 문장으로 넣어라. JSON 하나만 출력한다.`,
    '',
    '[규칙]',
    '- sentence 는 발언 원문을 큰따옴표 안에 한 글자도 바꾸지 않고 넣고, 앞뒤에 발언자와 짧은 연결만 붙인다(예: 담당자는 "…"라고 말했다).',
    '- 발언 하나당 한 번만. 해설·평가·새 사실을 덧붙이지 않는다.',
    '- heading 은 [번호], afterParagraph 는 (번호). 그 문단 바로 뒤에 새 문단으로 들어간다.',
    '- 어울리는 자리가 없으면 insertions 를 빈 배열로.',
    '',
    '[출력 형식]',
    '{"insertions":[{"quote":0,"heading":0,"afterParagraph":0,"sentence":"…"}]}',
    '',
    '[발언]',
    quotes,
    '',
    '[본문]',
    headings,
  ].join('\n');
}

function normalizeQuoteMarks(value: string): string {
  return String(value || '').replace(/[“”]/gu, '"');
}

function parseInsertions(raw: string): Array<{ quote: number; heading: number; afterParagraph: number; sentence: string }> | null {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    try {
      parsed = JSON.parse(escapeUnescapedQuotes(body));
    } catch {
      return null;
    }
  }
  const list = (parsed as { insertions?: unknown })?.insertions;
  if (!Array.isArray(list)) return null;
  return list.map((item) => ({
    quote: Number((item as Record<string, unknown>)?.quote),
    heading: Number((item as Record<string, unknown>)?.heading),
    afterParagraph: Number((item as Record<string, unknown>)?.afterParagraph),
    sentence: String((item as Record<string, unknown>)?.sentence ?? '').trim(),
  }));
}

/** Apply the model's answer; every insertion must carry one of the given quotes verbatim. */
export function applyQuoteInsertions(input: QuoteInsertionInput, raw: string): { headings: QuoteInsertionHeading[]; inserted: number; parsed: boolean } {
  const list = parseInsertions(raw);
  if (!list) return { headings: [...input.headings], inserted: 0, parsed: false };
  const max = input.maxInsertions ?? DEFAULT_MAX_INSERTIONS;
  const usedQuotes = new Set<number>();
  const perHeading = input.headings.map((h) => paragraphsOf(h.content));
  let inserted = 0;
  for (const item of list) {
    if (inserted >= max) break;
    const quote = input.quotes[item.quote];
    if (!quote || usedQuotes.has(item.quote)) continue;
    const paras = perHeading[item.heading];
    if (!paras) continue;
    const sentence = normalizeQuoteMarks(item.sentence);
    if (!sentence.includes(`"${normalizeQuoteMarks(quote.text)}"`)) continue;
    if (sentence.length > quote.text.length + BRIDGE_MAX_EXTRA_CHARS) continue;
    const at = Number.isFinite(item.afterParagraph) ? Math.min(Math.max(item.afterParagraph, -1), paras.length - 1) : paras.length - 1;
    paras.splice(at + 1, 0, sentence);
    usedQuotes.add(item.quote);
    inserted += 1;
  }
  return {
    headings: input.headings.map((h, i) => ({ title: h.title, content: perHeading[i].join('\n\n') })),
    inserted,
    parsed: true,
  };
}

export interface QuoteInsertionDeps {
  readonly complete: (prompt: string, options?: { maxTokens?: number }) => Promise<string>;
  readonly log?: (message: string) => void;
  readonly timeoutMs?: number;
}

export async function runQuoteInsertionPatch(input: QuoteInsertionInput, deps: QuoteInsertionDeps): Promise<QuoteInsertionResult> {
  const log = deps.log ?? (() => undefined);
  if (input.headings.length === 0 || input.quotes.length === 0) {
    return { headings: [...input.headings], inserted: 0, reason: 'no-input' };
  }
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('QUOTE_PATCH_TIMEOUT')), deps.timeoutMs ?? QUOTE_INSERTION_TIMEOUT_MS);
      deps.complete(buildQuoteInsertionPrompt(input), { maxTokens: 1024 }).then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
    const applied = applyQuoteInsertions(input, raw);
    if (!applied.parsed) {
      log('[Blueprint] ⚠️ 인용 삽입 응답을 읽을 수 없어 생략');
      return { headings: applied.headings, inserted: 0, reason: 'unparsable' };
    }
    if (applied.inserted === 0) {
      log('[Blueprint] 인용 삽입: 모델이 자리를 찾지 못했거나 발언을 바꿔 써서 생략');
      return { headings: applied.headings, inserted: 0, reason: 'rejected' };
    }
    return { headings: applied.headings, inserted: applied.inserted, reason: 'ok' };
  } catch (error) {
    const timeout = (error as Error)?.message === 'QUOTE_PATCH_TIMEOUT';
    log(`[Blueprint] ⚠️ 인용 삽입 ${timeout ? '타임아웃' : `실패: ${(error as Error)?.message || error}`} — 생략`);
    return { headings: [...input.headings], inserted: 0, reason: timeout ? 'timeout' : 'error' };
  }
}
