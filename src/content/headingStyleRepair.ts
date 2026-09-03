/**
 * [2026-09-03 live 224399815476] Sentence-style headings ("출발 전엔 개화와 혼잡을 따로 봐야 해요")
 * kept slipping through the prompt contract; the generator only warned. For search-driven modes
 * (seo / custom / mate / business / homefeed) a heading is a noun phrase or a short question, so
 * offending titles are rewritten once by the engine the user selected (the same route the
 * paraphrase analysis uses — never another vendor's key). Affiliate is excluded — its
 * first-person voice allows sentence headings on purpose. Homefeed is excluded too: its heading
 * contract (shared/headings-homefeed.prompt) uses sentence signposts ("이 조건에서 갈립니다") by design.
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
  return value !== 'affiliate' && value !== 'homefeed' && value.length > 0;
}

export function collectSentenceStyleHeadingIndexes(headings: readonly HeadingLike[]): number[] {
  return headings
    .map((heading, index) => ({ index, title: String(heading?.title || '').trim() }))
    .filter(({ title }) => title.length > 0 && isSentenceStyleHeadingTitle(title))
    .map(({ index }) => index);
}

export function buildHeadingRepairPrompt(titles: readonly string[], keyword: string): string {
  const list = titles.map((title, index) => `${index + 1}. ${title}`).join('\n');
  return [
    '다음은 블로그 글의 소제목인데 문장처럼 끝나 소제목으로 어색하다. 각각을 검색용 소제목으로 다시 써라.',
    `- 형식: 명사구 또는 짧은 질문형(예: "출발 전 개화·혼잡 확인", "당일치기와 1박 중 어느 쪽?"). 12~${MAX_TITLE_CHARS}자.`,
    '- "~해요", "~합니다", "~돼요", "~입니다" 같은 서술어로 끝내지 않는다.',
    keyword ? `- 메인 키워드 "${keyword}" 는 자연스러울 때만 넣고 억지로 넣지 않는다.` : '',
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
  const valid = titles.every((title) => title.length >= 4 && title.length <= MAX_TITLE_CHARS + 4 && !isSentenceStyleHeadingTitle(title));
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
  const indexes = collectSentenceStyleHeadingIndexes(headings);
  if (indexes.length === 0) return content;
  const titles = indexes.map((index) => String(headings[index]?.title || '').trim());
  const log = deps.log ?? (() => undefined);
  try {
    const raw = await deps.complete(buildHeadingRepairPrompt(titles, String(options.keyword || '').trim()));
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
