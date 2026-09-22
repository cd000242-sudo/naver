/**
 * [2026-09-03 사장님 지적 ④ "검색 결과는 본문에 왜 있는 거니"] The prompt bans narrating the
 * material list ("검색 결과에는 …글도 남아 있습니다"), but gpt-4.1 still wrote "막상 검색 결과에는
 * 나이와 개인소득, 가구소득을 함께 언급하는 내용이 섞여 있죠." in a keyword post. A sentence that
 * talks about *what the search results / materials contain* is about the tool's inputs, not the
 * reader's question, so it is dropped deterministically at finalize. Only whole sentences that
 * open on the material are removed; a sentence quoting a fact is untouched.
 */
// [2026-09-22 attribution guard] Only internal-marker narration (talking about the tool's own
// inputs — search results, collected material, numbered/id'd internal source refs) is deleted
// here. Real attributions like "공식 가이드에 따르면" are NOT this module's concern — they are
// evaluated by attributionGuard/contentClaimSanitizer, which strip only the phrase and keep
// the claim rather than deleting the whole sentence.
const MATERIAL_NARRATION_RE = /(?:검색\s?결과(?:에는|를 보면|에서는|만 보면)|검색하면 나오는 글|자료(?:에는|를 보면|에서는)|참고 자료에|수집한 자료|작성된 글도 남아|자료\s*\d+|\bS\d{2}\b)/u;
const SENTENCE_SPLIT_RE = /(?<=[.!?。])\s+/u;
const MIN_PARAGRAPH_CHARS_AFTER_STRIP = 12;

export function isMaterialNarrationSentence(sentence: string): boolean {
  return MATERIAL_NARRATION_RE.test(sentence);
}

/** Drops material-narration sentences from one paragraph; returns it unchanged when nothing matched. */
export function stripMaterialNarrationFromParagraph(paragraph: string): string {
  const sentences = paragraph.split(SENTENCE_SPLIT_RE);
  if (sentences.length === 0) return paragraph;
  const kept = sentences.filter((sentence) => !isMaterialNarrationSentence(sentence));
  if (kept.length === sentences.length) return paragraph;
  const joined = kept.join(' ').trim();
  // Never hollow a paragraph out to a stub — keep the original if almost nothing remains.
  return joined.length >= MIN_PARAGRAPH_CHARS_AFTER_STRIP ? joined : paragraph;
}

export function stripMaterialNarration(text: string): string {
  if (!text) return text;
  return text.split('\n').map((line) => (line.trim() ? stripMaterialNarrationFromParagraph(line) : line)).join('\n');
}

/** Same behavior as `stripMaterialNarration` but also reports the removed sentences. */
export function stripMaterialNarrationWithReport(text: string): { text: string; removed: string[] } {
  if (!text) return { text, removed: [] };
  const removed: string[] = [];
  const out = text
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line;
      const sentences = line.split(SENTENCE_SPLIT_RE);
      const droppedThisLine: string[] = [];
      const kept = sentences.filter((sentence) => {
        if (isMaterialNarrationSentence(sentence)) {
          droppedThisLine.push(sentence.trim());
          return false;
        }
        return true;
      });
      if (droppedThisLine.length === 0) return line;
      const joined = kept.join(' ').trim();
      // Never hollow a paragraph out to a stub — keep the original if almost nothing remains.
      if (joined.length < MIN_PARAGRAPH_CHARS_AFTER_STRIP) return line;
      removed.push(...droppedThisLine);
      return joined;
    })
    .join('\n');
  return { text: out, removed };
}

interface ContentLike {
  readonly headings?: ReadonlyArray<{ readonly title?: unknown; readonly content?: unknown }>;
  readonly introduction?: unknown;
  readonly conclusion?: unknown;
  readonly bodyPlain?: unknown;
}

function stripIfString(value: unknown): unknown {
  return typeof value === 'string' ? stripMaterialNarration(value) : value;
}

/** Returns a new content object with material-narration sentences removed from every body field. */
export function stripMaterialNarrationFromContent<T extends ContentLike>(content: T): T {
  if (!content) return content;
  const headings = Array.isArray(content.headings)
    ? content.headings.map((heading) => ({ ...heading, content: stripIfString(heading.content) }))
    : content.headings;
  return {
    ...content,
    headings,
    introduction: stripIfString(content.introduction),
    conclusion: stripIfString(content.conclusion),
    bodyPlain: stripIfString(content.bodyPlain),
  };
}
