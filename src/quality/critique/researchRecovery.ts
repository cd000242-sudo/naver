// [2026-09-22 Critique Loop] Research recovery — when the Critic answers NEEDS_MORE_RESEARCH
// with researchQueries, search BEFORE editing (never invent), merge the new accepted
// documents into the evidence pack and let the Critic run once more. At most one recovery
// per article; the search function is injected (production: collectKeywordMaterials +
// prepareSourceMaterial, tests: a fake).

import type { SourceDocument } from '../../content/sourceDocument';
import type { EvidencePack } from './types';
import { buildEvidencePack } from './evidence';

export type ResearchSearchFn = (query: string) => Promise<readonly SourceDocument[]>;

export interface ResearchRecoveryResult {
  readonly evidence: EvidencePack;
  readonly documents: readonly SourceDocument[];
  readonly addedDocuments: number;
  readonly queries: readonly string[];
  readonly failures: readonly string[];
}

const MAX_QUERIES = 3;
const MAX_ADDED_DOCS = 6;

function docKey(doc: SourceDocument): string {
  return String(doc.url || doc.title || doc.id || '').trim().toLowerCase();
}

/** Re-id new docs as R01.. so they never collide with the original S01.. ids the article cites. */
function reId(docs: readonly SourceDocument[], offset: number): SourceDocument[] {
  return docs.map((d, i) => ({ ...d, id: `R${String(offset + i + 1).padStart(2, '0')}` }));
}

export async function runResearchRecovery(
  search: ResearchSearchFn,
  existing: readonly SourceDocument[],
  queries: readonly string[],
  keyword: string,
): Promise<ResearchRecoveryResult> {
  const known = new Set(existing.map(docKey));
  const added: SourceDocument[] = [];
  const failures: string[] = [];
  const used = queries.slice(0, MAX_QUERIES);
  for (const query of used) {
    if (added.length >= MAX_ADDED_DOCS) break;
    try {
      const found = await search(query);
      for (const doc of found) {
        if (added.length >= MAX_ADDED_DOCS) break;
        if (!doc || !String(doc.body || '').trim()) continue;
        if (doc.relevance && doc.relevance.accepted === false) continue;
        const key = docKey(doc);
        if (!key || known.has(key)) continue;
        known.add(key);
        added.push(doc);
      }
    } catch (error) {
      failures.push(`${query}: ${(error as Error)?.message || String(error)}`);
    }
  }
  const documents = [...existing, ...reId(added, 0)];
  return {
    evidence: buildEvidencePack(documents, keyword),
    documents,
    addedDocuments: added.length,
    queries: used,
    failures,
  };
}
