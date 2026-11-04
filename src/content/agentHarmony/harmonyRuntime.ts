/**
 * Agent harmony runtime glue (Release C1, 2026-11-04) — the small, testable seam contentGenerator calls.
 *
 *   resolveAgentHarmonyFlag     config.agentHarmonyMode / env AGENT_HARMONY (default ON since 2026-11-04, env wins)
 *   resolveAgentHarmonyRequest  should THIS generation run as a harmony session? (flag + agent engine + text mode + not V3)
 *   handleAgentHarmonyResponse  right after JSON parse: strip, verify, attach, log, write artifact + ledger
 *   attachAgentHarmony          non-enumerable `_agentHarmony` on the article (never in JSON / IPC / publish payload)
 *   restoreAgentHarmony         re-attach after post-processing that cloned the article
 *
 * Observe mode: nothing here changes the article's text or any decision. Nothing here throws into generation.
 */
import { APP_VERSION } from '../../runtime/version.generated.js';
import type { AgentHarmonyContext } from '../../agentCli/agentHarmonyEnvelope.js';
import { normalizeTitleEvidence } from '../../main/services/dailyPublishingTitleReviewContract.js';
import { appendHarmonyLedger } from './harmonyLedger.js';
import { isHarmonyMode } from './harmonyModes.js';
import { extractHarmonyPacket } from './harmonyPacketExtract.js';
import { verifyHarmonyPacket } from './harmonyPacketVerify.js';
import type { AgentHarmonyRecord, HarmonyVerification } from './harmonyPacketTypes.js';

/**
 * env AGENT_HARMONY=1/0 (also true/false/on/off) overrides; otherwise ON unless the person picked the classic review
 * (`agentHarmonyMode: false`, settings → 에이전트 글 검수 방식). 2026-11-04 owner: "조화모드를 모든 사용자 기본값으로 해주고
 * 둘다 가능하게 해줘" — a hand-set `true` had been silently lost, so the default no longer depends on a saved key.
 */
export function resolveAgentHarmonyFlag(config: { readonly agentHarmonyMode?: unknown } | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = String(env.AGENT_HARMONY ?? '').trim().toLowerCase();
  if (value === '0' || value === 'false' || value === 'off') return false;
  if (value === '1' || value === 'true' || value === 'on') return true;
  return config?.agentHarmonyMode !== false;
}

/** Flag-free: a text mode with a harmony session AND a subscription agent engine (agent-claude / agent-codex). */
export function agentHarmonyApplies(mode: unknown, provider: unknown): boolean {
  return isHarmonyMode(mode) && (provider === 'agent-claude' || provider === 'agent-codex');
}

/** The harmony session needs the flag, an agent CLI engine, a text mode (photo excluded) and the legacy (non-V3) prompt path. */
export function resolveAgentHarmonyRequest(args: { flag: unknown; provider: string; isV3Prompt: boolean; mode: string }): AgentHarmonyContext | undefined {
  if (args.flag !== true || args.isV3Prompt || !isHarmonyMode(args.mode)) return undefined;
  return agentHarmonyApplies(args.mode, args.provider) ? { mode: args.mode } : undefined;
}

/** Non-enumerable: survives in-process hand-offs, but JSON.stringify / structured clone (IPC) / spreads never carry it. */
export function attachAgentHarmony(content: unknown, record: AgentHarmonyRecord): void {
  if (!content || typeof content !== 'object' || !Object.isExtensible(content)) return;
  Object.defineProperty(content, '_agentHarmony', { value: record, enumerable: false, writable: true, configurable: true });
}

export function readAgentHarmony(content: unknown): AgentHarmonyRecord | undefined {
  return content && typeof content === 'object' ? (content as { _agentHarmony?: AgentHarmonyRecord })._agentHarmony : undefined;
}

// Per-run memory: the generator keeps working on cloned articles after parse, so the record is also kept per run.
const recordsByRun = new WeakMap<object, AgentHarmonyRecord>();

export function restoreAgentHarmony(content: unknown, run: object | null | undefined): void {
  if (!run || readAgentHarmony(content)) return;
  const record = recordsByRun.get(run);
  if (record) attachAgentHarmony(content, record);
}

/** The record remembered for this run (the last parsed attempt), for callers that only see a clone of the article. */
export function recallAgentHarmony(run: object | null | undefined): AgentHarmonyRecord | undefined {
  return run ? recordsByRun.get(run) : undefined;
}

/**
 * Release D: under a harmony session (packet present) the [FinalQualityGate] may only swap the title to a candidate the
 * session itself proposed AND whose anchors verified; anything else keeps the session's title. Without a packet
 * (flag OFF, API engine, missing/malformed packet) `live` is false and every title is allowed — the gate runs as before.
 */
export function createHarmonySwapGuard(record: AgentHarmonyRecord | undefined, log: (message: string) => void = (m) => console.log(m)): { live: boolean; allows: (title: string) => boolean } {
  const packet = record?.packet;
  if (!packet) return { live: false, allows: () => true };
  const key = (text: string) => normalizeTitleEvidence(text);
  const verifiedIds = new Set((record?.verification?.candidates ?? []).filter(verdict => verdict.ok).map(verdict => verdict.id));
  const verified = new Set(packet.titles.candidates.filter(candidate => verifiedIds.has(candidate.id)).map(candidate => key(candidate.title)));
  return {
    live: true,
    allows: (title) => {
      if (verified.has(key(title))) return true;
      log(`[FinalQualityGate] 후보 제외 — 조화 세션이 앵커까지 검증한 후보가 아님: "${title}"`);
      return false;
    },
  };
}

export interface HarmonyResponseContext {
  readonly rawText: string;
  /** The base prompt (without the harmony envelope) — report quotes must occur in it. */
  readonly systemPrompt: string;
  readonly engine: string;
  readonly model: string;
  readonly mode: string;
  readonly runId: string;
  /** The generation run (artifact writer + per-run memory). */
  readonly run?: { writeQualityArtifact(name: string, payload: unknown): void } | null;
  /** userData directory for the ledger; resolved from Electron when omitted, ledger skipped when unavailable. */
  readonly userDataDir?: string | null;
  readonly log?: (message: string) => void;
}

/** introduction + headings (title and content) + conclusion (+ bodyPlain when already present), in reading order. */
export function draftBodyOf(article: unknown): string {
  const record = (article && typeof article === 'object' ? article : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const headings = Array.isArray(record.headings) ? record.headings : [];
  const parts = [text(record.introduction)];
  for (const heading of headings) {
    const entry = (heading && typeof heading === 'object' ? heading : {}) as Record<string, unknown>;
    parts.push(text(entry.title), text(entry.content) || text(entry.body));
  }
  parts.push(text(record.conclusion), text(record.bodyPlain));
  return parts.filter(Boolean).join('\n');
}

function resolveUserDataDir(): string | null {
  try {
    const { app } = require('electron') as typeof import('electron');
    return app && typeof app.getPath === 'function' ? app.getPath('userData') : null;
  } catch { return null; }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function logSummary(log: (message: string) => void, record: AgentHarmonyRecord): void {
  const v: HarmonyVerification | null = record.verification;
  if (!record.packet || !v) {
    log(`[AgentHarmony] 패킷 없음 — 응답에 harmonyPacket 이 없거나 형식이 맞지 않았습니다${record.issues.length ? ` (${clip(record.issues[0], 140)})` : ''}`);
  } else {
    const position = v.payoff?.positionPct == null ? '본문에 없음' : `${Math.round(v.payoff.positionPct)}%`;
    log(`[AgentHarmony] 패킷: 후보 ${record.packet.titles.candidates.length} · 선택 ${record.packet.titles.chosenId} · 앵커 원문 일치 ${v.sourceAnchors.matched}/${v.sourceAnchors.total} · 보상 문장 위치 ${position}`
      + ` · 보완보고 ${record.report.length}건(인용 확인 ${record.report.filter(item => item.quoteVerified).length}/${record.report.length})`);
    for (const issue of v.issues.slice(0, 8)) log(`[AgentHarmony]   ! ${clip(issue, 160)}`);
  }
  for (const item of record.report) {
    log(`[AgentHarmony]   - ${item.kind}/${item.rule} "${clip(item.instructionQuote, 40)}"${item.otherQuote ? ` ↔ "${clip(item.otherQuote, 40)}"` : ''} → ${clip(item.resolution, 60)} (인용 ${item.quoteVerified ? '확인' : '미확인'})`);
  }
}

/**
 * Call right after the agent's JSON is parsed. Strips harmonyPacket / complementReport from `parsed`, verifies them,
 * attaches `_agentHarmony`, logs, writes H-agent-harmony.json and appends the ledger. Never throws.
 */
export function handleAgentHarmonyResponse(parsed: unknown, ctx: HarmonyResponseContext): AgentHarmonyRecord {
  const log = ctx.log ?? ((message: string) => console.log(message));
  let record: AgentHarmonyRecord = { active: true, packet: null, report: [], issues: ['harmony handling failed'], verification: null };
  try {
    const extraction = extractHarmonyPacket(parsed);
    const title = typeof (parsed as { selectedTitle?: unknown })?.selectedTitle === 'string' ? (parsed as { selectedTitle: string }).selectedTitle : '';
    const verification = extraction.packet || extraction.report
      ? verifyHarmonyPacket(extraction, { rawText: ctx.rawText, body: draftBodyOf(parsed), title, systemPrompt: ctx.systemPrompt, mode: ctx.mode })
      : null;
    const issues = [...(extraction.present ? [] : ['no harmony fields in the response']), ...extraction.issues, ...(verification?.issues ?? [])];
    record = { active: true, packet: extraction.packet, report: verification?.report ?? [], issues, verification };
    attachAgentHarmony(parsed, record);
    if (ctx.run) recordsByRun.set(ctx.run, record);
    logSummary(log, record);
    try {
      ctx.run?.writeQualityArtifact('H-agent-harmony.json', {
        version: 1, runId: ctx.runId, engine: ctx.engine, model: ctx.model, mode: ctx.mode, at: new Date().toISOString(),
        packet: record.packet, report: record.report, issues: record.issues, verification: record.verification,
      });
    } catch { /* artifact writing is best effort */ }
    const userDataDir = ctx.userDataDir === undefined ? resolveUserDataDir() : ctx.userDataDir;
    if (userDataDir && record.report.length) {
      appendHarmonyLedger({ userDataDir, runId: ctx.runId, appVersion: APP_VERSION, engine: ctx.engine, model: ctx.model, mode: ctx.mode }, record.report);
    }
  } catch (error) {
    console.warn('[AgentHarmony] 패킷 처리 생략:', (error as Error)?.message);
  }
  return record;
}
