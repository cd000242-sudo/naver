// src/homefeedAutopilot/topicScoring.ts
// [2026-10-15] Scores topic candidates by homefeed exposure odds x traffic potential.
//
// Owner decision (2026-10-15): auto-adopt the topic most likely to hit the homefeed and pull
// traffic. Everything measurable is scored here before the LLM picks the final one, and this
// score alone must be able to pick #1 — the fallback when there is no API key or the reply breaks.
//
// Signals (100 points + penalties):
//   demand     30  channels that posted the topic to the homefeed — already accepted by the feed
//   freshness  25  homefeed interest cools within hours
//   traffic    20  search volume when the topic overlaps a LEWORD brief (homefeed + search inflow)
//   priority   15  the benchmark's own verdict
//   reaction   10  like growth since capture
//   penalty        sensitive claim, headline-only, recycled, unknown date, pending verification

import type { HomefeedCandidate } from '../analytics/homefeedBenchmarkFeed.js';
import type { LewordPick } from '../analytics/lewordBoard.js';

export interface TopicScoreBreakdown {
  readonly demand: number;
  readonly freshness: number;
  readonly traffic: number;
  readonly priority: number;
  readonly reaction: number;
  readonly penalty: number;
}

export interface ScoredTopic {
  readonly keyword: string;
  readonly title: string;
  readonly category: string;
  readonly score: number;
  readonly breakdown: TopicScoreBreakdown;
  /** Human-readable reasons (Korean UI text), one line per signal. */
  readonly reasons: readonly string[];
  readonly candidate?: HomefeedCandidate;
  readonly brief?: LewordPick;
}

export interface TopicScoreInput {
  readonly candidates: readonly HomefeedCandidate[];
  readonly briefs: readonly LewordPick[];
  readonly now: number;
  /** Recently published keywords — never write the same topic twice. */
  readonly excludeKeywords?: readonly string[];
}

const FLAG_PENALTY: Record<string, number> = {
  'sensitive-claim': 15,
  'headline-only': 10,
  'recycled-material': 8,
  'possible-syndication': 5,
  'publication-date-unknown': 5,
};

const FLAG_LABEL: Record<string, string> = {
  'sensitive-claim': '민감한 주장',
  'headline-only': '제목만 있는 소재',
  'recycled-material': '재활용 소재',
  'possible-syndication': '중복 배포 의심',
  'publication-date-unknown': '발행일 미상',
};

const BRIEF_DEMAND: Record<string, number> = { NOW: 15, NEXT: 8, ALWAYS: 3 };

const HOUR_MS = 3_600_000;

/** Comparison key with spaces and punctuation removed. */
export function normalizeTopic(value: string): string {
  return value.toLowerCase().replace(/[\s"'“”‘’`.,!?·…:;()[\]{}<>《》「」『』|/\\~\-_+=]/g, '');
}

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[\s,·|/]+/).map(normalizeTopic).filter((t) => t.length >= 2);
}

/** Same topic when one contains the other, or the shorter side shares 2 tokens (its only token if it has one). */
export function topicMatches(a: string, b: string): boolean {
  const na = normalizeTopic(a);
  const nb = normalizeTopic(b);
  if (!na || !nb) return false;
  // Short keys ("연금") would swallow unrelated topics, so containment needs 4+ chars.
  if (Math.min(na.length, nb.length) >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  const shorter = Math.min(ta.length, tb.size);
  if (shorter === 0) return false;
  const shared = ta.filter((t) => tb.has(t));
  if (shorter === 1) return shared.some((t) => t.length >= 4);
  return shared.length >= 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Log scale that keeps separating up to ~15 channels (1→7.5, 3→15, 7→22.5, 15→30). */
function demandScore(channels: number): number {
  return Math.min(30, 7.5 * Math.log2(1 + Math.max(0, channels)));
}

function freshnessScore(publishedAt: string, now: number): { score: number; hours: number | null } {
  const at = Date.parse(publishedAt);
  if (!Number.isFinite(at)) return { score: 5, hours: null };
  const hours = Math.max(0, (now - at) / HOUR_MS);
  if (hours <= 6) return { score: 25, hours };
  if (hours <= 12) return { score: 20, hours };
  if (hours <= 24) return { score: 14, hours };
  if (hours <= 48) return { score: 6, hours };
  return { score: 0, hours };
}

function trafficScore(searchVolume: number | null | undefined): number {
  if (!searchVolume || searchVolume <= 0) return 0;
  return Math.min(20, 5 * Math.log10(1 + searchVolume));
}

function priorityScore(priority: number | null): number {
  if (priority === null) return 0;
  return Math.max(0, Math.min(15, ((priority - 40) / 49) * 15));
}

function reactionScore(likesGrowth: number | null): number {
  if (!likesGrowth || likesGrowth <= 0) return 0;
  return Math.min(10, 3 * Math.log2(1 + likesGrowth));
}

function scoreCandidate(candidate: HomefeedCandidate, brief: LewordPick | undefined, now: number): ScoredTopic {
  const reasons: string[] = [];
  const demand = demandScore(candidate.channels);
  reasons.push(`홈판 채널 ${candidate.channels}곳이 같은 소재로 글을 올림`);

  const fresh = freshnessScore(candidate.publishedAt, now);
  reasons.push(fresh.hours === null ? '발행 시각 미상' : `최초 노출 후 ${Math.round(fresh.hours)}시간 경과`);

  const traffic = trafficScore(brief?.searchVolume);
  if (brief) {
    const volume = brief.searchVolume === null ? '검색량 미상' : `월 검색량 ${brief.searchVolume.toLocaleString('ko-KR')}`;
    reasons.push(`LEWORD 오늘의 글감과 겹침(${brief.verdict || '브리프'}) · ${volume}`);
  }

  const priority = priorityScore(candidate.priority);
  const reaction = reactionScore(candidate.likesGrowth);
  if (reaction > 0) reasons.push(`수집 이후 좋아요 +${candidate.likesGrowth}`);

  let penalty = 0;
  for (const flag of candidate.flags) {
    const cost = FLAG_PENALTY[flag] ?? 0;
    if (cost === 0) continue;
    penalty += cost;
    reasons.push(`감점: ${FLAG_LABEL[flag] ?? flag}`);
  }
  if (candidate.status === 'verify') {
    penalty += 5;
    reasons.push('감점: 원문 검증 대기');
  }

  const breakdown = {
    demand: round1(demand),
    freshness: fresh.score,
    traffic: round1(traffic),
    priority: round1(priority),
    reaction: round1(reaction),
    penalty: -penalty,
  };
  const score = round1(demand + fresh.score + traffic + priority + reaction - penalty);
  return { keyword: candidate.keyword, title: candidate.title, category: candidate.category, score, breakdown, reasons, candidate, brief };
}

/** A LEWORD brief absent from the homefeed benchmark — a search-traffic candidate; demand comes from timing only. */
function scoreBriefOnly(brief: LewordPick): ScoredTopic {
  const demand = BRIEF_DEMAND[brief.verdict] ?? 0;
  const traffic = trafficScore(brief.searchVolume);
  const volume = brief.searchVolume === null ? '검색량 미상' : `월 검색량 ${brief.searchVolume.toLocaleString('ko-KR')}`;
  const reasons = [`LEWORD 오늘의 글감(${brief.verdict || '브리프'}) · ${volume}`, '홈판 벤치마크에는 아직 없음 — 홈판 수요는 미확인'];
  const breakdown = { demand, freshness: brief.verdict === 'NOW' ? 15 : 0, traffic: round1(traffic), priority: 0, reaction: 0, penalty: 0 };
  const score = round1(demand + breakdown.freshness + traffic);
  return { keyword: brief.keyword, title: brief.briefTitle || brief.keyword, category: brief.lane, score, breakdown, reasons, brief };
}

/**
 * Scores every candidate, highest first.
 * Drops stale topics and topics already published recently.
 */
export function scoreHomefeedTopics(input: TopicScoreInput): ScoredTopic[] {
  const exclude = (input.excludeKeywords ?? []).filter(Boolean);
  const alreadyWritten = (keyword: string): boolean => exclude.some((done) => topicMatches(done, keyword));
  const usedBriefs = new Set<LewordPick>();

  const scored: ScoredTopic[] = [];
  for (const candidate of input.candidates) {
    if (candidate.status === 'stale' || alreadyWritten(candidate.keyword)) continue;
    const brief = input.briefs.find((b) => topicMatches(b.keyword, candidate.keyword) || topicMatches(b.keyword, candidate.title));
    if (brief) usedBriefs.add(brief);
    scored.push(scoreCandidate(candidate, brief, input.now));
  }
  for (const brief of input.briefs) {
    if (usedBriefs.has(brief) || alreadyWritten(brief.keyword)) continue;
    scored.push(scoreBriefOnly(brief));
  }
  return scored.sort((a, b) => b.score - a.score);
}
