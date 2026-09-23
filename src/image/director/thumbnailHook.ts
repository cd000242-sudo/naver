/**
 * SPEC-NAVER-IMAGE-2026 — the short number phrase a thumbnail card can carry (숫자형 썸네일).
 *
 * A home-feed thumbnail is about 200px wide on a phone. A 40-character title is unreadable there;
 * a 6–12 character number phrase is not. Deterministic: only words that literally appear in the
 * title or card promise are used, so the card can never state a number the article does not.
 */

export interface ThumbnailHook {
  readonly main: string;
}

const NUMBER_PHRASE =
  /\d[\d,.]*\s*(?:만|억|천)?\s*원|\d+(?:\.\d+)?\s*%|\d{1,2}월\s*\d{1,2}일|\d+(?:\.\d+)?\s*(?:년|개월|주|일|시간|분|명|개|곳|가지|배|위|번|회|세|살|kg|km|평|층|점|만)/gu;
const YEAR_ONLY = /^(?:19|20)\d{2}\s*년$/u;
const CLAUSE_BREAK = /[,，·|/…!?]|\s[-–—]\s/u;
export const HOOK_MAX_CHARS = 12;

// Endings that make an edge word read as an unfinished sentence on a card. One-syllable particles are
// only trimmed from longer words: "출고가"·"가격이" are nouns, "강도범이" carries a particle.
const EDGE_ENDING = /(?:하며|하고|해서|하면|했다|한다|하는|했던|되는|받은|받는|에서|에게|까지|부터|으로|이다|였다)$/u;
const EDGE_PARTICLE = /(?:을|를|이|가|은|는|의|도|에|로)$/u;
const NUMBER_PARTICLE = /(?:을|를|이|가|은|는|의|도|에|로|으로|까지|부터)$/u;

function trimEdge(word: string): string {
  if (word.length <= 2) return word;
  const ending = word.replace(EDGE_ENDING, '');
  if (ending !== word) return ending.length >= 2 ? ending : word;
  return word.length >= 4 ? word.replace(EDGE_PARTICLE, '') : word;
}

function clauseAround(text: string, index: number): { clause: string; offset: number } {
  let start = 0;
  let end = text.length;
  for (let i = index - 1; i >= 0; i--) {
    if (CLAUSE_BREAK.test(text[i])) { start = i + 1; break; }
  }
  for (let i = index; i < text.length; i++) {
    if (CLAUSE_BREAK.test(text[i])) { end = i; break; }
  }
  return { clause: text.slice(start, end), offset: start };
}

function hookFrom(text: string): ThumbnailHook | null {
  const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
  if (!normalized) return null;
  const match = [...normalized.matchAll(NUMBER_PHRASE)].find((m) => !YEAR_ONLY.test(m[0].trim()));
  if (!match || match.index === undefined) return null;

  const { clause, offset } = clauseAround(normalized, match.index);
  const words = clause.trim().split(' ').filter(Boolean);
  const relative = match.index - offset - (clause.length - clause.trimStart().length);
  let cursor = 0;
  let pivot = 0;
  for (let i = 0; i < words.length; i++) {
    if (relative >= cursor && relative < cursor + words[i].length + 1) { pivot = i; break; }
    cursor += words[i].length + 1;
  }
  const pieces = new Map<number, string>([[pivot, words[pivot].replace(NUMBER_PARTICLE, '')]]);
  const join = () => [...pieces.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => w).join(' ');
  let left = pivot - 1;
  let right = pivot + 1;
  let grew = true;
  while (grew) {
    grew = false;
    for (const side of ['right', 'left'] as const) {
      const index = side === 'right' ? right : left;
      if (index < 0 || index >= words.length) continue;
      pieces.set(index, trimEdge(words[index]));
      if (join().length > HOOK_MAX_CHARS) { pieces.delete(index); continue; }
      if (side === 'right') right++; else left--;
      grew = true;
    }
  }
  // A trailing modifier ("받는", "하던", "신청할") reads as an unfinished phrase on a card — drop it.
  for (let index = Math.max(...pieces.keys()); index > pivot; index--) {
    const word = pieces.get(index);
    if (!word || !DANGLING_MODIFIER.test(word)) break;
    pieces.delete(index);
  }
  // A leading connective ("빼니", "받으면") starts the card mid-sentence — drop it too.
  for (let index = Math.min(...pieces.keys()); index < pivot; index++) {
    const word = pieces.get(index);
    if (!word || !LEADING_CONNECTIVE.test(word)) break;
    pieces.delete(index);
  }
  const main = join().trim();
  return main.length >= 2 ? { main } : null;
}

const DANGLING_MODIFIER = /(?:는|던|할|될|을|를|의|에|며|고|서)$/u;
const LEADING_CONNECTIVE = /(?:니|면|고|서|며|자|해|도록)$/u;

/** Number phrase from the title first, then the card promise; null when neither has one. */
export function extractThumbnailHook(title: string, cardPromise?: string): ThumbnailHook | null {
  return hookFrom(title) ?? hookFrom(cardPromise || '');
}
