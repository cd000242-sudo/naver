// src/content/sourceRelevance.ts
//
// Scores each collected SourceDocument against the actual keyword/topic —
// separate from noise-filtering. A document can be perfectly "clean" text
// and still be the wrong article (e.g. a 쌍꺼풀 수술 blog post picked up while
// searching "청약통장 금리"). This module never blocks — evaluateSourceRelevance
// only annotates `relevance`, callers decide what to do with rejected docs.

import { toFactToken } from './koreanFactTokens.js';
import type { SourceDocument } from './sourceDocument.js';

/** Particle suffixes stripped from keyword words so "금리는" matches "금리". */
const PARTICLE_SUFFIXES = ['은', '는', '이', '가', '을', '를', '의', '에', '로'];

/**
 * Splits a keyword phrase into meaningful tokens: particles dropped, numbers
 * with units (e.g. "3.5%", "300만원") kept whole, tokens under 2 chars dropped.
 */
export function extractKeywordTokens(keyword: string): string[] {
  const raw = String(keyword ?? '').trim();
  if (!raw) return [];
  const words = raw.split(/[\s,./·・|()[\]]+/).filter(Boolean);
  const tokens: string[] = [];
  for (const word of words) {
    if (/^\d/.test(word)) {
      tokens.push(word);
      continue;
    }
    let core = word;
    for (const particle of PARTICLE_SUFFIXES) {
      if (core.length > particle.length + 1 && core.endsWith(particle)) {
        core = core.slice(0, -particle.length);
        break;
      }
    }
    if (core.length >= 2) tokens.push(core);
  }
  return [...new Set(tokens)];
}

/**
 * Proper-noun-ish entities appearing anywhere in the text (>=1 occurrence,
 * unlike extractKoreanFactTokens which requires repeats). Reuses the
 * particle-stripping/verb-ending rejection from koreanFactTokens so "김윤주가"
 * still resolves to "김윤주".
 */
export function extractEntities(text: string): string[] {
  const found = new Set<string>();
  for (const word of String(text ?? '').split(/[^가-힣A-Za-z0-9]+/)) {
    if (!word) continue;
    const koreanToken = toFactToken(word);
    if (koreanToken && koreanToken.length >= 2 && koreanToken.length <= 8) {
      found.add(koreanToken);
      continue;
    }
    if (/^[A-Z][A-Za-z]{1,7}$/.test(word)) found.add(word);
  }
  return [...found];
}

/**
 * 0..1 scores. keywordScore weighs a title hit 2x a body-only hit, so a
 * document whose title matches the keyword outranks one that only mentions
 * it in passing. entityScore is the fraction of keyword-derived entities
 * found anywhere in the document.
 */
export function scoreSourceRelevance(
  doc: SourceDocument,
  keyword: string,
): { keywordScore: number; entityScore: number } {
  const title = doc.title || '';
  const body = doc.cleanedBody ?? doc.body ?? '';

  const tokens = extractKeywordTokens(keyword);
  let keywordScore = 0;
  if (tokens.length > 0) {
    let earned = 0;
    for (const token of tokens) {
      if (title.includes(token)) earned += 2;
      else if (body.includes(token)) earned += 1;
    }
    keywordScore = Math.min(1, earned / (tokens.length * 2));
  }

  const entities = extractEntities(keyword);
  let entityScore = 0;
  if (entities.length > 0) {
    const haystack = `${title} ${body}`;
    const hits = entities.filter((entity) => haystack.includes(entity)).length;
    entityScore = hits / entities.length;
  }

  return { keywordScore, entityScore };
}

/**
 * Returns NEW document objects (never mutates `docs`) with `relevance`
 * filled in. Docs below `minKeywordScore` (default 0.34 — roughly "at least
 * a third of the keyword's meaningful tokens showed up") are marked
 * accepted=false with a reason; callers choose whether to drop them.
 */
export function evaluateSourceRelevance(
  docs: SourceDocument[],
  keyword: string,
  opts: { minKeywordScore?: number; requireEntity?: boolean } = {},
): SourceDocument[] {
  const minKeywordScore = opts.minKeywordScore ?? 0.34;
  const requireEntity = opts.requireEntity ?? false;

  return docs.map((doc) => {
    const { keywordScore, entityScore } = scoreSourceRelevance(doc, keyword);
    let accepted = keywordScore >= minKeywordScore;
    let reason: string | undefined;
    if (!accepted) {
      reason = 'LOW_KEYWORD_OVERLAP';
    } else if (requireEntity && entityScore === 0) {
      accepted = false;
      reason = 'NO_ENTITY_MATCH';
    }
    return { ...doc, relevance: { keywordScore, entityScore, accepted, reason } };
  });
}

/**
 * Applies a per-mode freshness policy. Pure — returns a new array.
 *
 * homefeed-like modes ('homefeed'): docs older than maxAgeDays are rejected
 * (relevance.accepted=false, reason='STALE'); UNKNOWN_DATE docs are kept but
 * never promoted ahead of dated docs.
 *
 * Other modes: no rejection, ordering only — dated docs newest-first, then
 * UNKNOWN_DATE docs.
 */
export function applyFreshnessPolicy(
  docs: SourceDocument[],
  opts: { mode: string; maxAgeDays?: number; now?: Date },
): SourceDocument[] {
  const maxAgeDays = opts.maxAgeDays ?? 30;
  const now = opts.now ?? new Date();
  const isHomefeedLike = opts.mode === 'homefeed';

  const withStatus = docs.map((doc) => {
    if (!isHomefeedLike || !doc.pubDate) return doc;
    const ageDays = (now.getTime() - new Date(`${doc.pubDate}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= maxAgeDays) return doc;
    return {
      ...doc,
      relevance: { keywordScore: 0, entityScore: 0, ...doc.relevance, accepted: false, reason: 'STALE' },
    };
  });

  const dated = withStatus.filter((d) => d.dateStatus === 'KNOWN');
  const undated = withStatus.filter((d) => d.dateStatus !== 'KNOWN');
  dated.sort((a, b) => (a.pubDate! < b.pubDate! ? 1 : a.pubDate! > b.pubDate! ? -1 : 0));
  return [...dated, ...undated];
}
