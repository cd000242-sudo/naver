// src/content/topicFreshness.ts
//
// [P1 relevance v2] Generic topic-type classification + age-decay freshness
// scoring. No per-keyword or per-product rules — only vocabulary *classes*
// (policy-ish, vehicle-ish) and structural signals (news-source share, year
// tokens in the keyword). A "2026 셀토스 하이브리드 모의견적" search and a
// "부산 청년 정착지원사업" search need very different staleness tolerance;
// a single 30-day homefeed-style cutoff was either too strict (car specs
// barely change) or too loose (a week-old policy article can already be
// wrong) for everything that isn't a news issue.

import type { SourceDocument } from './sourceDocument.js';

export type TopicType = 'NEWS_ISSUE' | 'POLICY' | 'CAR' | 'EVERGREEN';

const POLICY_VOCAB = ['신청', '지원', '공고', '모집', '조건', '대상', '접수', '시행', '개정', '자격'];
const CAR_VOCAB = ['견적', '트림', '연식', '가격표', '제원', '풀체인지', '시승', '출고'];
// [P1 live 제주 10월 가볼만한곳] Evergreen intent classes — a travel/how-to/definition search must
// not be treated as a news issue just because news outlets cover it; a month token ("10월") is a
// season, not a breaking-news date. Vocabulary classes only — no place or product names.
const EVERGREEN_VOCAB = ['가볼만한', '가볼 만한', '여행', '맛집', '코스', '추천', '방법', '뜻', '차이', '비교', '후기', '정리', '총정리', '하는법', '만드는', '레시피'];
const YEAR_TOKEN_RE = /\b(19|20)\d{2}\b/;

/** Half-life (days) for the freshness decay curve, per topic type. */
export const HALF_LIFE_DAYS: Record<TopicType, number> = {
  NEWS_ISSUE: 7,
  POLICY: 60,
  CAR: 120,
  EVERGREEN: 365,
};

/** Max age (days) before a KNOWN-dated document is rejected as too old. Infinity = never. */
export const REJECT_AFTER_DAYS: Record<TopicType, number> = {
  NEWS_ISSUE: 30,
  POLICY: 365,
  CAR: 540,
  EVERGREEN: Infinity,
};

/** Fixed score applied when the document has no known publish date. */
const UNKNOWN_DATE_SCORE = 0.3;
/** Below this decayed score (and not already rejected), a kept document is flagged `stale`. */
const STALE_BELOW_SCORE = 0.4;

function hasVocab(text: string, vocab: string[]): boolean {
  return vocab.some((word) => text.includes(word));
}

/**
 * Classifies the topic type from generic structural signals only:
 * policy/vehicle vocabulary classes in the keyword take priority; otherwise
 * falls back to the share of news-tier documents / a year token in the
 * keyword (NEWS_ISSUE), else EVERGREEN.
 */
export function classifyTopicType(keyword: string, docs: SourceDocument[] = []): TopicType {
  const text = String(keyword ?? '');
  if (hasVocab(text, POLICY_VOCAB)) return 'POLICY';
  if (hasVocab(text, CAR_VOCAB)) return 'CAR';
  if (hasVocab(text, EVERGREEN_VOCAB)) return 'EVERGREEN';

  const newsCount = docs.filter((d) => d.sourceTier === 'NEWS' || d.sourceType === 'news').length;
  const newsShare = docs.length > 0 ? newsCount / docs.length : 0;
  if (newsShare > 0.5 || YEAR_TOKEN_RE.test(text)) return 'NEWS_ISSUE';

  return 'EVERGREEN';
}

/** Days between `pubDate` ('YYYY-MM-DD') and `now`. Infinity when pubDate is unparseable. */
export function ageDaysBetween(pubDate: string, now: Date): number {
  const then = new Date(`${pubDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Infinity;
  return Math.max(0, (now.getTime() - then) / (1000 * 60 * 60 * 24));
}

export interface FreshnessInfo {
  /** 0..1, decayed by the topic's half-life (or UNKNOWN_DATE_SCORE when the date is unknown). */
  score: number;
  /** Age exceeds the topic's reject threshold — a hard REJECT_TOO_OLD candidate. */
  tooOld: boolean;
  /** Kept (not tooOld) but noticeably aged — renderer should warn readers not to treat it as current. */
  stale: boolean;
  ageDays: number | null;
}

/** Pure — no mutation, no I/O. `now` is injectable for deterministic tests. */
export function freshnessScore(doc: SourceDocument, topicType: TopicType, now: Date = new Date()): FreshnessInfo {
  if (doc.dateStatus !== 'KNOWN' || !doc.pubDate) {
    return { score: UNKNOWN_DATE_SCORE, tooOld: false, stale: false, ageDays: null };
  }
  const ageDays = ageDaysBetween(doc.pubDate, now);
  const halfLife = HALF_LIFE_DAYS[topicType];
  const score = Math.min(1, Math.max(0, 0.5 ** (ageDays / halfLife)));
  const rejectAfter = REJECT_AFTER_DAYS[topicType];
  const tooOld = ageDays > rejectAfter;
  const stale = !tooOld && score < STALE_BELOW_SCORE;
  return { score, tooOld, stale, ageDays };
}
