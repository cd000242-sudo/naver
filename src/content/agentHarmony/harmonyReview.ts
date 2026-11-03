/**
 * Review of a harmony-session article for the person-run [글 생성] (Release D, 2026-11-04).
 *
 * The session already wrote the title and the body together, so the 4-call outer review (mining, tournament, candidate
 * critic, review) and the winner regeneration are not run. What stays is an independent check:
 *   1. a second, local verification of the packet against the FINAL body and the FULL source;
 *   2. exactly one title/body-promise validation by a fresh session that never saw the writer's reasoning;
 *   3. one v2 audit record.
 * Verification problems are soft (logged as a warning, article kept); the validation call's own soft/hard failure
 * policy belongs to the caller-supplied `validate`. Cancellation and a lock mismatch throw.
 */
import { normalizeTitleEvidence } from '../../main/services/dailyPublishingTitleReviewContract.js';
import { verifyHarmonyPacket } from './harmonyPacketVerify.js';
import { draftBodyOf } from './harmonyRuntime.js';
import type { AgentHarmonyRecord, HarmonyPacket } from './harmonyPacketTypes.js';

export interface HarmonyArticle { readonly selectedTitle: string; readonly bodyPlain: string }

export interface HarmonyFinalCheck {
  readonly ok: boolean;
  readonly chosenId: string;
  /** Blocking problems (empty when ok). */
  readonly problems: readonly string[];
  readonly sourceAnchors: { readonly matched: number; readonly total: number };
  readonly bodyAnchors: { readonly matched: number; readonly total: number };
  readonly payoffPositionPct: number | null;
}

/** The final title may be another packet candidate (the FinalQualityGate swap): check it with that candidate's anchors. */
function packetForTitle(packet: HarmonyPacket, title: string): HarmonyPacket {
  const key = normalizeTitleEvidence(title);
  const match = packet.titles.candidates.find(candidate => normalizeTitleEvidence(candidate.title) === key);
  return match && match.id !== packet.titles.chosenId ? { ...packet, titles: { ...packet.titles, chosenId: match.id } } : packet;
}

/** Never throws. Second verification of the packet against the final body and the whole collected source. */
export function crossCheckHarmonyArticle(args: { article: HarmonyArticle; packet: HarmonyPacket; rawText: string }): HarmonyFinalCheck {
  const packet = packetForTitle(args.packet, args.article.selectedTitle);
  const body = String(args.article.bodyPlain || '').trim() || draftBodyOf(args.article);
  const v = verifyHarmonyPacket({ packet, report: null }, { rawText: args.rawText, body, title: args.article.selectedTitle, systemPrompt: '' });
  const problems: string[] = [];
  const chosenVerdict = v.candidates.find(candidate => candidate.id === packet.titles.chosenId);
  if (!v.chosen?.found) problems.push('chosen id is not among the candidates');
  else {
    if (!v.chosen.titleMatchesSelected) problems.push('selectedTitle is not the chosen candidate');
    if (!v.chosen.grounded) problems.push(`selectedTitle is not grounded by the chosen anchors${v.chosen.code ? ` (${v.chosen.code})` : ''}`);
    if (chosenVerdict && !chosenVerdict.ok) problems.push(`chosen candidate failed the title contract${chosenVerdict.code ? ` (${chosenVerdict.code})` : ''}`);
  }
  if (!v.payoff?.found) problems.push('answer sentence is not in the final body');
  return {
    ok: problems.length === 0, chosenId: packet.titles.chosenId, problems,
    sourceAnchors: v.sourceAnchors, bodyAnchors: v.bodyAnchors, payoffPositionPct: v.payoff?.positionPct ?? null,
  };
}

function summaryLine(check: HarmonyFinalCheck): string {
  const position = check.payoffPositionPct === null ? '본문에 없음' : `${Math.round(check.payoffPositionPct)}%`;
  return `[AgentHarmony] 최종 대조: 선택 ${check.chosenId} · 앵커 원문 일치 ${check.sourceAnchors.matched}/${check.sourceAnchors.total} · 본문 일치 ${check.bodyAnchors.matched}/${check.bodyAnchors.total}`
    + ` · 보상 문장 위치 ${position} → ${check.ok ? '통과' : `문제 ${check.problems.length}건: ${check.problems.join(' / ').slice(0, 300)}`}`;
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw Error('DAILY_CANCELLED');
}

export async function reviewHarmonyArticle<T extends HarmonyArticle>(args: {
  article: T;
  record: AgentHarmonyRecord;
  /** The full collected source text (not the windowed title-review grounding). */
  rawText: string;
  /** manualTitleOverride: the article must carry exactly this title. */
  locked?: string;
  /** The single independent validation call; its soft-failure policy is the caller's (it returns the verdict to record). */
  validate: (article: T) => Promise<unknown>;
  audit?: (record: Record<string, unknown>) => Promise<void>;
  log?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<HarmonyFinalCheck> {
  const { article, record } = args;
  if (!record.packet) throw Error('AGENT_HARMONY_PACKET_REQUIRED');
  if (args.locked && article.selectedTitle !== args.locked) throw Error('DAILY_TITLE_LOCK_MISMATCH');
  const check = crossCheckHarmonyArticle({ article, packet: record.packet, rawText: args.rawText });
  args.log?.(summaryLine(check));
  if (!check.ok) {
    args.log?.(`⚠️ 조화 세션의 제목 · 본문 약속을 최종 본문과 대조하지 못했습니다(${check.problems.slice(0, 2).join(' / ')}) — 글은 그대로 두었습니다. 발행 전에 제목과 본문의 첫 답을 직접 확인해 주세요.`);
  }
  const validation = await args.validate(article);
  assertActive(args.signal);
  await args.audit?.({
    version: 2, pipeline: 'agent-harmony-v1', originalTitle: article.selectedTitle, finalTitle: article.selectedTitle, regenerated: false,
    verification: { ok: check.ok, chosenId: check.chosenId, problems: check.problems, sourceAnchors: check.sourceAnchors, bodyAnchors: check.bodyAnchors, payoffPositionPct: check.payoffPositionPct },
    validation,
  });
  assertActive(args.signal);
  return check;
}
