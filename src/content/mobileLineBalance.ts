/**
 * [v2.11.204] Mobile orphan-tail line balancing.
 *
 * Naver's mobile blog view wraps Korean body text glyph-by-glyph, so a hard line
 * that overflows the viewport by one or two glyphs drops only its tail onto the
 * next line:
 *
 *   매체마다 46세와 47세가 섞여 나오는
 *   데,
 *
 * Measured against a 360dp viewport (user screenshots, 2026-08-21): lines up to
 * ~17.5 Korean-glyph widths render on one line, lines from ~18.0 overflow. This
 * module simulates that wrap; only when it would leave a stub tail does it
 * re-break the line at word boundaries into balanced parts. Lines that already
 * render cleanly are returned untouched.
 */

/** Widths in "Korean glyph" units, calibrated from the 360dp screenshots. */
const WIDTH_SPACE = 0.36;
const WIDTH_NARROW = 0.55; // latin letters, digits
const WIDTH_PUNCT = 0.4; // quotes, brackets, sentence punctuation
const WIDTH_FULL = 1;

/** Max width a line may occupy on a 360dp mobile viewport. */
export const MAX_MOBILE_LINE_WIDTH = 17.5;

/** A trailing visual line narrower than this reads as an orphaned stub. */
export const ORPHAN_TAIL_WIDTH = 4;

/** Extra tolerance granted to a break point that falls on a natural pause. */
const NATURAL_BREAK_BONUS = 1.5;

const PUNCT_CHARS = /[.,;:!?'"()\[\]{}‘’“”「」『』（）·…~]/;
const CLAUSE_END = /[,、;:·…]$/;
const QUOTE_OPEN = /^['"‘“「『(\[（]/;

/** Lines whose break structure carries meaning (lists, headings, markup, URLs). */
const PRESERVE_LINE = /^\s*(?:#{1,6}\s|[-*•·▪◦]\s|\d+[.)]\s|>\s|\|)|https?:\/\/|www\.|\{\{|<[a-zA-Z/]/;

/** Width of a single character in Korean-glyph units. */
function charWidth(ch: string): number {
  if (ch === ' ' || ch === '\t') return WIDTH_SPACE;
  if (PUNCT_CHARS.test(ch)) return WIDTH_PUNCT;
  return ch.charCodeAt(0) < 0x2e80 ? WIDTH_NARROW : WIDTH_FULL;
}

/** Rendered width of a string in Korean-glyph units. */
export function measureMobileLineWidth(line: string): number {
  let total = 0;
  for (const ch of String(line || '')) total += charWidth(ch);
  return total;
}

/**
 * Simulate the browser's glyph-level wrap and report how wide the last visual
 * line ends up. Korean line-break rules forbid starting a line with closing
 * punctuation, so an overflowing punctuation mark pulls the glyph before it down.
 */
export function simulateMobileWrap(line: string): { visualLines: number; tailWidth: number } {
  const chars = [...String(line || '').trim()];
  let start = 0;
  let cur = 0;
  let visualLines = 1;

  for (let i = 0; i < chars.length; i++) {
    const width = charWidth(chars[i]);
    if (cur + width <= MAX_MOBILE_LINE_WIDTH || i === start) {
      cur += width;
      continue;
    }
    let breakAt = i;
    if (PUNCT_CHARS.test(chars[i]) && breakAt - 1 > start) breakAt -= 1;
    visualLines += 1;
    start = breakAt;
    cur = 0;
    for (let j = breakAt; j <= i; j++) cur += charWidth(chars[j]);
  }

  return { visualLines, tailWidth: cur };
}

function widthOfWords(words: string[], count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) total += WIDTH_SPACE;
    total += measureMobileLineWidth(words[i]);
  }
  return total;
}

/** A break between words[k-1] and words[k] landing on a clause pause or an opening quote. */
function isNaturalBreak(words: string[], k: number): boolean {
  return CLAUSE_END.test(words[k - 1]) || QUOTE_OPEN.test(words[k]);
}

/** Pick how many words go on this line so the chunk lands closest to `target`. */
function chooseBreak(words: string[], target: number): number {
  let best = 1;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let k = 1; k < words.length; k++) {
    const width = widthOfWords(words, k);
    if (width > MAX_MOBILE_LINE_WIDTH && k > 1) break;

    let cost = Math.abs(width - target);
    if (isNaturalBreak(words, k)) cost -= NATURAL_BREAK_BONUS;
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }

  return best;
}

/** Re-break one line into balanced word-boundary lines. */
function rebreakLine(line: string): string[] {
  const indent = line.match(/^\s*/)?.[0] ?? '';
  let words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [line];

  const chunks: string[] = [];
  let guard = 0;

  while (words.length > 0 && guard++ < 64) {
    const remaining = widthOfWords(words, words.length);
    if (remaining <= MAX_MOBILE_LINE_WIDTH) {
      chunks.push(words.join(' '));
      words = [];
      break;
    }
    const parts = Math.ceil(remaining / MAX_MOBILE_LINE_WIDTH);
    const k = chooseBreak(words, remaining / parts);
    chunks.push(words.slice(0, k).join(' '));
    words = words.slice(k);
  }

  if (words.length > 0) chunks.push(words.join(' '));
  if (chunks.length < 2) return [line];
  return chunks.map((chunk, i) => (i === 0 ? indent + chunk : chunk));
}

/** True when the line wraps on mobile and leaves only a stub on its last row. */
function orphansTail(line: string): boolean {
  const { visualLines, tailWidth } = simulateMobileWrap(line);
  return visualLines > 1 && tailWidth < ORPHAN_TAIL_WIDTH;
}

/**
 * Re-break every hard line that would orphan its tail on a mobile viewport.
 * Everything else — short lines, cleanly wrapping paragraphs, lists, headings,
 * quotes, tables, URLs, markup — is returned byte-identical.
 */
export function balanceMobileLineBreaks(text: string): string {
  if (!text) return text;

  let rebroken = 0;
  const result = String(text)
    .split('\n')
    .flatMap((line) => {
      if (!line.trim()) return [line];
      if (PRESERVE_LINE.test(line)) return [line];
      if (!orphansTail(line)) return [line];
      const parts = rebreakLine(line);
      if (parts.length > 1) rebroken += 1;
      return parts;
    })
    .join('\n');

  if (rebroken > 0) {
    console.log(`[mobileLineBalance] ✅ 모바일 꼬리 줄바꿈 보정: ${rebroken}줄 재분할`);
  }
  return result;
}
