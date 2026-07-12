const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+/u;
const DEFAULT_SENTENCE_MIN_LENGTH = 8;

function finiteUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeText(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return '';

  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

export function jaccardSimilarity(
  left: string | readonly string[],
  right: string | readonly string[],
): number {
  const leftTokens = new Set(typeof left === 'string' ? tokenize(left) : left.map(normalizeText).filter(Boolean));
  const rightTokens = new Set(typeof right === 'string' ? tokenize(right) : right.map(normalizeText).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return finiteUnitInterval(intersection / (leftTokens.size + rightTokens.size - intersection));
}

export function titleTokenJaccard(leftTitle: string, rightTitle: string): number {
  return jaccardSimilarity(leftTitle, rightTitle);
}

export function characterNgrams(value: string, size = 3): string[] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`NGRAM_SIZE_INVALID: ${size}`);
  }

  const compact = normalizeText(value).replace(/\s+/gu, '');
  if (!compact) return [];
  if (compact.length <= size) return [compact];

  return Array.from({ length: compact.length - size + 1 }, (_, index) => (
    compact.slice(index, index + size)
  ));
}

function countTerms(terms: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

function inverseDocumentFrequency(term: string, documents: readonly ReadonlySet<string>[]): number {
  const containingDocuments = documents.reduce((count, document) => (
    count + (document.has(term) ? 1 : 0)
  ), 0);
  return Math.log((documents.length + 1) / (containingDocuments + 1)) + 1;
}

export function tfIdfCosineSimilarity(
  leftTerms: readonly string[],
  rightTerms: readonly string[],
  corpusTerms: readonly (readonly string[])[] = [],
): number {
  if (leftTerms.length === 0 || rightTerms.length === 0) return 0;

  const allTerms = [leftTerms, rightTerms, ...corpusTerms];
  const documentSets = allTerms.map((terms) => new Set(terms));
  const leftCounts = countTerms(leftTerms);
  const rightCounts = countTerms(rightTerms);
  const vocabulary = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  let dotProduct = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const term of vocabulary) {
    const idf = inverseDocumentFrequency(term, documentSets);
    const leftWeight = (leftCounts.get(term) ?? 0) * idf;
    const rightWeight = (rightCounts.get(term) ?? 0) * idf;
    dotProduct += leftWeight * rightWeight;
    leftNorm += leftWeight * leftWeight;
    rightNorm += rightWeight * rightWeight;
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return finiteUnitInterval(dotProduct / Math.sqrt(leftNorm * rightNorm));
}

export function charNgramTfIdfCosine(
  left: string,
  right: string,
  corpus: readonly string[] = [],
  size = 3,
): number {
  return tfIdfCosineSimilarity(
    characterNgrams(left, size),
    characterNgrams(right, size),
    corpus.map((document) => characterNgrams(document, size)),
  );
}

export const introCharNgramCosine = charNgramTfIdfCosine;

export function splitNormalizedSentences(
  value: string,
  minimumLength = DEFAULT_SENTENCE_MIN_LENGTH,
): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];

  const withoutHeadings = value
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => !MARKDOWN_HEADING.test(line))
    .join('\n');

  return withoutHeadings
    .split(/(?<=[.!?。！？])\s+|\n+/gu)
    .map(normalizeText)
    .filter((sentence) => sentence.length >= Math.max(1, minimumLength));
}

export function exactSentenceReuseRatio(candidate: string, reference: string): number {
  const candidateSentences = splitNormalizedSentences(candidate);
  if (candidateSentences.length === 0) return 0;

  const referenceSentences = new Set(splitNormalizedSentences(reference));
  if (referenceSentences.size === 0) return 0;
  const reusedCount = candidateSentences.reduce((count, sentence) => (
    count + (referenceSentences.has(sentence) ? 1 : 0)
  ), 0);
  return finiteUnitInterval(reusedCount / candidateSentences.length);
}

function headingsMatch(candidate: string, reference: string): boolean {
  const normalizedCandidate = normalizeText(candidate);
  const normalizedReference = normalizeText(reference);
  if (!normalizedCandidate || !normalizedReference) return false;
  if (normalizedCandidate === normalizedReference) return true;
  return jaccardSimilarity(normalizedCandidate, normalizedReference) >= 0.8;
}

export function headingOverlapRatio(
  candidateHeadings: readonly string[],
  referenceHeadings: readonly string[],
): number {
  const candidates = candidateHeadings.map(normalizeText).filter(Boolean);
  const references = referenceHeadings.map(normalizeText).filter(Boolean);
  if (candidates.length === 0 || references.length === 0) return 0;

  const unmatchedReferences = new Set(references.map((_, index) => index));
  let matchedCount = 0;
  for (const candidate of candidates) {
    const matchedIndex = [...unmatchedReferences].find((index) => (
      headingsMatch(candidate, references[index])
    ));
    if (matchedIndex === undefined) continue;
    unmatchedReferences.delete(matchedIndex);
    matchedCount += 1;
  }

  return finiteUnitInterval(matchedCount / candidates.length);
}

export function tokenCoverage(needle: string, haystack: string): number {
  const needleTokens = new Set(tokenize(needle));
  if (needleTokens.size === 0) return 0;
  const haystackTokens = new Set(tokenize(haystack));
  let covered = 0;
  for (const token of needleTokens) {
    if (haystackTokens.has(token)) covered += 1;
  }
  return finiteUnitInterval(covered / needleTokens.size);
}

export function firstNormalizedSentence(value: string): string {
  return splitNormalizedSentences(value, 4)[0] ?? '';
}

export function removeExactPhrases(value: string, phrases: readonly string[]): string {
  return phrases.reduce((result, phrase) => {
    if (!phrase) return result;
    return result.split(phrase).join(' ');
  }, value);
}
