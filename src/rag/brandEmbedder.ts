/**
 * SPEC-CONVERSION-001 L4-3.1 — 계정별(브랜드별) 과거 발행글 벡터화
 *
 * 다계정 운영 시 각 브랜드(=네이버 ID)의 과거 발행글을 임베딩해 RAG에 적재.
 * personaBuilder가 브랜드 톤을 학습할 때 본 모듈의 retrieval을 사용.
 *
 * 본 모듈은 *brand-aware retriever 헬퍼* — vectorStore의 metadata.accountId를
 * 필터링해 "이 브랜드의 과거 글만" 검색하도록 한다.
 *
 * 메모리 [silent 폴백 금지]: accountId 누락 시 명시 throw.
 * 메모리 [추정 효과 금지]: 톤 일관성 향상 약속 X — 운영 메트릭 calibrate.
 *
 * 파일 한도 200줄 준수.
 */

import type { Embedder } from './embedder';
import type { VectorStore } from './vectorStore';
import { createRetriever, type RetrievedDocument } from './retriever';

export interface BrandPost {
  readonly accountId: string;          // 네이버 ID 또는 내부 브랜드 ID
  readonly postId: string;
  readonly title: string;
  readonly bodyText: string;
  readonly category?: string;
  readonly publishedAt?: string;       // ISO 8601
  readonly tone?: string;              // 자체 톤 라벨 (옵션)
}

export interface BrandRetrievalOptions {
  readonly accountId: string;
  readonly query: string;
  readonly topK?: number;
  readonly minScore?: number;
  readonly category?: string;          // 카테고리 필터 (옵션)
}

export interface BrandToneAggregate {
  readonly accountId: string;
  readonly totalPosts: number;
  readonly perCategoryCount: Readonly<Record<string, number>>;
  readonly perToneCount: Readonly<Record<string, number>>;
  readonly avgTitleLength: number;
  readonly avgBodyLength: number;
}

export interface BrandEmbedderDeps {
  readonly embedder: Embedder;
  readonly store: VectorStore;
}

export interface BrandEmbedder {
  upsertPost(post: BrandPost): Promise<void>;
  upsertPostBatch(posts: readonly BrandPost[]): Promise<void>;
  deleteAccountPosts(accountId: string): Promise<number>;
  searchSimilarPosts(options: BrandRetrievalOptions): Promise<RetrievedDocument[]>;
  aggregate(accountId: string): Promise<BrandToneAggregate | null>;
}

function buildBrandKey(accountId: string, postId: string): string {
  if (!accountId) throw new Error('BRAND_ACCOUNT_ID_EMPTY');
  if (!postId) throw new Error('BRAND_POST_ID_EMPTY');
  return `brand:${accountId}:${postId}`;
}

/**
 * post → 임베딩용 텍스트 조합. title+body 앞 300자.
 */
function buildEmbedText(post: BrandPost): string {
  const bodyHead = post.bodyText.slice(0, 300);
  return [post.title, bodyHead].filter(Boolean).join(' — ');
}

export function createBrandEmbedder(deps: BrandEmbedderDeps): BrandEmbedder {
  if (!deps.embedder) throw new Error('BRAND_EMBEDDER_MISSING');
  if (!deps.store) throw new Error('BRAND_STORE_MISSING');

  const retriever = createRetriever({ embedder: deps.embedder, store: deps.store });
  const accountIndex = new Map<string, Set<string>>();    // accountId → set of recordId
  const perAccountAggregate = new Map<string, BrandPost[]>();  // accountId → posts (in-memory shadow)

  const upsertPost = async (post: BrandPost): Promise<void> => {
    if (!post.accountId) throw new Error('BRAND_POST_ACCOUNT_ID_EMPTY');
    const key = buildBrandKey(post.accountId, post.postId);
    const text = buildEmbedText(post);
    if (!text.trim()) throw new Error('BRAND_POST_TEXT_EMPTY');

    await retriever.upsertDocument({
      id: key,
      text,
      metadata: {
        accountId: post.accountId,
        postId: post.postId,
        title: post.title,
        category: post.category ?? '',
        publishedAt: post.publishedAt ?? '',
        tone: post.tone ?? '',
        bodyLength: post.bodyText.length,
      },
    });

    let set = accountIndex.get(post.accountId);
    if (!set) {
      set = new Set();
      accountIndex.set(post.accountId, set);
    }
    set.add(key);

    const arr = perAccountAggregate.get(post.accountId) ?? [];
    // 중복 제거: 같은 postId면 교체
    const filtered = arr.filter((p) => p.postId !== post.postId);
    filtered.push(post);
    perAccountAggregate.set(post.accountId, filtered);
  };

  const upsertPostBatch = async (posts: readonly BrandPost[]): Promise<void> => {
    for (const p of posts) await upsertPost(p);
  };

  const deleteAccountPosts = async (accountId: string): Promise<number> => {
    if (!accountId) throw new Error('BRAND_ACCOUNT_ID_EMPTY');
    const set = accountIndex.get(accountId);
    if (!set || set.size === 0) return 0;
    const ids = [...set];
    await deps.store.delete(ids);
    accountIndex.delete(accountId);
    perAccountAggregate.delete(accountId);
    return ids.length;
  };

  const searchSimilarPosts = async (options: BrandRetrievalOptions): Promise<RetrievedDocument[]> => {
    if (!options.accountId) throw new Error('BRAND_QUERY_ACCOUNT_ID_EMPTY');
    return retriever.search(options.query, {
      topK: options.topK,
      minScore: options.minScore,
      metadataFilter: (md) => {
        if (!md) return false;
        if (md.accountId !== options.accountId) return false;
        if (options.category && md.category !== options.category) return false;
        return true;
      },
    });
  };

  const aggregate = async (accountId: string): Promise<BrandToneAggregate | null> => {
    const posts = perAccountAggregate.get(accountId);
    if (!posts || posts.length === 0) return null;
    const perCat: Record<string, number> = {};
    const perTone: Record<string, number> = {};
    let titleSum = 0;
    let bodySum = 0;
    for (const p of posts) {
      const cat = p.category ?? 'unknown';
      const tone = p.tone ?? 'unknown';
      perCat[cat] = (perCat[cat] ?? 0) + 1;
      perTone[tone] = (perTone[tone] ?? 0) + 1;
      titleSum += p.title.length;
      bodySum += p.bodyText.length;
    }
    return {
      accountId,
      totalPosts: posts.length,
      perCategoryCount: perCat,
      perToneCount: perTone,
      avgTitleLength: Math.round(titleSum / posts.length),
      avgBodyLength: Math.round(bodySum / posts.length),
    };
  };

  return { upsertPost, upsertPostBatch, deleteAccountPosts, searchSimilarPosts, aggregate };
}
