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

function extractJsonObject(raw: string): unknown {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  if (start < 0) return null;
  const end = text.lastIndexOf('}');
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* fall through to truncation repair */
    }
  }
  return repairTruncatedJson(text.slice(start));
}

function isVerbatim(fragment: string, material: string): boolean {
  const needle = normalizeForMatch(fragment);
  return needle.length > 0 && material.includes(needle);
}

const SNAP_EDGE_CHARS = 10;

function collapseSpaces(value: string): string {
  return String(value || '').replace(/["“”'‘’]/gu, '').replace(/\s+/gu, ' ').trim();
}

/**
 * Models rarely copy a passage byte-for-byte: a particle changes, a comma moves. Rather than drop
 * the passage, find its span in the material by its first and last characters and return the
 * material's own text for that span. Only a span of plausible length counts; otherwise null.
 * Measured 09-04: strict matching dropped 8/8 facts and 2/5 quotes on the first live post.
 */
export function snapToMaterial(fragment: string, material: string): string | null {
  const needle = collapseSpaces(fragment);
  const haystack = collapseSpaces(material);
  if (needle.length < SNAP_EDGE_CHARS * 2 || haystack.length === 0) return null;
  const head = needle.slice(0, SNAP_EDGE_CHARS);
  const tail = needle.slice(-SNAP_EDGE_CHARS);
  let from = 0;
  while (from < haystack.length) {
    const start = haystack.indexOf(head, from);
    if (start < 0) return null;
    const end = haystack.indexOf(tail, start + head.length);
    if (end < 0) return null;
    const span = haystack.slice(start, end + tail.length);
    const ratio = span.length / needle.length;
    if (ratio >= 0.8 && ratio <= 1.35) return span;
    from = start + 1;
  }
  return null;
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
