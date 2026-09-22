// src/content/sourceRelevanceEntities.ts
//
// [P1 relevance v2] Splits a keyword into a "main entity" + "modifier" tokens
// using positional/morphological heuristics only (particle stripping, number
// detection) — no per-keyword or per-product tables. Also provides a generic
// character-bigram fuzzy matcher so inflected/compound forms of an entity
// still count as a match without a synonym dictionary.

import { extractKeywordTokens } from './sourceRelevance.js';

export { extractKeywordTokens };

export interface KeywordEntities {
  entities: string[];
  modifiers: string[];
}

const NUMBER_TOKEN_RE = /^\d/;

/**
 * The main entity is the first non-numeric token in the keyword — in Korean
 * search phrases the subject generally leads ("청약통장 금리" -> 청약통장,
 * "2026 셀토스 하이브리드 모의견적" -> 셀토스, skipping the leading year).
 * Everything else (including numbers/years) becomes a modifier.
 */
export function extractMainEntitiesAndModifiers(keyword: string): KeywordEntities {
  const tokens = extractKeywordTokens(keyword);
  if (tokens.length === 0) return { entities: [], modifiers: [] };
  const nonNumeric = tokens.filter((t) => !NUMBER_TOKEN_RE.test(t));
  if (nonNumeric.length === 0) return { entities: [], modifiers: tokens };
  const mainEntity = nonNumeric[0];
  const modifiers = tokens.filter((t) => t !== mainEntity);
  return { entities: [mainEntity], modifiers };
}

// --- Character-bigram fuzzy matching ---------------------------------------

function bigramMultiset(s: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i += 1) {
    const gram = s.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

/** Sorensen-Dice coefficient over character bigrams. 0..1. */
export function bigramDiceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsA = bigramMultiset(a);
  const bigramsB = bigramMultiset(b);
  let overlap = 0;
  for (const [gram, countA] of bigramsA) {
    const countB = bigramsB.get(gram);
    if (countB) overlap += Math.min(countA, countB);
  }
  const totalA = [...bigramsA.values()].reduce((s, n) => s + n, 0);
  const totalB = [...bigramsB.values()].reduce((s, n) => s + n, 0);
  if (totalA + totalB === 0) return 0;
  return (2 * overlap) / (totalA + totalB);
}

const WORD_CHUNK_RE = /[가-힣]{2,}|[A-Za-z0-9]{2,}/g;

/**
 * True when `needle` appears verbatim in `haystack`, or a word-like chunk of
 * `haystack` is bigram-similar to `needle` at/above `threshold` — a weaker
 * match that catches inflected/compound forms without a synonym table.
 */
export function fuzzyContains(haystack: string, needle: string, threshold = 0.6): boolean {
  if (!haystack || !needle) return false;
  if (haystack.includes(needle)) return true;
  const chunks = haystack.match(WORD_CHUNK_RE) ?? [];
  return chunks.some((chunk) => {
    if (Math.abs(chunk.length - needle.length) > 3) return false; // skip wildly different lengths
    return bigramDiceSimilarity(chunk, needle) >= threshold;
  });
}

/** Fraction (0..1) of `tokens` found (fuzzy) anywhere in `haystack`. 1 when `tokens` is empty. */
export function fuzzyCoverage(tokens: string[], haystack: string): number {
  if (tokens.length === 0) return 1;
  const hits = tokens.filter((t) => fuzzyContains(haystack, t)).length;
  return hits / tokens.length;
}
