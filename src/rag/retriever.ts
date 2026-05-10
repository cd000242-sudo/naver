/**
 * SPEC-CONVERSION-001 L3-1.4 — Retriever (top-K 유사 검색)
 *
 * Embedder + VectorStore 조합으로 텍스트 쿼리를 받아 유사 문서 top-K 반환.
 *
 * 사용 예:
 *   const retriever = createRetriever({ embedder, store });
 *   const hits = await retriever.search('강남 카페 후기', { topK: 5 });
 *
 * 메모리 [silent 폴백 금지]: 0건 반환 시 빈 배열 — 추정 결과 만들지 않음.
 * 메모리 [추정 효과 금지]: retrieval 정확도 약속 X — eval-accuracy 스크립트로 calibrate.
 *
 * 파일 한도 150줄 준수.
 */

import type { Embedder } from './embedder';
import type { VectorStore, SearchHit, SearchOptions } from './vectorStore';

export interface RetrieverDeps {
  readonly embedder: Embedder;
  readonly store: VectorStore;
}

export interface RetrievedDocument {
  readonly id: string;
  readonly score: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Retriever {
  search(query: string, options?: SearchOptions): Promise<RetrievedDocument[]>;
  upsertDocument(input: { id: string; text: string; metadata?: Readonly<Record<string, unknown>> }): Promise<void>;
  upsertDocuments(inputs: readonly { id: string; text: string; metadata?: Readonly<Record<string, unknown>> }[]): Promise<void>;
}

export function createRetriever(deps: RetrieverDeps): Retriever {
  if (!deps.embedder) throw new Error('RETRIEVER_EMBEDDER_MISSING');
  if (!deps.store) throw new Error('RETRIEVER_STORE_MISSING');
  if (deps.embedder.dim < 1) {
    throw new Error(`RETRIEVER_DIM_INVALID: ${deps.embedder.dim}`);
  }

  const search = async (query: string, options?: SearchOptions): Promise<RetrievedDocument[]> => {
    if (typeof query !== 'string' || query.trim().length === 0) {
      return [];
    }
    const { vector } = await deps.embedder.embed(query);
    const hits: SearchHit[] = await deps.store.search(vector, options);
    return hits.map((h) => ({ id: h.id, score: h.score, metadata: h.metadata }));
  };

  const upsertDocument = async (input: {
    id: string;
    text: string;
    metadata?: Readonly<Record<string, unknown>>;
  }): Promise<void> => {
    if (!input.id) throw new Error('UPSERT_ID_EMPTY');
    if (typeof input.text !== 'string') throw new Error('UPSERT_TEXT_INVALID');
    const { vector } = await deps.embedder.embed(input.text);
    await deps.store.upsert([{ id: input.id, vector, metadata: input.metadata }]);
  };

  const upsertDocuments = async (
    inputs: readonly { id: string; text: string; metadata?: Readonly<Record<string, unknown>> }[],
  ): Promise<void> => {
    if (inputs.length === 0) return;
    const texts = inputs.map((i) => i.text);
    const embedded = await deps.embedder.embedBatch(texts);
    const records = inputs.map((i, idx) => ({
      id: i.id,
      vector: embedded[idx].vector,
      metadata: i.metadata,
    }));
    await deps.store.upsert(records);
  };

  return { search, upsertDocument, upsertDocuments };
}
