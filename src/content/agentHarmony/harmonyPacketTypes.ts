/**
 * Agent harmony packet — shared types and limits (Release C1, 2026-11-04).
 *
 * The harmony session asks the agent CLI for two extra JSON fields next to the article:
 *   harmonyPacket   — what the session decided (material, strategy, title candidates, payoff sentence)
 *   complementReport — instructions the session found conflicting / missing / ill-fitting, and how it resolved them
 * C1 only OBSERVES them: they are stripped from the article, verified against the real material, logged and
 * written to a run artifact + ledger. Nothing here changes the article or the publish payload.
 * No numeric score field exists anywhere in these shapes (a self-graded score would be unfalsifiable).
 */
import type { DailyTitleCandidate } from '../../main/services/dailyPublishingTitleReviewContract.js';

export type { DailyTitleCandidate };

export const COMPLEMENT_KINDS = ['conflict', 'gap', 'mismatch', 'data_gap'] as const;
export const COMPLEMENT_RULES = ['fact', 'legal', 'user', 'payoff', 'format', 'style', 'exposure'] as const;
export type ComplementKind = typeof COMPLEMENT_KINDS[number];
export type ComplementRule = typeof COMPLEMENT_RULES[number];

export interface HarmonyPacket {
  readonly version: 1;
  readonly material: { readonly centralEvent: string; readonly readerSituation: string; readonly notInSource: readonly string[] };
  readonly strategy: { readonly readerQuestion: string; readonly angle: string; readonly exposureNote: string };
  readonly titles: { readonly chosenId: string; readonly candidates: readonly DailyTitleCandidate[]; readonly comparison: string };
  readonly payoff: { readonly promise: string; readonly answerSentence: string };
}

export interface ComplementItem {
  readonly kind: ComplementKind;
  readonly instructionQuote: string;
  readonly otherQuote: string;
  readonly resolution: string;
  readonly rule: ComplementRule;
  readonly affected: readonly string[];
}

export interface ComplementReport { readonly version: 1; readonly items: readonly ComplementItem[] }

/** A report item after verification: quoteVerified says both quotes really occur in the task prompt. */
export interface VerifiedComplementItem extends ComplementItem { readonly quoteVerified: boolean }

export interface HarmonyExtraction {
  /** True when the parsed article carried either field (they are removed from it in every case). */
  readonly present: boolean;
  readonly packet: HarmonyPacket | null;
  readonly report: ComplementReport | null;
  /** Structural problems: why a field was rejected, or which report item was dropped. */
  readonly issues: readonly string[];
}

export interface CandidateVerdict { readonly id: string; readonly ok: boolean; readonly code?: string; readonly message?: string }

export interface HarmonyVerification {
  readonly candidates: readonly CandidateVerdict[];
  readonly sourceAnchors: { readonly matched: number; readonly total: number };
  readonly bodyAnchors: { readonly matched: number; readonly total: number };
  readonly chosen: { readonly id: string; readonly found: boolean; readonly titleMatchesSelected: boolean; readonly grounded: boolean; readonly code?: string } | null;
  readonly payoff: { readonly found: boolean; readonly positionPct: number | null; readonly inHiddenSubjectWindow: boolean; readonly inStandardWindow: boolean } | null;
  /** Report items that survived the effect-promise filter, each with quoteVerified. */
  readonly report: readonly VerifiedComplementItem[];
  readonly droppedEffectPromises: number;
  readonly issues: readonly string[];
}

/** What the generator attaches to the article (non-enumerable) and writes to H-agent-harmony.json. */
export interface AgentHarmonyRecord {
  readonly active: true;
  readonly packet: HarmonyPacket | null;
  readonly report: readonly VerifiedComplementItem[];
  readonly issues: readonly string[];
  readonly verification: HarmonyVerification | null;
}

/** Size caps. A malformed or oversized packet is rejected, never truncated into something that looks valid. */
export const HARMONY_LIMITS = Object.freeze({
  packetJsonChars: 32_000,
  reportJsonChars: 16_000,
  short: 400,
  note: 1_200,
  notInSourceItems: 8,
  notInSourceChars: 300,
  candidatesMin: 3,
  candidatesMax: 5,
  answerSentenceChars: 900,
  reportItemsMax: 8,
  quoteMin: 8,
  quoteMax: 200,
  resolutionChars: 600,
  affectedItems: 6,
  affectedChars: 80,
});

/** Answer-sentence position windows (percent of the body): subject-hiding titles answer early, others mid-body. */
export const PAYOFF_WINDOW_HIDDEN_SUBJECT = Object.freeze({ min: 8, max: 20 });
export const PAYOFF_WINDOW_STANDARD = Object.freeze({ min: 10, max: 36 });

/**
 * A report item that promises an effect ("노출 30% 상승", "클릭 2배") is dropped: the session may describe how it
 * resolved a conflict, never forecast a result. Tested on the model-authored fields only.
 */
export const EFFECT_PROMISE_PATTERN = /(노출|클릭|조회|유입).{0,10}(\d+(?:\.\d+)?\s*(?:%|배)|상승|증가|올라|오르)/u;
