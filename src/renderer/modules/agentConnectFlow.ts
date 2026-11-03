// src/renderer/modules/agentConnectFlow.ts
// One-button connection of a subscription agent CLI (Codex / Claude Code / Antigravity):
//   [1/4 준비 확인] -> [2/4 설치] -> [3/4 로그인] -> [4/4 실제 답 확인]
// Steps that are already done are skipped. The first failing step stops the flow with its own
// reason. Nothing here ever switches to another engine: the caller keeps the user's choice.
//
// Renderer bundle note: copy-static concatenates renderer modules into one scope, so every
// top-level identifier in this file carries the agentConnect / AGENT_CONNECT prefix.

import type { AgentCliStatus, AgentProvider } from '../../agentCli/types.js';
import { runAgentLoginWithCodeFallback } from '../utils/agentLoginCodePrompt.js';

export type AgentConnectStep = 1 | 2 | 3 | 4;
export type AgentConnectKind = 'ready' | 'install' | 'update' | 'login' | 'unavailable' | 'delayed';
export type AgentConnectTone = 'info' | 'error' | 'success';
export type AgentConnectStatusLike = Partial<
  Pick<AgentCliStatus, 'installed' | 'loggedIn' | 'available' | 'errorCode' | 'detail'>
>;
export type AgentConnectApi = Pick<
  Window['api'],
  | 'agentStatus' | 'agentInstall' | 'agentLogin' | 'agentGenerate' | 'onAgentInstallProgress'
  | 'onAgentLoginProgress' | 'agentLoginOpenBrowser' | 'agentLoginSubmitCode' | 'agentLoginCancel'
>;

export interface AgentConnectOptions {
  readonly provider: AgentProvider;
  readonly api: AgentConnectApi;
  /** Where the login code / browser prompt is mounted. */
  readonly mountElement: HTMLElement;
  /** Element the login helper writes its own short status text into. */
  readonly statusElement: HTMLElement;
  readonly report: (line: string, tone: AgentConnectTone) => void;
  readonly now?: () => number;
  readonly createMarker?: () => string;
}

export interface AgentConnectResult {
  readonly ok: boolean;
  /** The step that stopped the flow, or 4 when everything passed. */
  readonly step: AgentConnectStep;
  readonly message: string;
  readonly elapsedMs: number;
}

type AgentConnectOutcome =
  | { readonly ok: true; readonly status: AgentConnectStatusLike }
  | { readonly ok: false; readonly step: AgentConnectStep; readonly reason: string };

interface AgentConnectContext extends AgentConnectOptions {
  readonly say: (step: AgentConnectStep, text: string) => void;
}

const AGENT_CONNECT_STEP_LABELS: Readonly<Record<AgentConnectStep, string>> = Object.freeze({
  1: '준비 확인', 2: '설치', 3: '로그인', 4: '실제 답 확인',
});
const AGENT_CONNECT_PROVIDER_LABELS: Readonly<Record<AgentProvider, string>> = Object.freeze({
  codex: 'Codex', claude: 'Claude Code', gemini: 'Antigravity',
});
const AGENT_CONNECT_TRANSIENT_CODES: readonly string[] = ['timeout', 'aborted', 'spawn_failed'];
const AGENT_CONNECT_MARKER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const AGENT_CONNECT_VERIFY_TIMEOUT_MS = 120_000;
const AGENT_CONNECT_TONE_COLORS: Readonly<Record<AgentConnectTone, string>> = Object.freeze({
  info: '#6b7280', error: '#b91c1c', success: '#15803d',
});

export function agentConnectProviderLabel(provider: AgentProvider): string {
  return AGENT_CONNECT_PROVIDER_LABELS[provider];
}

export function agentConnectProgressLine(step: AgentConnectStep, text: string): string {
  return `[${step}/4 ${AGENT_CONNECT_STEP_LABELS[step]}] ${text}`;
}

export function agentConnectFailureLine(step: AgentConnectStep, reason: string): string {
  return `❌ [${step}/4 ${AGENT_CONNECT_STEP_LABELS[step]}]에서 멈춤: ${reason}`;
}

export function agentConnectSuccessLine(elapsedMs: number): string {
  return `✅ 연결 완료 — 실제 답 확인됨 (${Math.max(1, Math.round(elapsedMs / 1000))}초)`;
}

/** BLN- plus six alphanumerics. Not a secret: it only proves the reply came from this request. */
export function agentConnectCreateMarker(random: () => number = Math.random): string {
  const size = AGENT_CONNECT_MARKER_CHARS.length;
  let tail = '';
  for (let index = 0; index < 6; index += 1) {
    tail += AGENT_CONNECT_MARKER_CHARS[Math.min(size - 1, Math.floor(random() * size))];
  }
  return `BLN-${tail}`;
}

export function agentConnectBuildPrompt(marker: string): string {
  return `다음 글자만 그대로 답하세요: ${marker}\nReply with exactly this text and nothing else: ${marker}`;
}

export function agentConnectReplyHasMarker(text: string | undefined, marker: string): boolean {
  return typeof text === 'string' && marker.length > 0 && text.includes(marker);
}

/** A probe that could not answer (timeout/aborted/spawn_failed) is never "not installed". */
export function agentConnectClassify(status?: AgentConnectStatusLike | null): AgentConnectKind {
  if (!status) return 'delayed';
  if (status.errorCode && AGENT_CONNECT_TRANSIENT_CODES.includes(status.errorCode)) return 'delayed';
  if (status.errorCode === 'update_required') return 'update';
  if (!status.installed) return 'install';
  if (!status.loggedIn) return 'login';
  return status.available === true ? 'ready' : 'unavailable';
}

function agentConnectUnavailableReason(status?: AgentConnectStatusLike | null): string {
  if (status?.errorCode === 'subscription_inactive') {
    return '구독 기간이 만료됐거나 사용할 수 없는 계정입니다. 다른 계정으로 다시 로그인해 주세요.';
  }
  if (status?.errorCode === 'rate_limited') {
    return '구독 사용 한도를 모두 썼습니다. 한도가 초기화된 뒤 다시 시도해 주세요.';
  }
  return status?.detail || '구독 상태를 확인해 주세요.';
}

const agentConnectStop = (step: AgentConnectStep, reason: string): AgentConnectOutcome =>
  ({ ok: false, step, reason });

async function agentConnectProbe(ctx: AgentConnectContext, step: AgentConnectStep): Promise<AgentConnectOutcome> {
  const res = await ctx.api.agentStatus(ctx.provider, { forceRefresh: true });
  if (!res?.success || !res.status) {
    return agentConnectStop(step, res?.message || '상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (agentConnectClassify(res.status) === 'delayed') {
    return agentConnectStop(step, '상태 확인 지연 — 설치·로그인 상태는 그대로 유지됩니다. 잠시 후 다시 시도해 주세요.');
  }
  return { ok: true, status: res.status };
}

async function agentConnectInstall(ctx: AgentConnectContext, updating = false): Promise<AgentConnectOutcome> {
  ctx.say(2, updating
    ? `${agentConnectProviderLabel(ctx.provider)} 버전이 낮아 앱 전용 폴더에 고정 버전을 설치해 업데이트합니다…`
    : ctx.provider === 'gemini'
    ? '공식 설치 파일을 내려받아 설치합니다…'
    : '공식 npm 패키지를 설치합니다…');
  let removeProgress: (() => void) | undefined;
  let listening = true; // a late event must never overwrite the login step's line
  try {
    removeProgress = ctx.api.onAgentInstallProgress?.((progress) => {
      if (listening && progress.provider === ctx.provider) ctx.say(2, progress.message);
    });
    const res = await ctx.api.agentInstall(ctx.provider);
    if (!res?.success) return agentConnectStop(2, res?.message || '설치에 실패했습니다.');
  } finally {
    listening = false;
    try { removeProgress?.(); } catch { /* The event source may already be closed. */ }
  }
  const probed = await agentConnectProbe(ctx, 2);
  if (probed.ok && agentConnectClassify(probed.status) === 'update') {
    return agentConnectStop(2, '설치는 끝났지만 실행되는 버전이 아직 낮습니다. 다른 위치의 낮은 버전이 먼저 실행되고 있지 않은지 확인해 주세요.');
  }
  if (probed.ok && agentConnectClassify(probed.status) === 'install') {
    return agentConnectStop(2, '설치는 끝났지만 실행 파일을 찾지 못했습니다. 보안 프로그램과 폴더 권한을 확인해 주세요.');
  }
  return probed;
}

async function agentConnectLogin(ctx: AgentConnectContext): Promise<AgentConnectOutcome> {
  ctx.say(3, `${agentConnectProviderLabel(ctx.provider)} 로그인을 준비합니다…`);
  const res = await runAgentLoginWithCodeFallback({
    provider: ctx.provider,
    mountElement: ctx.mountElement,
    statusElement: ctx.statusElement,
    api: ctx.api,
    startLogin: () => ctx.api.agentLogin(ctx.provider),
  });
  if (!res?.success) return agentConnectStop(3, res?.message || '로그인에 실패했거나 취소되었습니다.');
  const probed = res.status ? { ok: true as const, status: res.status } : await agentConnectProbe(ctx, 3);
  if (probed.ok && agentConnectClassify(probed.status) !== 'ready') {
    return agentConnectStop(3, agentConnectUnavailableReason(probed.status));
  }
  return probed;
}

async function agentConnectVerify(ctx: AgentConnectContext): Promise<AgentConnectOutcome> {
  ctx.say(4, `${agentConnectProviderLabel(ctx.provider)}에 짧은 질문을 보내 실제 답이 오는지 확인합니다…`);
  const marker = (ctx.createMarker ?? (() => agentConnectCreateMarker()))();
  const res = await ctx.api.agentGenerate({
    provider: ctx.provider,
    prompt: agentConnectBuildPrompt(marker),
    tier: 'light',
    timeoutMs: AGENT_CONNECT_VERIFY_TIMEOUT_MS,
  });
  if (!res?.success) return agentConnectStop(4, res?.message || '답을 받지 못했습니다.');
  if (!agentConnectReplyHasMarker(res.text, marker)) {
    return agentConnectStop(4, '답은 왔지만 요청한 확인 글자가 들어 있지 않습니다. 계정 상태를 확인해 주세요.');
  }
  return { ok: true, status: {} };
}

async function agentConnectExecute(
  ctx: AgentConnectContext,
  mark: (step: AgentConnectStep) => void,
): Promise<AgentConnectOutcome> {
  mark(1);
  ctx.say(1, `${agentConnectProviderLabel(ctx.provider)} 설치·로그인 상태를 확인합니다…`);
  let current = await agentConnectProbe(ctx, 1);
  if (!current.ok) return current;
  if (agentConnectClassify(current.status) === 'update') {
    // Installed but older than the minimum: install the pinned version into the app folder (step 2/4).
    mark(2);
    current = await agentConnectInstall(ctx, true);
    if (!current.ok) return current;
  } else if (agentConnectClassify(current.status) === 'install') {
    mark(2);
    current = await agentConnectInstall(ctx);
    if (!current.ok) return current;
  }
  const kind = agentConnectClassify(current.status);
  if (kind === 'login') {
    mark(3);
    current = await agentConnectLogin(ctx);
    if (!current.ok) return current;
  } else if (kind === 'unavailable') {
    return agentConnectStop(3, agentConnectUnavailableReason(current.status));
  }
  mark(4);
  return agentConnectVerify(ctx);
}

/** Runs the whole chain. Never throws: every failure is returned as the step that stopped. */
export async function agentConnectRun(options: AgentConnectOptions): Promise<AgentConnectResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const ctx: AgentConnectContext = {
    ...options,
    say: (step, text) => options.report(agentConnectProgressLine(step, text), 'info'),
  };
  let reached: AgentConnectStep = 1;
  const finish = (ok: boolean, step: AgentConnectStep, reason: string): AgentConnectResult => {
    const elapsedMs = Math.max(0, now() - startedAt);
    const message = ok ? agentConnectSuccessLine(elapsedMs) : agentConnectFailureLine(step, reason);
    options.report(message, ok ? 'success' : 'error');
    return Object.freeze({ ok, step, message, elapsedMs });
  };
  try {
    const outcome = await agentConnectExecute(ctx, (step) => { reached = step; });
    return outcome.ok ? finish(true, 4, '') : finish(false, outcome.step, outcome.reason);
  } catch (error) {
    return finish(false, reached, error instanceof Error ? error.message : String(error));
  }
}

/** The log line lives in its own element so a status refresh cannot erase the failure reason. */
export function agentConnectEnsureLog(statusElement: HTMLElement, provider: AgentProvider): HTMLElement {
  const id = `agent-${provider}-connect-log`;
  const existing = document.getElementById(id);
  if (existing) return existing;
  const log = document.createElement('div');
  log.id = id;
  log.setAttribute('role', 'status');
  log.style.cssText = 'font-size:0.8rem;margin-top:0.25rem;line-height:1.4;word-break:keep-all;';
  statusElement.insertAdjacentElement('afterend', log);
  return log;
}

export function agentConnectWriteLog(log: HTMLElement, line: string, tone: AgentConnectTone): void {
  log.textContent = line;
  log.style.color = AGENT_CONNECT_TONE_COLORS[tone];
  log.style.display = '';
}
