// [2026-09-22 P1] Collection-time relevance pre-check.
//
// The full-text collector stops after N fetched articles. Before relevance v2 those N slots
// were filled first-come; the ranking then rejected the off-topic ones and the writer was left
// with half the material (live: "청약통장 금리" 8 fetched → 4 accepted → source 18.6K → 7.7K).
// Checking each fetched text with the same scorer lets the collector skip an off-topic article
// and spend the slot (and the time budget) on the next candidate instead.

import { extractMainEntitiesAndModifiers } from './sourceRelevanceEntities.js';
import { scoreDocument, type RejectReason } from './sourceRelevanceScoring.js';
import { freshnessScore } from './topicFreshness.js';
import type { SourceDocument } from './sourceDocument.js';

export interface CollectionRelevanceVerdict {
  ok: boolean;
  reason?: RejectReason;
  score: number;
}

/**
 * Topic-only verdict for a freshly fetched article: entity mismatch and passing-mention bodies
 * are rejected; freshness/duplicates/quality are left to the ranking pass (they need the whole set).
 */
export function precheckCollectedArticle(
  keyword: string,
  title: string,
  body: string,
): CollectionRelevanceVerdict {
  const { entities, modifiers } = extractMainEntitiesAndModifiers(keyword);
  if (entities.length === 0) return { ok: true, score: 1 };
  const doc: SourceDocument = {
    id: 'precheck',
    title: title || '',
    sourceType: 'web',
    sourceName: '',
    url: '',
    dateStatus: 'UNKNOWN_DATE',
    body,
    sourceTier: 'NEWS', // neutral quality so only topic signals decide
  } as SourceDocument;
  const scored = scoreDocument(doc, keyword, entities, modifiers, freshnessScore(doc, 'EVERGREEN', new Date()));
  const topicReject = scored.reason === 'REJECT_ENTITY_MISMATCH' || scored.reason === 'REJECT_BODY_IRRELEVANT';
  return { ok: !topicReject, reason: topicReject ? scored.reason : undefined, score: scored.score };
}
