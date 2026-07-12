import { HashEmbedder, type Embedder } from '../rag/embedder';
import { cosineSimilarity } from '../rag/vectorStore';
import {
  charNgramTfIdfCosine,
  exactSentenceReuseRatio,
  firstNormalizedSentence,
  headingOverlapRatio,
  normalizeText,
  removeExactPhrases,
  titleTokenJaccard,
} from './textMetrics';
import type {
  ArticleDraft,
  ContentPolicyConfig,
  ContentPolicyInput,
  RecentPostRecord,
  SimilarityReport,
  SimilarityRisk,
  SourceMaterial,
} from './types';

export const SIMILARITY_PATTERNS = {
  title: 'TITLE_JACCARD_EXCEEDED',
  intro: 'INTRO_NGRAM_COSINE_EXCEEDED',
  exactSentence: 'EXACT_SENTENCE_REUSE_EXCEEDED',
  body: 'BODY_EMBEDDING_COSINE_EXCEEDED',
  headings: 'HEADING_OVERLAP_EXCEEDED',
  sourceCopy: 'SOURCE_COPY',
  repeatedOpening: 'REPEATED_OPENING_PATTERN',
} as const;

interface RecentPostScore {
  readonly articleId: string;
  readonly titleJaccard: number;
  readonly introCosine: number;
  readonly bodyCosine: number;
  readonly headingOverlap: number;
  readonly sentenceReuse: number;
  readonly relativeScore: number;
}

interface SourceCopyScore {
  readonly bodyCosine: number;
  readonly ngramCosine: number;
  readonly sentenceReuse: number;
}

const DEFAULT_EMBEDDER = new HashEmbedder();

function bodyForDraft(draft: ArticleDraft): string {
  if (draft.body_markdown.trim()) return draft.body_markdown;
  return [draft.introduction, ...draft.headings.map((heading) => heading.content)].join('\n\n');
}

function comparisonText(value: string, fixedDisclosures: readonly string[]): string {
  return removeExactPhrases(value, fixedDisclosures).trim();
}

function relativeMetric(value: number, threshold: number): number {
  if (threshold <= 0) return value > 0 ? 2 : 0;
  return value / threshold;
}

function relativePostScore(
  score: Omit<RecentPostScore, 'articleId' | 'relativeScore'>,
  config: ContentPolicyConfig,
): number {
  const thresholds = config.similarity;
  return Math.max(
    relativeMetric(score.titleJaccard, thresholds.title_token_jaccard_max),
    relativeMetric(score.introCosine, thresholds.intro_char_ngram_cosine_max),
    relativeMetric(score.bodyCosine, thresholds.body_embedding_cosine_max),
    relativeMetric(score.headingOverlap, thresholds.heading_overlap_max),
    relativeMetric(score.sentenceReuse, thresholds.exact_sentence_reuse_ratio_max),
  );
}

function openingMatches(candidate: string, reference: string): boolean {
  if (!candidate || !reference) return false;
  if (candidate === reference) return true;
  if (candidate.length < 12 || reference.length < 12) return false;
  return charNgramTfIdfCosine(candidate, reference) >= 0.88;
}

function hasRepeatedOpening(
  draft: ArticleDraft,
  posts: readonly RecentPostRecord[],
  config: ContentPolicyConfig,
): boolean {
  const opening = firstNormalizedSentence(draft.introduction || bodyForDraft(draft));
  if (!opening) return false;

  const windowPosts = posts.slice(0, Math.max(0, config.similarity.repeated_opening_window));
  const previousOccurrences = windowPosts.reduce((count, post) => (
    count + (openingMatches(opening, firstNormalizedSentence(post.intro || post.body)) ? 1 : 0)
  ), 0);
  return previousOccurrences > 0
    && previousOccurrences + 1 > config.similarity.repeated_opening_max_occurrences;
}

function sourceCanBeChecked(source: SourceMaterial): boolean {
  return source.type !== 'first_party' && normalizeText(source.content).length >= 20;
}

function isSourceCopy(score: SourceCopyScore, config: ContentPolicyConfig): boolean {
  const thresholds = config.similarity;
  const substantialSentenceReuse = score.sentenceReuse >= Math.max(0.5, thresholds.exact_sentence_reuse_ratio_max);
  const embeddingAndNgramMatch = score.bodyCosine > thresholds.body_embedding_cosine_max
    && score.ngramCosine > thresholds.intro_char_ngram_cosine_max;
  return substantialSentenceReuse || embeddingAndNgramMatch || score.ngramCosine >= 0.92;
}

function thresholdPatterns(
  maxima: Omit<RecentPostScore, 'articleId' | 'relativeScore'>,
  config: ContentPolicyConfig,
): string[] {
  const thresholds = config.similarity;
  const candidates: Array<string | null> = [
    maxima.titleJaccard > thresholds.title_token_jaccard_max ? SIMILARITY_PATTERNS.title : null,
    maxima.introCosine > thresholds.intro_char_ngram_cosine_max ? SIMILARITY_PATTERNS.intro : null,
    maxima.sentenceReuse > thresholds.exact_sentence_reuse_ratio_max ? SIMILARITY_PATTERNS.exactSentence : null,
    maxima.bodyCosine > thresholds.body_embedding_cosine_max ? SIMILARITY_PATTERNS.body : null,
    maxima.headingOverlap > thresholds.heading_overlap_max ? SIMILARITY_PATTERNS.headings : null,
  ];
  return candidates.filter((pattern): pattern is string => pattern !== null);
}

function classifyRisk(patterns: readonly string[], exactSentenceReuse: number): SimilarityRisk {
  if (patterns.includes(SIMILARITY_PATTERNS.sourceCopy)) return 'HIGH';
  const similarityBreaches = patterns.filter((pattern) => (
    pattern !== SIMILARITY_PATTERNS.repeatedOpening
  )).length;
  if (similarityBreaches >= 2 || exactSentenceReuse >= 0.5) return 'HIGH';
  return patterns.length > 0 ? 'MEDIUM' : 'LOW';
}

function maximaFor(scores: readonly RecentPostScore[]): Omit<RecentPostScore, 'articleId' | 'relativeScore'> {
  return scores.reduce((maxima, score) => ({
    titleJaccard: Math.max(maxima.titleJaccard, score.titleJaccard),
    introCosine: Math.max(maxima.introCosine, score.introCosine),
    bodyCosine: Math.max(maxima.bodyCosine, score.bodyCosine),
    headingOverlap: Math.max(maxima.headingOverlap, score.headingOverlap),
    sentenceReuse: Math.max(maxima.sentenceReuse, score.sentenceReuse),
  }), {
    titleJaccard: 0,
    introCosine: 0,
    bodyCosine: 0,
    headingOverlap: 0,
    sentenceReuse: 0,
  });
}

export async function analyzeSimilarity(
  input: ContentPolicyInput,
  draft: ArticleDraft,
  config: ContentPolicyConfig,
  embedder: Embedder = DEFAULT_EMBEDDER,
): Promise<SimilarityReport> {
  const posts = [...(input.recent_posts ?? [])];
  const fixedDisclosures = [...(input.fixed_disclosures ?? [])];
  const draftBody = comparisonText(bodyForDraft(draft), fixedDisclosures);
  const postBodies = posts.map((post) => comparisonText(post.body, fixedDisclosures));
  const checkedSources = (input.source_materials ?? []).filter(sourceCanBeChecked);
  const sourceBodies = checkedSources.map((source) => comparisonText(source.content, fixedDisclosures));
  const embedded = await embedder.embedBatch([draftBody, ...postBodies, ...sourceBodies]);
  const draftEmbedding = embedded[0];
  const introCorpus = posts.map((post) => post.intro);

  const postScores = posts.map((post, index): RecentPostScore => {
    const metrics = {
      titleJaccard: titleTokenJaccard(draft.title, post.title),
      introCosine: charNgramTfIdfCosine(draft.introduction, post.intro, introCorpus),
      bodyCosine: cosineSimilarity(draftEmbedding.vector, embedded[index + 1].vector),
      headingOverlap: headingOverlapRatio(draft.headings.map((heading) => heading.title), post.headings),
      sentenceReuse: exactSentenceReuseRatio(draftBody, postBodies[index]),
    };
    return {
      articleId: post.article_id,
      ...metrics,
      relativeScore: relativePostScore(metrics, config),
    };
  });

  const sourceOffset = 1 + posts.length;
  const sourceScores = sourceBodies.map((sourceBody, index): SourceCopyScore => ({
    bodyCosine: cosineSimilarity(draftEmbedding.vector, embedded[sourceOffset + index].vector),
    ngramCosine: charNgramTfIdfCosine(draftBody, sourceBody, sourceBodies),
    sentenceReuse: exactSentenceReuseRatio(draftBody, sourceBody),
  }));
  const copiedSource = sourceScores.some((score) => isSourceCopy(score, config));
  const maxima = maximaFor(postScores);
  const patterns = [
    ...thresholdPatterns(maxima, config),
    ...(copiedSource ? [SIMILARITY_PATTERNS.sourceCopy] : []),
    ...(hasRepeatedOpening(draft, posts, config) ? [SIMILARITY_PATTERNS.repeatedOpening] : []),
  ];
  const mostSimilar = [...postScores].sort((left, right) => right.relativeScore - left.relativeScore)[0];

  return {
    risk: classifyRisk(patterns, maxima.sentenceReuse),
    most_similar_article_id: mostSimilar?.articleId ?? null,
    title_jaccard: maxima.titleJaccard,
    intro_ngram_cosine: maxima.introCosine,
    body_embedding_cosine: maxima.bodyCosine,
    heading_overlap: maxima.headingOverlap,
    exact_sentence_reuse_ratio: maxima.sentenceReuse,
    matched_patterns: [...new Set(patterns)],
    embedding_model: draftEmbedding.model,
    compared_post_count: posts.length,
  };
}

export function hasSourceCopySignal(report: SimilarityReport): boolean {
  return report.matched_patterns.includes(SIMILARITY_PATTERNS.sourceCopy);
}
