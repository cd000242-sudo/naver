/**
 * [2026-09-03 live 224399815476] Sentence-style headings ("출발 전엔 개화와 혼잡을 따로 봐야 해요")
 * kept slipping through the prompt contract; the generator only warned. For search-driven modes
 * (seo / custom / mate / business / homefeed) a heading is a noun phrase or a short question, so
 * offending titles are rewritten once by the engine the user selected (the same route the
 * paraphrase analysis uses — never another vendor's key). Affiliate is excluded — its
 * first-person voice allows sentence headings on purpose.
 *
 * [2026-09-04 measured, 24 posts] Homefeed was excluded outright because its contract allows
 * sentence signposts ("이 조건에서 갈립니다"). The measurement says the allowance became the rule:
 * SEO produced 0 sentence-style headings out of 44, while homefeed ran 4/7, 4/6, 4/5, 3/5. The same
 * contract also forbids making every heading one shape (prompts/homefeed/base.prompt: "모든 소제목을
 * 질문형, 명사형, 같은 길이로 맞추지 않는다"). So homefeed keeps a minority and only the excess is rewritten.
 *
 * Pure parts (prompt / parse / validate) are unit-tested; the network call is injected.
 */
import { isSentenceStyleHeadingTitle } from '../contentBodyTransforms.js';

const MAX_TITLE_CHARS = 26;

export interface HeadingLike {
  readonly title?: unknown;
  readonly content?: unknown;
}

export function isHeadingRepairEligibleMode(mode: unknown): boolean {
  const value = String(mode || '').trim();
  return value !== 'affiliate' && value.length > 0;
}

/** Sentence-style headings a mode may keep. Homefeed keeps a minority; search modes keep none. */
export function sentenceStyleAllowance(mode: unknown, total: number): number {
  const count = Math.max(0, Math.floor(total));
  return String(mode || '').trim() === 'homefeed' ? Math.floor(count / 2) : 0;
}

/**
 * [2026-09-04 measured] 3 of 8 SEO posts opened with a fragment heading — "의 출발점", "의 핵심",
 * "세 가지" — the model dropped the keyword it was told not to repeat and left the tail. A lone
 * particle token ("… 의 …") or a title under 4 characters cannot be a heading; it takes the same
 * rewrite as a sentence-style title.
 */
const LONE_PARTICLE_TOKEN_RE = /(^|\s)(의|은|는|이|가|을|를|과|와|도|에|로|에서|부터|까지)(\s|$)/u;

/** A title that is nothing but a count ("세 가지") lost the noun the count belonged to. */
const BARE_QUANTIFIER_RE = /^(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|\d+)\s*(가지|곳|개|군데|단계|줄|번)$/u;

export function isFragmentHeadingTitle(title: string): boolean {
  const cleaned = String(title || '').trim();
  if (cleaned.length === 0) return false;
  return cleaned.length < 4 || LONE_PARTICLE_TOKEN_RE.test(cleaned) || BARE_QUANTIFIER_RE.test(cleaned);
}

export function collectSentenceStyleHeadingIndexes(headings: readonly HeadingLike[]): number[] {
  return headings
    .map((heading, index) => ({ index, title: String(heading?.title || '').trim() }))
    .filter(({ title }) => title.length > 0 && (isSentenceStyleHeadingTitle(title) || isFragmentHeadingTitle(title)))
    .map(({ index }) => index);
}

/**
 * Which headings this mode actually sends for a rewrite. Fragments always go — no mode wants
 * "의 출발점". Sentence-style titles go only beyond the mode's allowance, earliest kept first, so a
 * homefeed post keeps its opening signposts and loses the ones that made every heading one shape.
 */
export function selectHeadingRepairTargets(headings: readonly HeadingLike[], mode: unknown): number[] {
  const titled = headings.map((heading, index) => ({ index, title: String(heading?.title || '').trim() }));
  const fragments = titled.filter(({ title }) => title.length > 0 && isFragmentHeadingTitle(title)).map(({ index }) => index);
  const sentences = titled
    .filter(({ title }) => title.length > 0 && isSentenceStyleHeadingTitle(title) && !isFragmentHeadingTitle(title))
    .map(({ index }) => index);
  const excess = sentences.slice(sentenceStyleAllowance(mode, titled.length));
  return [...fragments, ...excess].sort((a, b) => a - b);
}

export function buildHeadingRepairPrompt(titles: readonly string[], keyword: string, mode?: unknown): string {
  const list = titles.map((title, index) => `${index + 1}. ${title}`).join('\n');
  const isHomefeed = String(mode || '').trim() === 'homefeed';
  return [
    '다음은 블로그 글의 소제목인데 문장처럼 끝나거나 앞이 잘려("의 출발점"처럼 조사로 시작) 소제목으로 어색하다. 각각을 다시 써라.',
    isHomefeed
      ? `- 형식: 명사구 또는 짧은 질문형(예: "계약 전에 볼 세 가지", "이사 당일엔 뭐가 먼저?"). 12~${MAX_TITLE_CHARS}자.`
      : `- 형식: 명사구 또는 짧은 질문형(예: "출발 전 개화·혼잡 확인", "당일치기와 1박 중 어느 쪽?"). 12~${MAX_TITLE_CHARS}자.`,
    '- "~해요", "~합니다", "~돼요", "~입니다" 같은 서술어로 끝내지 않는다.',
    isHomefeed
      ? '- 피드에서 읽히는 글이다. "개요·정리·총정리·알아보기·결론" 같은 검색 목차형 라벨을 쓰지 않는다. 독자가 겪는 상황이나 갈리는 지점이 그대로 보이게 한다.'
      : (keyword ? `- 메인 키워드 "${keyword}" 는 자연스러울 때만 넣고 억지로 넣지 않는다.` : ''),
    '- 뜻은 그대로. 새 정보를 보태지 않는다. 번호와 순서를 지킨다.',
    '- 출력은 JSON 배열 하나만: ["소제목1", "소제목2", ...]',
    '',
    list,
  ].filter(Boolean).join('\n');
}

export function parseHeadingRepairResponse(raw: string, expectedCount: number): string[] | null {
  const text = String(raw || '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) return null;
  const titles = parsed.map((value) => String(value || '').replace(/^\s*\d+[.)]\s*/, '').replace(/[.!?。]+$/u, '').trim());
  const valid = titles.every((title) => title.length >= 4 && title.length <= MAX_TITLE_CHARS + 4 && !isSentenceStyleHeadingTitle(title) && !isFragmentHeadingTitle(title));
  return valid ? titles : null;
}

export interface HeadingRepairDeps {
  readonly complete: (prompt: string) => Promise<string>;
  readonly log?: (message: string) => void;
}

/** Returns a new content object with sentence-style headings rewritten; the original on any failure. */
export async function repairSentenceStyleHeadings<T extends { headings?: readonly HeadingLike[] }>(
  content: T,
  options: { readonly mode?: unknown; readonly keyword?: string },
  deps: HeadingRepairDeps,
): Promise<T> {
  if (!isHeadingRepairEligibleMode(options.mode)) return content;
  const headings = Array.isArray(content?.headings) ? content.headings : [];
  const indexes = selectHeadingRepairTargets(headings, options.mode);
  if (indexes.length === 0) return content;
  const titles = indexes.map((index) => String(headings[index]?.title || '').trim());
  const log = deps.log ?? (() => undefined);
  try {
    const raw = await deps.complete(buildHeadingRepairPrompt(titles, String(options.keyword || '').trim(), options.mode));
    const repaired = parseHeadingRepairResponse(raw, titles.length);
    if (!repaired) {
      log(`[HeadingRepair] ⚠️ 응답을 쓸 수 없어 원래 소제목 유지 (${titles.length}개)`);
      return content;
    }
    const nextHeadings = headings.map((heading, index) => {
      const position = indexes.indexOf(index);
      return position < 0 ? heading : { ...heading, title: repaired[position] };
    });
    indexes.forEach((index, position) => log(`[HeadingRepair] ✏️ "${titles[position]}" → "${repaired[position]}"`));
    return { ...content, headings: nextHeadings };
  } catch (error) {
    log(`[HeadingRepair] ⚠️ 선택 엔진 호출 실패 — 원래 소제목 유지: ${(error as Error)?.message || error}`);
    return content;
  }
}
