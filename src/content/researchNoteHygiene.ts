/**
 * [2026-09-03 self-run 08:06] The Perplexity research note is a chat answer, not a document:
 * it opened with "아래 자료는 … 리서치 노트입니다" and closed with an offer —
 * "원하시면 다음 단계로 … 1) 블로그 SEO용 제목 20개 …". Both went into the prompt as
 * material, and "SEO용 제목 20개처럼 후보를 많이 늘어놓는 것보다" surfaced in the article body
 * (twice across runs). The prompt now forbids the chatter; this strips it deterministically
 * in case the model ignores the rule. Only the first and last paragraphs are examined —
 * facts in the middle are never touched.
 */
const MAX_META_PARAGRAPH_CHARS = 400;

const INTRO_META = /^(?:아래|다음은|다음|이 자료는|본 자료는)[^\n]{0,200}?(?:정리|리서치|자료|참고)[^\n]{0,200}?(?:입니다|습니다|했습니다|드립니다)[.。]?$/u;
const OFFER_OPENER = /^(?:원하시면|원하신다면|필요하시면|필요하다면|필요하시다면|추가로 원하|더 필요하|다음 단계로|이어서 원하|말씀해 주시면|말씀해주시면)/u;
const SIGN_OFF = /^(?:도움이 되셨|참고가 되셨|감사합니다|이상으로|이상입니다)/u;

function splitParagraphs(text: string): string[] {
  return text.replace(/\r\n/gu, '\n').split(/\n\s*\n/u);
}

function isIntroMeta(paragraph: string): boolean {
  const compact = paragraph.replace(/\*\*/gu, '').replace(/\s+/gu, ' ').trim();
  return compact.length <= MAX_META_PARAGRAPH_CHARS && !compact.startsWith('#') && INTRO_META.test(compact);
}

function isOfferOrSignOff(paragraph: string): boolean {
  const compact = paragraph.replace(/\*\*/gu, '').replace(/\s+/gu, ' ').trim();
  if (compact.length > MAX_META_PARAGRAPH_CHARS || compact.startsWith('#')) return false;
  return OFFER_OPENER.test(compact) || SIGN_OFF.test(compact);
}

/** Drops assistant chatter from a research note: an intro "아래 자료는 …입니다" and a trailing offer / sign-off. */
export function stripResearchNoteChatter(text: string): string {
  const source = String(text || '');
  if (!source.trim()) return source;
  const paragraphs = splitParagraphs(source);
  let start = 0;
  let end = paragraphs.length;
  if (paragraphs.length > 1 && isIntroMeta(paragraphs[0])) start = 1;
  while (end - start > 1 && isOfferOrSignOff(paragraphs[end - 1])) end -= 1;
  if (start === 0 && end === paragraphs.length) return source;
  return paragraphs.slice(start, end).join('\n\n').trim();
}
