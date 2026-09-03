/**
 * SPEC-BLUEPRINT-2026 — parse and verify a 설계도 response against the material.
 *
 * Verification is the point: a quote or snippet that is not a verbatim substring of the material
 * is dropped, so the blueprint can never introduce a fact the material does not contain.
 * Whitespace and quotation marks are normalized before matching; nothing else is.
 */
import { BLUEPRINT_LIMITS, type Blueprint, type BlueprintFact, type BlueprintQuote } from './blueprintSchema';

export interface ParsedBlueprint {
  readonly blueprint: Blueprint;
  readonly dropped: { readonly quotes: number; readonly facts: number; readonly skeleton: number };
}

function normalizeForMatch(value: string): string {
  return String(value || '')
    .replace(/["“”'‘’]/gu, '')
    .replace(/\s+/gu, '')
    .toLowerCase();
}

function clip(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);
}

/** Closing brackets needed to balance `text` (string-aware). */
function computeClosers(text: string): string {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return stack.reverse().join('');
}

/**
 * Output caps cut a long 설계도 mid-array. Rather than losing everything, cut back to the last
 * complete value and close the brackets; the verified-substring rules still apply to what is left.
 */
function repairTruncatedJson(text: string): unknown {
  let candidate = text;
  for (let round = 0; round < 8; round += 1) {
    const cut = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (cut <= 0) return null;
    candidate = candidate.slice(0, cut + 1);
    try {
      return JSON.parse(candidate.replace(/,\s*$/u, '') + computeClosers(candidate));
    } catch {
      candidate = candidate.slice(0, cut);
    }
  }
  return null;
}

/**
 * Korean reporting quotes a speaker as `…없다"고 밝혔다` — the model copies that straight into a JSON
 * string without escaping, and the parse dies at that character (measured 09-04: 2/2 posts).
 * A quote inside a string is a closer only when the next non-space character continues the JSON
 * (`,` `}` `]` `:`); every other inner quote is escaped.
 */
export function escapeUnescapedQuotes(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      out += ch + (text[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/u.test(text[j])) j += 1;
      const next = text[j] ?? '';
      if (next === ',' || next === '}' || next === ']' || next === ':' || next === '') {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractJsonObject(raw: string): unknown {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  if (start < 0) return null;
  const end = text.lastIndexOf('}');
  const body = end > start ? text.slice(start, end + 1) : text.slice(start);
  const direct = tryParse(body);
  if (direct !== undefined) return direct;
  // From here on work on the whole tail: a `}` inside a string must not cut the candidate short.
  const whole = text.slice(start);
  const escaped = escapeUnescapedQuotes(whole);
  const repairedQuotes = tryParse(escaped);
  if (repairedQuotes !== undefined) return repairedQuotes;
  return repairTruncatedJson(escaped);
}

function isVerbatim(fragment: string, material: string): boolean {
  const needle = normalizeForMatch(fragment);
  return needle.length > 0 && material.includes(needle);
}

const SHINGLE_CHARS = 8;
const SHINGLE_STEP = 3;
const SHINGLE_MIN_HIT_RATIO = 0.55;

function collapseSpaces(value: string): string {
  return String(value || '').replace(/["“”'‘’]/gu, '').replace(/\s+/gu, ' ').trim();
}

function allIndexes(haystack: string, needle: string, cap = 12): number[] {
  const out: number[] = [];
  let from = 0;
  while (out.length < cap) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    out.push(at);
    from = at + 1;
  }
  return out;
}

/**
 * Models rarely copy a passage byte-for-byte: a particle changes, the sentence ending is trimmed,
 * a comma moves. Rather than drop the passage, locate it in the material by voting with short
 * character shingles and return the material's own text for that span. Measured 09-04: strict
 * matching dropped 8/8 facts; edge matching (first/last 10 chars) still dropped 5/8 because the
 * model rewrites sentence endings. Shingles from the whole passage survive that.
 */
export function snapToMaterial(fragment: string, material: string): string | null {
  const needle = collapseSpaces(fragment);
  const haystack = collapseSpaces(material);
  if (needle.length < SHINGLE_CHARS * 2 || haystack.length === 0) return null;
  const shingles: string[] = [];
  for (let i = 0; i + SHINGLE_CHARS <= needle.length; i += SHINGLE_STEP) shingles.push(needle.slice(i, i + SHINGLE_CHARS));
  // The final window anchors the span end when the model kept the sentence ending.
  const lastWindow = needle.slice(-SHINGLE_CHARS);
  if (shingles[shingles.length - 1] !== lastWindow) shingles.push(lastWindow);
  const hits: Array<{ pos: number; idx: number }> = [];
  shingles.forEach((sh, idx) => { for (const pos of allIndexes(haystack, sh)) hits.push({ pos, idx }); });
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.pos - b.pos);
  const window = Math.ceil(needle.length * 1.35);
  let best: { from: number; to: number; count: number } | null = null;
  for (let i = 0; i < hits.length; i += 1) {
    const seen = new Set<number>();
    let last = hits[i].pos;
    for (let k = i; k < hits.length && hits[k].pos - hits[i].pos <= window; k += 1) {
      seen.add(hits[k].idx);
      last = hits[k].pos;
    }
    if (!best || seen.size > best.count) best = { from: hits[i].pos, to: last + SHINGLE_CHARS, count: seen.size };
  }
  if (!best || best.count / shingles.length < SHINGLE_MIN_HIT_RATIO) return null;
  const span = haystack.slice(best.from, best.to).trim();
  const ratio = span.length / needle.length;
  return ratio >= 0.6 && ratio <= 1.35 ? span : null;
}

/** Exact (normalized) match keeps the model's text; otherwise snap to the material's own span. */
function groundToMaterial(fragment: string, materialNorm: string, material: string): string | null {
  if (isVerbatim(fragment, materialNorm)) return fragment;
  return snapToMaterial(fragment, material);
}

export function parseBlueprint(raw: string, material: string): ParsedBlueprint | null {
  const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const L = BLUEPRINT_LIMITS;
  const materialNorm = normalizeForMatch(material);

  const quotesRaw = Array.isArray(parsed.quotes) ? parsed.quotes : [];
  const quotes: BlueprintQuote[] = [];
  for (const item of quotesRaw) {
    const proposed = clip((item as Record<string, unknown>)?.text, L.quoteMaxChars).replace(/^["“”]+|["“”]+$/gu, '').trim();
    if (proposed.length < L.quoteMinChars) continue;
    const text = groundToMaterial(proposed, materialNorm, material);
    if (!text || text.length < L.quoteMinChars || text.length > L.quoteMaxChars) continue;
    if (quotes.some((q) => q.text === text)) continue;
    quotes.push({ text, speaker: clip((item as Record<string, unknown>)?.speaker, 40) });
    if (quotes.length >= L.quotesMax) break;
  }

  const factsRaw = Array.isArray(parsed.facts) ? parsed.facts : [];
  const facts: BlueprintFact[] = [];
  for (const item of factsRaw) {
    const claim = clip((item as Record<string, unknown>)?.claim, 160);
    const proposedSnippet = clip((item as Record<string, unknown>)?.snippet, L.snippetMaxChars);
    if (!claim || proposedSnippet.length < L.snippetMinChars) continue;
    const snippet = groundToMaterial(proposedSnippet, materialNorm, material);
    if (!snippet || snippet.length < L.snippetMinChars || snippet.length > L.snippetMaxChars) continue;
    facts.push({ claim, snippet });
    if (facts.length >= L.factsMax) break;
  }

  const skeletonRaw = Array.isArray(parsed.skeleton) ? parsed.skeleton : [];
  const skeleton = skeletonRaw
    .map((value) => clip(value, L.headingMaxChars))
    .filter((value, index, all) => value.length >= 4 && all.indexOf(value) === index)
    .slice(0, L.skeletonMax);

  const offTopic = (Array.isArray(parsed.offTopic) ? parsed.offTopic : [])
    .map((value) => clip(value, 60))
    .filter(Boolean)
    .slice(0, L.offTopicMax);

  const readerSituation = clip(parsed.readerSituation, L.readerSituationMaxChars);
  const angle = clip(parsed.angle, L.angleMaxChars);

  // Nothing usable → let the caller fall back to the plain material path.
  if (!readerSituation && facts.length === 0 && quotes.length === 0 && skeleton.length < L.skeletonMin) return null;

  return {
    blueprint: { angle, readerSituation, quotes, facts, skeleton, offTopic },
    dropped: {
      quotes: quotesRaw.length - quotes.length,
      facts: factsRaw.length - facts.length,
      skeleton: skeletonRaw.length - skeleton.length,
    },
  };
}
