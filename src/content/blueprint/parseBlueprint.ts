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

function extractJsonObject(raw: string): unknown {
  const text = String(raw || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isVerbatim(fragment: string, material: string): boolean {
  const needle = normalizeForMatch(fragment);
  return needle.length > 0 && material.includes(needle);
}

export function parseBlueprint(raw: string, material: string): ParsedBlueprint | null {
  const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const L = BLUEPRINT_LIMITS;
  const materialNorm = normalizeForMatch(material);

  const quotesRaw = Array.isArray(parsed.quotes) ? parsed.quotes : [];
  const quotes: BlueprintQuote[] = [];
  for (const item of quotesRaw) {
    const text = clip((item as Record<string, unknown>)?.text, L.quoteMaxChars).replace(/^["“”]+|["“”]+$/gu, '').trim();
    if (text.length < L.quoteMinChars || !isVerbatim(text, materialNorm)) continue;
    if (quotes.some((q) => q.text === text)) continue;
    quotes.push({ text, speaker: clip((item as Record<string, unknown>)?.speaker, 40) });
    if (quotes.length >= L.quotesMax) break;
  }

  const factsRaw = Array.isArray(parsed.facts) ? parsed.facts : [];
  const facts: BlueprintFact[] = [];
  for (const item of factsRaw) {
    const claim = clip((item as Record<string, unknown>)?.claim, 160);
    const snippet = clip((item as Record<string, unknown>)?.snippet, L.snippetMaxChars);
    if (!claim || snippet.length < L.snippetMinChars || !isVerbatim(snippet, materialNorm)) continue;
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
