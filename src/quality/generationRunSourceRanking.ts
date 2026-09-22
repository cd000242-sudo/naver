// src/quality/generationRunSourceRanking.ts
//
// [P1 relevance v2] A2-source-ranking.json payload shape — factored out of
// generationRunStore.ts to keep that file under the project's 300-line limit.
// See src/content/sourceRelevanceRanking.ts for SourceRankingEntry.

export const SOURCE_RANKING_FILE = 'A2-source-ranking.json';

export interface SourceRankingWriteMeta {
  keyword: string;
  topicType: string;
  generatedAt?: string;
}

export function buildSourceRankingPayload(entries: unknown, meta: SourceRankingWriteMeta): unknown {
  return {
    keyword: meta.keyword,
    topicType: meta.topicType,
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
    entries,
  };
}
