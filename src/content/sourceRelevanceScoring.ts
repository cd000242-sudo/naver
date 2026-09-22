// src/content/sourceRelevanceScoring.ts
//
// [P1 relevance v2] Per-document relevance scoring — the entity/intent
// weighting math lives here. Cross-document concerns (duplicates, topic
// classification, "now") live in their own modules and are threaded in as
// precomputed inputs (entities/modifiers/freshness), so this stays a pure
// function: same inputs, same score, every time.

import type { SourceDocument, SourceTier } from './sourceDocument.js';
import { extractKeywordTokens, fuzzyContains, fuzzyCoverage } from './sourceRelevanceEntities.js';
import type { FreshnessInfo } from './topicFreshness.js';

export type RejectReason =
  | 'REJECT_ENTITY_MISMATCH'
  | 'REJECT_BODY_IRRELEVANT'
  | 'REJECT_TOO_OLD'
  | 'REJECT_DUPLICATE'
  | 'REJECT_LOW_SOURCE_QUALITY'
  | 'REJECT_JUDGE_IRRELEVANT'; // ambiguous band, rejected by the selected-engine judge (P1)

export interface RelevanceComponents {
  mainEntityMatch: number;
  mainKeywordMatch: number;
  intentMatch: number;
  freshnessScore: number;
  sourceQuality: number;
  titleRelevance: number;
  bodyRelevance: number;
}

export interface DocumentScore {
  score: number;
  accepted: boolean;
  reason?: RejectReason;
  components: RelevanceComponents;
  stale: boolean;
}

const SOURCE_QUALITY_BY_TIER: Record<SourceTier, number> = {
  OFFICIAL: 1.0,
  NEWS: 0.85,
  BLOG: 0.6,
  COMMUNITY: 0.45, // covers both cafe and kin — SourceTier has no separate split
  UNKNOWN: 0.4,
};

const LONG_BODY_CHARS = 600;
const BODY_IRRELEVANT_MAX = 0.15;
// [P1 live 청약통장 금리] a single passing mention ("…청약통장…" once in a 2,000-char jeonse article,
// often inside a trailing 관련기사 list) used to score bodyRelevance = 1.0. The body entity signal is
// now density- and position-aware; an entity that is absent from the title AND only mentioned in
// passing is REJECT_BODY_IRRELEVANT.
const BODY_ENTITY_PASSING_MAX = 0.3;
const BODY_LEAD_RATIO = 0.3;
const BODY_TAIL_RATIO = 0.7;

function countHits(haystack: string, needle: string): { hits: number; first: number; last: number } {
  let hits = 0; let first = -1; let last = -1;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    hits += 1;
    if (first < 0) first = idx;
    last = idx;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return { hits, first, last };
}

/**
 * Entity presence in the body as a 0..1 signal: hits per 1,000 chars (2/1k → 1.0), +0.25 when the
 * entity appears in the lead 30%, 0 when the only mention sits in the trailing 30% (related-links zone).
 */
export function bodyEntitySignal(body: string, entity: string): number {
  const len = body.length;
  if (len === 0 || !entity) return 0;
  const { hits, first, last } = countHits(body, entity);
  if (hits === 0) return fuzzyContains(body, entity) ? 0.15 : 0;
  if (hits === 1 && first >= len * BODY_TAIL_RATIO) return 0;
  const density = Math.min(1, hits / Math.max(1, len / 1000) / 2);
  const leadBonus = first <= len * BODY_LEAD_RATIO ? 0.25 : 0;
  void last;
  return Math.min(1, density + leadBonus);
}
const LOW_QUALITY_TIER_MAX = 0.4;
const LOW_QUALITY_SCORE_MAX = 0.5;

/** 1 = entity in title, 0.7 = >=2 body hits, 0.4 = 1 body hit, 0 = not found (exact or fuzzy). */
function mainEntityMatchScore(entity: string, title: string, body: string): number {
  if (fuzzyContains(title, entity)) return 1;
  let bodyHits = 0;
  let idx = body.indexOf(entity);
  while (idx !== -1) {
    bodyHits += 1;
    idx = body.indexOf(entity, idx + entity.length);
  }
  if (bodyHits === 0 && fuzzyContains(body, entity)) bodyHits = 1; // weak fuzzy hit counts once
  if (bodyHits >= 2) return 0.7;
  if (bodyHits === 1) return 0.4;
  return 0;
}

/** Legacy-style token overlap (title hit weighs 2x a body-only hit) — kept as one scoring component. */
function legacyKeywordMatch(keyword: string, title: string, body: string): number {
  const tokens = extractKeywordTokens(keyword);
  if (tokens.length === 0) return 1;
  let earned = 0;
  for (const token of tokens) {
    if (title.includes(token)) earned += 2;
    else if (body.includes(token)) earned += 1;
  }
  return Math.min(1, earned / (tokens.length * 2));
}

/**
 * Scores one document against the keyword's main entity + modifiers. Pure —
 * never mutates `doc`. `freshness` is precomputed by the caller
 * (topicFreshness.freshnessScore) so this function stays decoupled from
 * "now"/topic classification.
 */
export function scoreDocument(
  doc: SourceDocument,
  keyword: string,
  entities: string[],
  modifiers: string[],
  freshness: FreshnessInfo,
): DocumentScore {
  const title = doc.title || '';
  const body = doc.cleanedBody ?? doc.body ?? '';
  const bodyLen = body.length;

  const mainEntityMatch = entities.length > 0
    ? Math.max(...entities.map((e) => mainEntityMatchScore(e, title, body)))
    : 1;
  const entityHardFail = entities.length > 0 && mainEntityMatch === 0;

  const mainKeywordMatch = legacyKeywordMatch(keyword, title, body);
  const intentMatch = fuzzyCoverage(modifiers, `${title} ${body}`);

  const titleEntityPart = entities.length > 0 ? (fuzzyContains(title, entities[0]) ? 1 : 0) : 1;
  const titleModifierPart = fuzzyCoverage(modifiers, title);
  const titleRelevance = entities.length > 0 ? 0.6 * titleEntityPart + 0.4 * titleModifierPart : titleModifierPart;

  // Independent of mainEntityMatch (which counts a title-only hit as a full match) — bodyRelevance
  // needs to know whether the entity is actually IN the body, not just somewhere in the document.
  const bodyEntityPart = entities.length > 0 ? Math.max(...entities.map((e) => bodyEntitySignal(body, e))) : 1;
  const bodyModifierPart = fuzzyCoverage(modifiers, body);
  const bodyRelevance = entities.length > 0 ? 0.65 * bodyEntityPart + 0.35 * bodyModifierPart : bodyModifierPart;

  const sourceQuality = SOURCE_QUALITY_BY_TIER[doc.sourceTier] ?? 0.4;

  const isLongBody = bodyLen >= LONG_BODY_CHARS;
  const wTitle = isLongBody ? 0.2 : 0.5;
  const wBody = isLongBody ? 0.6 : 0.3;
  const score = Math.min(1, Math.max(0,
    wTitle * titleRelevance
    + wBody * bodyRelevance
    + 0.08 * mainEntityMatch
    + 0.04 * mainKeywordMatch
    + 0.04 * intentMatch
    + 0.04 * sourceQuality,
  ));

  const components: RelevanceComponents = {
    mainEntityMatch,
    mainKeywordMatch,
    intentMatch,
    freshnessScore: freshness.score,
    sourceQuality,
    titleRelevance,
    bodyRelevance,
  };

  let accepted = true;
  let reason: RejectReason | undefined;
  const titleOrEntityMatched = titleRelevance > 0 || mainEntityMatch > 0;
  if (entityHardFail) {
    accepted = false;
    reason = 'REJECT_ENTITY_MISMATCH';
  } else if (titleOrEntityMatched && bodyLen > 0 && bodyRelevance <= BODY_IRRELEVANT_MAX) {
    accepted = false;
    reason = 'REJECT_BODY_IRRELEVANT';
  } else if (entities.length > 0 && titleEntityPart === 0 && bodyLen >= LONG_BODY_CHARS && bodyEntityPart < BODY_ENTITY_PASSING_MAX) {
    // Entity not in the title and only mentioned in passing in a long body → a different subject.
    accepted = false;
    reason = 'REJECT_BODY_IRRELEVANT';
  } else if (freshness.tooOld) {
    accepted = false;
    reason = 'REJECT_TOO_OLD';
  } else if (sourceQuality <= LOW_QUALITY_TIER_MAX && score < LOW_QUALITY_SCORE_MAX) {
    accepted = false;
    reason = 'REJECT_LOW_SOURCE_QUALITY';
  }

  return { score, accepted, reason, components, stale: freshness.stale && accepted };
}
