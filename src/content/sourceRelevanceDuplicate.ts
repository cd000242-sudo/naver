// src/content/sourceRelevanceDuplicate.ts
//
// [P1 relevance v2] Cross-document duplicate detection: same URL, a
// near-identical (normalized) title, or heavy body overlap with a document
// already accepted. Kept as its own module because it needs a running list
// of "already accepted" documents, unlike the per-document scorers in
// sourceRelevanceScoring.ts.

import { bigramDiceSimilarity } from './sourceRelevanceEntities.js';

const TITLE_SIMILARITY_THRESHOLD = 0.9;
const BODY_OVERLAP_THRESHOLD = 0.8;
const MIN_BODY_LEN_FOR_OVERLAP_CHECK = 50;
const SHINGLE_SIZE = 8;

export interface AcceptedDocRef {
  url: string;
  normalizedTitle: string;
  bodyShingles: Set<string>;
}

export function normalizeTitle(title: string): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, '')
    .trim();
}

function charShingles(text: string, size: number): Set<string> {
  const out = new Set<string>();
  const t = text.replace(/\s+/g, ' ').trim();
  for (let i = 0; i + size <= t.length; i += 1) out.add(t.slice(i, i + size));
  return out;
}

/**
 * Jaccard similarity |A ∩ B| / |A ∪ B| — not the (min-denominator) overlap
 * coefficient, deliberately: two articles that share one boilerplate quoted
 * sentence but otherwise diverge would look near-100% "duplicate" under a
 * min-based metric once one of them is short. Jaccard only flags documents
 * whose content is duplicated almost in full, which is the actual target.
 */
function shingleJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let hits = 0;
  for (const gram of small) if (large.has(gram)) hits += 1;
  const union = a.size + b.size - hits;
  return union === 0 ? 0 : hits / union;
}

export function makeAcceptedDocRef(url: string, title: string, body: string): AcceptedDocRef {
  return {
    url: url || '',
    normalizedTitle: normalizeTitle(title),
    bodyShingles: charShingles(body || '', SHINGLE_SIZE),
  };
}

/** True when `candidate` duplicates any already-accepted reference. Pure — reads only. */
export function isDuplicateOfAny(
  candidate: { url: string; title: string; body: string },
  acceptedRefs: AcceptedDocRef[],
): boolean {
  const url = candidate.url || '';
  const normTitle = normalizeTitle(candidate.title);
  const bodyLongEnough = (candidate.body || '').length >= MIN_BODY_LEN_FOR_OVERLAP_CHECK;
  const candidateShingles = bodyLongEnough ? charShingles(candidate.body, SHINGLE_SIZE) : null;

  return acceptedRefs.some((ref) => {
    if (url && ref.url && url === ref.url) return true;
    if (normTitle && ref.normalizedTitle
      && bigramDiceSimilarity(normTitle, ref.normalizedTitle) >= TITLE_SIMILARITY_THRESHOLD) return true;
    if (candidateShingles && ref.bodyShingles.size > 0) {
      return shingleJaccard(candidateShingles, ref.bodyShingles) >= BODY_OVERLAP_THRESHOLD;
    }
    return false;
  });
}
