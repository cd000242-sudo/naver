// src/content/sourceRelevanceRanking.ts
//
// [P1 relevance v2] Orchestrates per-document scoring (sourceRelevanceScoring)
// + topic-aware freshness (topicFreshness) + cross-document duplicate
// detection (sourceRelevanceDuplicate) + publisher-name resolution
// (sourceName) into a ranked, explainable list. Replaces plain
// token-overlap scoring for ranking purposes (sourceRelevance.ts's
// evaluateSourceRelevance/applyFreshnessPolicy stay in place, unchanged, for
// backward compatibility) — a Seoul-jeonse article that only shares
// "주택"/"금리" no longer passes for "청약통장 금리".

import type { SourceDocument, SourceTier } from './sourceDocument.js';
import { extractMainEntitiesAndModifiers } from './sourceRelevanceEntities.js';
import { scoreDocument, type DocumentScore, type RejectReason, type RelevanceComponents } from './sourceRelevanceScoring.js';
import { classifyTopicType, freshnessScore, type TopicType } from './topicFreshness.js';
import { isDuplicateOfAny, makeAcceptedDocRef, type AcceptedDocRef } from './sourceRelevanceDuplicate.js';
import { resolveSourceName } from './sourceName.js';

export type { RejectReason, RelevanceComponents, TopicType };

const AMBIGUOUS_MIN = 0.35;
const AMBIGUOUS_MAX = 0.55;

export interface SourceJudgeVerdict {
  model: string;
  verdict: 'accept' | 'reject' | 'unknown';
}

export interface SourceRankingEntry {
  id: string;
  title: string;
  sourceName: string | null;
  domain: string;
  url: string;
  pubDate?: string;
  dateStatus: 'KNOWN' | 'UNKNOWN_DATE';
  sourceTier: SourceTier;
  score: number;
  accepted: boolean;
  reason?: RejectReason;
  components: RelevanceComponents;
  /** score within [0.35, 0.55] and not hard-rejected — the only candidates a judge hook may see. */
  ambiguous: boolean;
  judge?: SourceJudgeVerdict;
}

export interface SourceRankingOptions {
  mode?: string;
  now?: Date;
  /** Overrides classifyTopicType() — used by sourcePipeline to force NEWS_ISSUE for homefeed. */
  forceTopicType?: TopicType;
  /** Async LLM-judge hook, applied only to ambiguous documents (see rankSourceDocuments). */
  judgeAmbiguous?: (doc: SourceDocument, keyword: string) => Promise<SourceJudgeVerdict>;
}

export interface SourceRankingResult {
  ranked: SourceDocument[];
  ranking: SourceRankingEntry[];
  topicType: TopicType;
}

function isAmbiguous(score: number, accepted: boolean): boolean {
  return accepted && score >= AMBIGUOUS_MIN && score <= AMBIGUOUS_MAX;
}

/**
 * Synchronous scoring core (no LLM judge). Used directly by
 * prepareSourceMaterial (sourcePipeline.ts) so the writer-facing pipeline
 * never depends on an async hook — see rankSourceDocuments below for the
 * judge-enabled async wrapper.
 */
export function computeSourceRanking(
  docs: SourceDocument[],
  keyword: string,
  opts: SourceRankingOptions = {},
): SourceRankingResult {
  const now = opts.now ?? new Date();
  const topicType = opts.forceTopicType ?? classifyTopicType(keyword, docs);
  const { entities, modifiers } = extractMainEntitiesAndModifiers(keyword);

  const prelim: DocumentScore[] = docs.map((doc) => {
    const freshness = freshnessScore(doc, topicType, now);
    return scoreDocument(doc, keyword, entities, modifiers, freshness);
  });

  // Duplicate pass: strongest documents first, only among currently-accepted ones —
  // "keep the higher-quality/fresher one" when two documents describe the same thing.
  const order = docs.map((_, i) => i).sort((a, b) => {
    if (prelim[a].accepted !== prelim[b].accepted) return prelim[a].accepted ? -1 : 1;
    return prelim[b].score - prelim[a].score;
  });
  const acceptedRefs: AcceptedDocRef[] = [];
  const final: DocumentScore[] = [...prelim];
  for (const i of order) {
    if (!prelim[i].accepted) continue;
    const doc = docs[i];
    const body = doc.cleanedBody ?? doc.body ?? '';
    if (isDuplicateOfAny({ url: doc.url, title: doc.title, body }, acceptedRefs)) {
      final[i] = { ...prelim[i], accepted: false, reason: 'REJECT_DUPLICATE' };
    } else {
      acceptedRefs.push(makeAcceptedDocRef(doc.url, doc.title, body));
    }
  }

  const entries: SourceRankingEntry[] = docs.map((doc, i) => {
    const resolved = resolveSourceName({ url: doc.url, title: doc.title, sourceType: doc.sourceType });
    const d = final[i];
    return {
      id: doc.id,
      title: doc.title,
      sourceName: resolved.sourceName,
      domain: resolved.domain,
      url: doc.url,
      pubDate: doc.pubDate,
      dateStatus: doc.dateStatus,
      sourceTier: doc.sourceTier,
      score: d.score,
      accepted: d.accepted,
      reason: d.reason,
      components: d.components,
      ambiguous: isAmbiguous(d.score, d.accepted),
    };
  });

  const rankedDocs: SourceDocument[] = docs.map((doc, i) => ({
    ...doc,
    relevance: { score: final[i].score, accepted: final[i].accepted, reason: final[i].reason, components: final[i].components },
    stale: final[i].stale,
  }));

  const ranked = order.map((i) => rankedDocs[i]);
  const ranking = order.map((i) => entries[i]);

  return { ranked, ranking, topicType };
}

/**
 * Async public API: computes the same ranking as computeSourceRanking, then —
 * only for documents in the ambiguous score band — awaits
 * `opts.judgeAmbiguous` and records the verdict on that entry. Never awaits
 * anything when there is no judge hook or no ambiguous documents.
 */
export async function rankSourceDocuments(
  docs: SourceDocument[],
  keyword: string,
  opts: SourceRankingOptions = {},
): Promise<SourceRankingResult> {
  const base = computeSourceRanking(docs, keyword, opts);
  if (!opts.judgeAmbiguous) return base;

  const docById = new Map(docs.map((d) => [d.id, d] as const));
  const judge = opts.judgeAmbiguous;
  const ranking = await Promise.all(base.ranking.map(async (entry) => {
    if (!entry.ambiguous) return entry;
    const doc = docById.get(entry.id);
    if (!doc) return entry;
    try {
      const verdict = await judge(doc, keyword);
      return { ...entry, judge: verdict };
    } catch {
      return { ...entry, judge: { model: 'unknown', verdict: 'unknown' as const } };
    }
  }));

  return { ...base, ranking };
}
