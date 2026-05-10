/**
 * SPEC-CONVERSION-001 L3-1.3 — 임베딩 어댑터 인터페이스
 *
 * Embedder 인터페이스 + 결정론 hash-based 더미 구현(HashEmbedder).
 * 운영 투입 시 OpenAI text-embedding-3-small, Cohere embed-multilingual-v3
 * 어댑터를 별도 모듈로 작성하고 본 인터페이스 만족.
 *
 * Hash 임베딩은 *테스트·시드용*으로만 사용. 의미적 유사도 보장 X.
 *
 * 메모리 [silent 폴백 금지]: provider 실패는 명시 throw.
 * 메모리 [추정 효과 금지]: 임베딩 품질 약속 X.
 *
 * 파일 한도 150줄 준수.
 */

export interface EmbedRequest {
  readonly text: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EmbedResult {
  readonly vector: readonly number[];
  readonly model: string;
  readonly dim: number;
}

export interface Embedder {
  readonly model: string;
  readonly dim: number;
  embed(text: string): Promise<EmbedResult>;
  embedBatch(texts: readonly string[]): Promise<readonly EmbedResult[]>;
}

const DEFAULT_HASH_DIM = 256;

/**
 * 결정론 hash 임베딩 — 의미 유사도 X. 테스트·시드용.
 * 운영은 OpenAI/Cohere/HuggingFace 어댑터 사용 권장.
 */
export class HashEmbedder implements Embedder {
  readonly model = 'hash-deterministic-v1';
  readonly dim: number;

  constructor(dim: number = DEFAULT_HASH_DIM) {
    if (!Number.isFinite(dim) || dim < 16 || dim > 4096) {
      throw new Error(`HASH_EMBEDDER_DIM_INVALID: ${dim} (16~4096)`);
    }
    this.dim = dim;
  }

  async embed(text: string): Promise<EmbedResult> {
    if (typeof text !== 'string') {
      throw new Error('HASH_EMBED_INPUT_INVALID: text must be string');
    }
    const vector = new Array<number>(this.dim).fill(0);
    if (text.length === 0) {
      return { vector, model: this.model, dim: this.dim };
    }
    // 한글·영문 토큰을 슬라이딩 윈도우로 추출 → 각 토큰을 hash → vector bucket에 누적
    const tokens = text
      .toLowerCase()
      .match(/[가-힣]{2,}|[a-z0-9]{2,}/g) ?? [];
    for (const tok of tokens) {
      const h = djb2(tok);
      const idx = h % this.dim;
      vector[idx] += 1;
    }
    // L2 정규화
    let norm = 0;
    for (let i = 0; i < this.dim; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) vector[i] = vector[i] / norm;
    }
    return { vector, model: this.model, dim: this.dim };
  }

  async embedBatch(texts: readonly string[]): Promise<readonly EmbedResult[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h | 0;
  }
  return Math.abs(h);
}
