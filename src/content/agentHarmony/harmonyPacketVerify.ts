/**
 * Verifies a harmony packet against the real material (Release C1, 2026-11-04).
 *
 * Observation only: nothing here rejects or edits the article. It answers "was the session honest?":
 *   - every candidate runs the SAME contract as the outer title review (verifyTitleCandidate), so an invented
 *     anchor (92세), a number missing from the body, a swapped price basis or a forged quote is flagged;
 *   - the chosen candidate must be the article's selectedTitle and its title must be grounded;
 *   - the answer sentence must really be in the body (position in %);
 *   - report quotes must occur in the task prompt (whitespace ignored); effect-promise items are dropped.
 * Never throws: a failure inside any step becomes an issue string.
 */
import {
  assertTitleGrounding, newTitleCandidateState, normalizeTitleEvidence, verifyTitleCandidate,
} from '../../main/services/dailyPublishingTitleReviewContract.js';
import {
  EFFECT_PROMISE_PATTERN, PAYOFF_WINDOW_HIDDEN_SUBJECT, PAYOFF_WINDOW_STANDARD,
  type CandidateVerdict, type ComplementItem, type HarmonyPacket, type HarmonyVerification, type VerifiedComplementItem,
} from './harmonyPacketTypes.js';
import type { ComplementReport } from './harmonyPacketTypes.js';

export interface HarmonyVerifyContext {
  /** The collected source text the title anchors must come from. */
  readonly rawText: string;
  /** The drafted article body (introduction + headings + conclusion). */
  readonly body: string;
  /** The article's selectedTitle. */
  readonly title: string;
  /** The task prompt the quotes must come from (the base prompt, without the harmony envelope). */
  readonly systemPrompt: string;
}

const MIN_ANCHOR_CHARS = 4;

function errorInfo(error: unknown): { code: string; message: string } {
  const code = (error as { code?: unknown })?.code;
  return { code: typeof code === 'string' ? code : 'UNKNOWN', message: String((error as Error)?.message ?? error).slice(0, 200) };
}

function countAnchors(candidates: HarmonyPacket['titles']['candidates'], key: 'sourceAnchors' | 'bodyAnchors', haystack: string) {
  let matched = 0, total = 0;
  for (const candidate of candidates) {
    for (const anchor of candidate[key]) {
      total += 1;
      const needle = normalizeTitleEvidence(anchor);
      if (needle.length >= MIN_ANCHOR_CHARS && haystack.includes(needle)) matched += 1;
    }
  }
  return { matched, total };
}

/** Where the answer sentence starts, as a percent of the whitespace-free body; null when it is not in the body. */
export function measureAnswerPosition(body: string, answerSentence: string): number | null {
  const haystack = normalizeTitleEvidence(body), needle = normalizeTitleEvidence(answerSentence);
  if (!haystack || needle.length < MIN_ANCHOR_CHARS) return null;
  const at = haystack.indexOf(needle);
  return at < 0 ? null : Math.round((at / haystack.length) * 1000) / 10;
}

export function payoffWindows(positionPct: number | null): { inHiddenSubjectWindow: boolean; inStandardWindow: boolean } {
  const within = (window: { min: number; max: number }) => positionPct !== null && positionPct >= window.min && positionPct <= window.max;
  return { inHiddenSubjectWindow: within(PAYOFF_WINDOW_HIDDEN_SUBJECT), inStandardWindow: within(PAYOFF_WINDOW_STANDARD) };
}

function verifyCandidates(packet: HarmonyPacket, ctx: HarmonyVerifyContext, issues: string[]): CandidateVerdict[] {
  const state = newTitleCandidateState();
  return packet.titles.candidates.map(candidate => {
    try {
      verifyTitleCandidate(candidate, { sourceGrounding: ctx.rawText, sourceVerification: ctx.rawText, body: ctx.body }, state);
      return { id: candidate.id, ok: true };
    } catch (error) {
      const { code, message } = errorInfo(error);
      issues.push(`candidate ${candidate.id}: ${code}`);
      return { id: candidate.id, ok: false, code, message };
    }
  });
}

function verifyChosen(packet: HarmonyPacket, ctx: HarmonyVerifyContext, issues: string[]): NonNullable<HarmonyVerification['chosen']> {
  const id = packet.titles.chosenId;
  const chosen = packet.titles.candidates.find(candidate => candidate.id === id);
  if (!chosen) { issues.push('chosen id is not among the candidates'); return { id, found: false, titleMatchesSelected: false, grounded: false }; }
  const titleMatchesSelected = normalizeTitleEvidence(chosen.title) === normalizeTitleEvidence(ctx.title);
  if (!titleMatchesSelected) issues.push('chosen title differs from selectedTitle');
  try {
    assertTitleGrounding(ctx.title || chosen.title, chosen.sourceAnchors, chosen.bodyAnchors);
    return { id, found: true, titleMatchesSelected, grounded: true };
  } catch (error) {
    const { code } = errorInfo(error);
    issues.push(`selectedTitle not grounded by the chosen anchors: ${code}`);
    return { id, found: true, titleMatchesSelected, grounded: false, code };
  }
}

function verifyPayoff(packet: HarmonyPacket, ctx: HarmonyVerifyContext, issues: string[]): NonNullable<HarmonyVerification['payoff']> {
  const positionPct = measureAnswerPosition(ctx.body, packet.payoff.answerSentence);
  if (positionPct === null) { issues.push('answer sentence is not in the body'); return { found: false, positionPct: null, inHiddenSubjectWindow: false, inStandardWindow: false }; }
  const windows = payoffWindows(positionPct);
  if (positionPct > PAYOFF_WINDOW_STANDARD.max) issues.push(`answer sentence comes late (${positionPct}% > ${PAYOFF_WINDOW_STANDARD.max}%)`);
  return { found: true, positionPct, ...windows };
}

function verifyReport(report: ComplementReport | null, systemPrompt: string, issues: string[]) {
  const prompt = normalizeTitleEvidence(systemPrompt);
  const found = (quote: string) => normalizeTitleEvidence(quote).length > 0 && prompt.includes(normalizeTitleEvidence(quote));
  const kept: VerifiedComplementItem[] = [];
  let dropped = 0;
  for (const item of (report?.items ?? []) as readonly ComplementItem[]) {
    if (EFFECT_PROMISE_PATTERN.test(`${item.resolution}\n${item.affected.join('\n')}`)) { dropped += 1; continue; }
    kept.push({ ...item, quoteVerified: found(item.instructionQuote) && (item.otherQuote === '' || found(item.otherQuote)) });
  }
  if (dropped) issues.push(`${dropped} report item(s) dropped for promising an effect`);
  return { kept, dropped };
}

/** Never throws. `extraction.packet` / `.report` may each be null (rejected or absent). */
export function verifyHarmonyPacket(
  extraction: { readonly packet: HarmonyPacket | null; readonly report: ComplementReport | null },
  ctx: HarmonyVerifyContext,
): HarmonyVerification {
  const issues: string[] = [];
  const safe = { rawText: String(ctx?.rawText ?? ''), body: String(ctx?.body ?? ''), title: String(ctx?.title ?? ''), systemPrompt: String(ctx?.systemPrompt ?? '') };
  const empty: HarmonyVerification = { candidates: [], sourceAnchors: { matched: 0, total: 0 }, bodyAnchors: { matched: 0, total: 0 }, chosen: null, payoff: null, report: [], droppedEffectPromises: 0, issues };
  try {
    const { kept, dropped } = verifyReport(extraction?.report ?? null, safe.systemPrompt, issues);
    const packet = extraction?.packet ?? null;
    if (!packet) return { ...empty, report: kept, droppedEffectPromises: dropped, issues };
    return {
      candidates: verifyCandidates(packet, safe, issues),
      sourceAnchors: countAnchors(packet.titles.candidates, 'sourceAnchors', normalizeTitleEvidence(safe.rawText)),
      bodyAnchors: countAnchors(packet.titles.candidates, 'bodyAnchors', normalizeTitleEvidence(safe.body)),
      chosen: verifyChosen(packet, safe, issues),
      payoff: verifyPayoff(packet, safe, issues),
      report: kept, droppedEffectPromises: dropped, issues,
    };
  } catch (error) {
    issues.push(`verification failed: ${errorInfo(error).message}`);
    return { ...empty, issues };
  }
}
