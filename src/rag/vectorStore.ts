/**
 * SPEC-CONVERSION-001 L3-1.2 — 벡터 저장 추상화 계층
 *
 * VectorStore 인터페이스 + 인메모리 기본 구현(InMemoryVectorStore).
 * 운영 투입 시 ChromaDB·pgvector·Pinecone 어댑터를 별도 모듈로 작성하고
 * 본 인터페이스를 만족시키면 retriever 코드는 변경 없이 동작.
 *
 * 결정 의존: L3-1.1 docs/decisions/D-2026-rag-vectordb.md
 *   - 50건 시드 단계: InMemoryVectorStore 충분 (수만 건도 견딤)
 *   - 운영 확장 단계: 외부 DB 어댑터로 교체
 *
 * 메모리 [silent 폴백 금지]: dim 불일치는 명시 throw.
 * 메모리 [추정 효과 금지]: cosine similarity 정확도 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

export interface VectorRecord {
  readonly id: string;
  readonly vector: readonly number[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchHit {
  readonly id: string;
  readonly score: number;             // 0~1, 1이 가장 유사 (cosine)
  readonly vector: readonly number[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchOptions {
  readonly topK?: number;
  readonly minScore?: number;          // 임계 미만은 결과 제외 (0~1)
  readonly metadataFilter?: (md: Readonly<Record<string, unknown>> | undefined) => boolean;
}

export interface VectorStore {
  upsert(records: readonly VectorRecord[]): Promise<void>;
  delete(ids: readonly string[]): Promise<void>;
  search(query: readonly number[], options?: SearchOptions): Promise<SearchHit[]>;
  size(): number;
  clear(): Promise<void>;
}

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0;

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`VECTOR_DIM_MISMATCH: a.length=${a.length} vs b.length=${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 인메모리 코사인 유사도 검색.
 * O(N) 검색이라 50건~수만 건 범위에서 적합. 그 이상은 외부 DB 어댑터.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly store = new Map<string, VectorRecord>();
  private dim: number | null = null;

  async upsert(records: readonly VectorRecord[]): Promise<void> {
    for (const rec of records) {
      if (!rec.id) throw new Error('VECTOR_ID_EMPTY');
      if (!rec.vector || rec.vector.length === 0) {
        throw new Error(`VECTOR_EMPTY: id=${rec.id}`);
      }
      if (this.dim === null) {
        this.dim = rec.vector.length;
      } else if (rec.vector.length !== this.dim) {
        throw new Error(`VECTOR_DIM_MISMATCH: id=${rec.id} dim=${rec.vector.length} expected=${this.dim}`);
      }
      this.store.set(rec.id, {
        id: rec.id,
        vector: [...rec.vector],
        metadata: rec.metadata ? { ...rec.metadata } : undefined,
      });
    }
  }

  async delete(ids: readonly string[]): Promise<void> {
    for (const id of ids) this.store.delete(id);
    if (this.store.size === 0) this.dim = null;
  }

  async search(query: readonly number[], options?: SearchOptions): Promise<SearchHit[]> {
    if (this.store.size === 0) return [];
    if (this.dim !== null && query.length !== this.dim) {
      throw new Error(`SEARCH_DIM_MISMATCH: query=${query.length} expected=${this.dim}`);
    }
    const topK = Math.max(1, options?.topK ?? DEFAULT_TOP_K);
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
    const filter = options?.metadataFilter;

    const hits: SearchHit[] = [];
    for (const rec of this.store.values()) {
      if (filter && !filter(rec.metadata)) continue;
      const score = cosineSimilarity(query, rec.vector);
      if (score < minScore) continue;
      hits.push({ id: rec.id, score, vector: rec.vector, metadata: rec.metadata });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  size(): number {
    return this.store.size;
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.dim = null;
  }
}
