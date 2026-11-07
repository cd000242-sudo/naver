// src/renderer/modules/publishStartPreflight.ts
// [2026-11-07] Readiness check before a continuous-publish / multi-account run starts.
//
// Without it a missing CLI or an expired login failed every queue item one by one (continuous publishing retried
// after 15 seconds, then moved on). Single publish already has a renderer pre-check (ensureAgentEngineReady);
// this applies the same idea to the long runs: look at the text engine (subscription agent) and the image engine
// (codex-image) the user picked, and when one is not ready do NOT start. A short window offers one button,
// "연결하기 (설치 -> 로그인 -> 확인)", which reuses the connection flow of the startup gate (agentConnectRun).
// Nothing is switched to another engine and nothing starts by itself after the connection: the user presses start again.
//
// Renderer bundle note: copy-static concatenates renderer modules into one scope, so every top-level
// identifier in this file carries the publishPreflight / PUBLISH_PREFLIGHT prefix.

import type { AgentProvider } from '../../agentCli/types.js';
import {
  agentConnectClassify,
  agentConnectProviderLabel,
  agentConnectRun,
  agentConnectWriteLog,
} from './agentConnectFlow.js';
import type { AgentConnectApi, AgentConnectKind, AgentConnectStatusLike } from './agentConnectFlow.js';
import { agentConnectChipLabel, agentConnectProviderFromValue } from './agentConnectGate.js';

export const PUBLISH_PREFLIGHT_ID = 'publish-preflight-modal';
const PUBLISH_PREFLIGHT_IMAGE_ENGINE = 'codex-image';
const PUBLISH_PREFLIGHT_PROBE_LIMIT_MS = 20_000;
const PUBLISH_PREFLIGHT_CONNECT_LABEL = '⚡ 연결하기 (설치 → 로그인 → 확인)';

export type PublishPreflightRole = 'text' | 'image';

export interface PublishPreflightNeed {
  readonly provider: AgentProvider;
  readonly roles: readonly PublishPreflightRole[];
}

export interface PublishPreflightProblem {
  readonly need: PublishPreflightNeed;
  readonly kind: Exclude<AgentConnectKind, 'ready'>;
  /** One short sentence for problems that connecting cannot fix (quota, expired plan, slow probe). */
  readonly note: string;
}

export interface PublishPreflightRequest {
  /** Value of the text engine the run will use (e.g. 'agent-claude'); anything else needs no check. */
  readonly generator: string;
  /** Image engines the run will use. Pass [] when the run publishes text only. */
  readonly imageSources: readonly string[];
}

const PUBLISH_PREFLIGHT_ROLE_LABELS: Readonly<Record<PublishPreflightRole, string>> = Object.freeze({
  text: '글 엔진',
  image: '이미지',
});

/** Which CLIs the chosen engines depend on, one entry per CLI (a CLI used for text and images counts once). */
export function publishPreflightNeeds(generator: string, imageSources: readonly string[]): PublishPreflightNeed[] {
  const roles = new Map<AgentProvider, PublishPreflightRole[]>();
  const add = (provider: AgentProvider | undefined, role: PublishPreflightRole): void => {
    if (!provider) return;
    const list = roles.get(provider) ?? [];
    if (!list.includes(role)) list.push(role);
    roles.set(provider, list);
  };
  add(agentConnectProviderFromValue(String(generator || '').trim()), 'text');
  if (imageSources.some((source) => String(source || '').trim() === PUBLISH_PREFLIGHT_IMAGE_ENGINE)) add('codex', 'image');
  return Array.from(roles, ([provider, list]) => Object.freeze({ provider, roles: Object.freeze(list) }));
}

/** Only a missing install, an old version or a missing login is fixed by the connect button. */
export function publishPreflightIsConnectable(kind: AgentConnectKind): boolean {
  return kind === 'install' || kind === 'update' || kind === 'login';
}

function publishPreflightNote(kind: AgentConnectKind, status?: AgentConnectStatusLike | null): string {
  if (kind === 'delayed') return '상태 확인이 늦어지고 있어요. 잠시 후 시작을 다시 눌러 주세요.';
  if (kind !== 'unavailable') return '';
  if (status?.errorCode === 'rate_limited') return '구독 사용 한도를 다 썼어요. 한도가 풀린 뒤 다시 눌러 주세요.';
  if (status?.errorCode === 'subscription_inactive') return '구독이 끝났거나 쓸 수 없는 계정이에요. 다른 계정으로 로그인해 주세요.';
  return status?.detail || '구독 상태를 확인해 주세요.';
}

async function publishPreflightProbeOne(
  api: Pick<AgentConnectApi, 'agentStatus'>,
  need: PublishPreflightNeed,
): Promise<PublishPreflightProblem | null> {
  const delayed = (): PublishPreflightProblem => ({ need, kind: 'delayed', note: publishPreflightNote('delayed') });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), PUBLISH_PREFLIGHT_PROBE_LIMIT_MS); });
  try {
    const res = await Promise.race([api.agentStatus(need.provider, { forceRefresh: true }), limit]);
    if (res === 'timeout' || !res?.success || !res.status) return delayed();
    const kind = agentConnectClassify(res.status);
    if (kind === 'ready') return null;
    return { need, kind, note: publishPreflightNote(kind, res.status) };
  } catch {
    return delayed(); // a probe that cannot answer says nothing about the account: never "설치 필요"
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fresh status of every needed CLI (same forceRefresh as the single-publish check). Empty list = all ready. */
export async function publishPreflightProbe(
  api: Pick<AgentConnectApi, 'agentStatus'>,
  needs: readonly PublishPreflightNeed[],
): Promise<PublishPreflightProblem[]> {
  const results = await Promise.all(needs.map((need) => publishPreflightProbeOne(api, need)));
  return results.filter((problem): problem is PublishPreflightProblem => problem !== null);
}

function publishPreflightLine(problem: PublishPreflightProblem): string {
  const roles = problem.need.roles.map((role) => PUBLISH_PREFLIGHT_ROLE_LABELS[role]).join('·');
  return `${roles} · ${agentConnectProviderLabel(problem.need.provider)} — ${agentConnectChipLabel(problem.kind)}`;
}

interface PublishPreflightView {
  readonly overlay: HTMLElement;
  readonly list: HTMLElement;
  readonly log: HTMLElement;
  readonly mount: HTMLElement;
  readonly connect: HTMLButtonElement;
  readonly close: HTMLButtonElement;
}

function publishPreflightRender(): PublishPreflightView {
  document.getElementById(PUBLISH_PREFLIGHT_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = PUBLISH_PREFLIGHT_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.className = 'nv-scrim';
  overlay.style.zIndex = '10000001';
  overlay.innerHTML = `
    <div class="nv-modal" style="max-width:520px;">
      <div style="padding:1.25rem 1.5rem 0.5rem;">
        <div class="nv-modal__title" style="font-size:1.2rem;font-weight:900;margin-bottom:0;">시작 전에 연결이 필요해요</div>
        <div class="nv-modal__sub" style="margin:0.3rem 0 0;">연결이 끝나면 시작 버튼을 다시 눌러 주세요.</div>
      </div>
      <div id="${PUBLISH_PREFLIGHT_ID}-list" style="padding:0.5rem 1.5rem;display:flex;flex-direction:column;gap:0.4rem;"></div>
      <div style="padding:0 1.5rem 0.5rem;">
        <div id="${PUBLISH_PREFLIGHT_ID}-log" role="status" aria-live="polite" style="display:none;font-size:0.85rem;line-height:1.45;word-break:keep-all;"></div>
        <div id="${PUBLISH_PREFLIGHT_ID}-mount"></div>
      </div>
      <div class="nv-modal__foot" style="padding:0.9rem 1.5rem 1.25rem;gap:0.6rem;">
        <button id="${PUBLISH_PREFLIGHT_ID}-close" type="button" class="nv-btn" style="padding:0.7rem 1.2rem;font-size:0.95rem;">닫기</button>
        <button id="${PUBLISH_PREFLIGHT_ID}-connect" type="button" class="nv-btn nv-btn--primary" style="padding:0.7rem 1.4rem;font-size:0.95rem;">${PUBLISH_PREFLIGHT_CONNECT_LABEL}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const part = <T extends HTMLElement>(suffix: string): T => overlay.querySelector(`#${PUBLISH_PREFLIGHT_ID}-${suffix}`) as T;
  return { overlay, list: part('list'), log: part('log'), mount: part('mount'), connect: part<HTMLButtonElement>('connect'), close: part<HTMLButtonElement>('close') };
}

function publishPreflightFillList(view: PublishPreflightView, problems: readonly PublishPreflightProblem[]): void {
  for (const problem of problems) {
    const row = document.createElement('div');
    const line = document.createElement('div');
    line.setAttribute('data-preflight-line', problem.kind);
    line.style.cssText = 'font-weight:800;font-size:0.95rem;';
    line.textContent = publishPreflightLine(problem);
    row.appendChild(line);
    if (problem.note) {
      const note = document.createElement('div');
      note.className = 'nv-modal__note';
      note.style.cssText = 'font-size:0.82rem;margin-top:0.1rem;';
      note.textContent = problem.note;
      row.appendChild(note);
    }
    view.list.appendChild(row);
  }
}

/** Connects the fixable problems one after another; stops at the first failure and leaves the button for a retry. */
async function publishPreflightConnect(
  view: PublishPreflightView,
  problems: readonly PublishPreflightProblem[],
  api: AgentConnectApi,
): Promise<void> {
  const fixable = problems.filter((problem) => publishPreflightIsConnectable(problem.kind));
  view.connect.disabled = true;
  view.close.disabled = true;
  view.connect.textContent = '⏳ 연결 중...';
  let allDone = true;
  try {
    for (const problem of fixable) {
      const prefix = fixable.length > 1 ? `${agentConnectProviderLabel(problem.need.provider)}: ` : '';
      const result = await agentConnectRun({
        provider: problem.need.provider,
        api,
        mountElement: view.mount,
        statusElement: view.log,
        report: (line, tone) => agentConnectWriteLog(view.log, `${prefix}${line}`, tone),
      });
      if (!result.ok) { allDone = false; break; }
    }
  } catch (error) {
    allDone = false;
    agentConnectWriteLog(view.log, `❌ 오류: ${(error as Error)?.message || error}`, 'error');
  }
  view.close.disabled = false;
  view.connect.disabled = false;
  view.connect.textContent = PUBLISH_PREFLIGHT_CONNECT_LABEL;
  if (!allDone) return;
  view.connect.hidden = true;
  view.close.textContent = '확인';
  const rest = fixable.length < problems.length;
  agentConnectWriteLog(view.log, rest
    ? '✅ 연결 완료 — 남은 항목은 위 안내를 확인한 뒤 시작을 다시 눌러 주세요.'
    : '✅ 연결 완료 — 이제 시작 버튼을 다시 눌러 주세요.', 'success');
}

function publishPreflightShow(problems: readonly PublishPreflightProblem[], api: AgentConnectApi): void {
  const view = publishPreflightRender();
  publishPreflightFillList(view, problems);
  view.close.addEventListener('click', () => view.overlay.remove());
  if (problems.some((problem) => publishPreflightIsConnectable(problem.kind))) {
    view.connect.addEventListener('click', () => { void publishPreflightConnect(view, problems, api); });
  } else {
    view.connect.remove(); // nothing connecting can fix (quota, plan, slow probe): reason + close only
  }
}

/**
 * True when the run may start. False when an engine is not ready: the guidance window is already on screen,
 * the caller only logs and returns. Never throws.
 */
export async function publishPreflightEnsureReady(
  request: PublishPreflightRequest,
  api: AgentConnectApi = (window as any).api,
): Promise<boolean> {
  const needs = publishPreflightNeeds(request.generator, request.imageSources);
  if (needs.length === 0) return true;
  if (typeof api?.agentStatus !== 'function') return true; // no bridge (unit tests / very early load): the generation-time guard still checks
  const problems = await publishPreflightProbe(api, needs);
  if (problems.length === 0) return true;
  publishPreflightShow(problems, api);
  return false;
}
