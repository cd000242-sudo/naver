// src/renderer/modules/agentConnectGate.ts
// Agent-first helpers for the startup engine gate (startupEngineGate.ts):
//   - agent cards go to the top of the list,
//   - every agent card gets a status chip that is filled in asynchronously (10s limit each),
//   - when no engine was saved, the first READY agent is pre-selected (else the first agent).
// The status calls never block the gate from showing, and a probe that cannot answer is
// reported as "확인 지연" — never as "설치 필요".
//
// Renderer bundle note: one shared scope after copy-static, so every top-level name here
// carries the agentConnect / AGENT_CONNECT prefix.

import type { AgentProvider } from '../../agentCli/types.js';
import { agentConnectClassify } from './agentConnectFlow.js';
import type { AgentConnectKind } from './agentConnectFlow.js';

export type AgentConnectChipKind = 'checking' | AgentConnectKind;
type AgentConnectStatusBridge = Pick<Window['api'], 'agentStatus'> | undefined;

export interface AgentConnectChipHooks {
  /** True while the pre-selection may still follow the status results. */
  readonly autoSelect: () => boolean;
  readonly select: (value: string) => void;
}

export interface AgentConnectChipController {
  readonly kinds: ReadonlyMap<string, AgentConnectChipKind>;
  readonly refresh: (value: string) => Promise<void>;
  /** Current kind; waits for the in-flight probe (bounded by the 10s limit) while still checking. */
  readonly settle: (value: string) => Promise<AgentConnectChipKind>;
}

/**
 * Only a missing install or login is fixed inside the gate. A delayed probe or an unavailable
 * account (quota, expired plan) keeps the user's choice: blocking startup on a slow status probe
 * or a temporary quota would lock the user out of their own engine, and the generation-time
 * guard (ensureAgentEngineReady) still checks before any request is sent.
 */
export function agentConnectGateNeedsConnect(kind: AgentConnectChipKind | undefined): boolean {
  return kind === 'install' || kind === 'login';
}

const AGENT_CONNECT_STATUS_LIMIT_MS = 10_000;
const AGENT_CONNECT_CHIP_LABELS: Readonly<Record<AgentConnectChipKind, string>> = Object.freeze({
  checking: '⏳ 확인 중',
  ready: '준비됨',
  install: '설치 필요',
  login: '로그인 필요',
  unavailable: '사용 불가',
  delayed: '확인 지연',
});
const AGENT_CONNECT_CHIP_COLORS: Readonly<Record<AgentConnectChipKind, readonly [string, string]>> = Object.freeze({
  checking: ['#f3f4f6', '#4b5563'],
  ready: ['#d1fae5', '#047857'],
  install: ['#fef3c7', '#92400e'],
  login: ['#fef3c7', '#92400e'],
  unavailable: ['#fee2e2', '#991b1b'],
  delayed: ['#e5e7eb', '#374151'],
});
const AGENT_CONNECT_PROVIDERS: Readonly<Record<string, AgentProvider>> = Object.freeze({
  'agent-codex': 'codex',
  'agent-claude': 'claude',
  'agent-gemini': 'gemini',
});

export function agentConnectIsAgentValue(value: string): boolean {
  return value.startsWith('agent-');
}

export function agentConnectProviderFromValue(value: string): AgentProvider | undefined {
  return AGENT_CONNECT_PROVIDERS[value];
}

/** Agents first (their DOM order kept), everything else in its existing order. */
export function agentConnectOrderGateOptions<T extends { readonly value: string }>(
  options: readonly T[],
): T[] {
  return [
    ...options.filter((option) => agentConnectIsAgentValue(option.value)),
    ...options.filter((option) => !agentConnectIsAgentValue(option.value)),
  ];
}

/** Value of the checked engine radio inside the gate ('' when none). */
export function agentConnectGateChoice(overlay: HTMLElement): string {
  return overlay.querySelector<HTMLInputElement>('input[name="startup-engine-choice"]:checked')?.value || '';
}

/** Disables / re-enables every engine radio of the gate (used while a connection runs). */
export function agentConnectGateLock(overlay: HTMLElement, locked: boolean): void {
  overlay.querySelectorAll<HTMLInputElement>('input[name="startup-engine-choice"]').forEach((radio) => {
    radio.disabled = locked;
  });
}

export function agentConnectChipLabel(kind: AgentConnectChipKind): string {
  return AGENT_CONNECT_CHIP_LABELS[kind];
}

function agentConnectChipStyle(kind: AgentConnectChipKind): string {
  const [background, color] = AGENT_CONNECT_CHIP_COLORS[kind];
  return `font-size:0.72rem;padding:2px 8px;border-radius:999px;font-weight:700;white-space:nowrap;background:${background};color:${color};`;
}

/** Initial chip markup; the value comes from the settings radios, never from user input. */
export function agentConnectChipHtml(value: string): string {
  return `<span data-engine-chip="${value}" data-chip-kind="checking" style="${agentConnectChipStyle('checking')}">${agentConnectChipLabel('checking')}</span>`;
}

function agentConnectPaintChip(chip: HTMLElement, kind: AgentConnectChipKind): void {
  chip.textContent = agentConnectChipLabel(kind);
  chip.dataset.chipKind = kind;
  chip.style.cssText = agentConnectChipStyle(kind);
}

/**
 * Status of one provider without forceRefresh, limited to `timeoutMs`.
 * Timeout, rejection and a failed call all read as "delayed": nothing is known about the account.
 */
export async function agentConnectFetchKind(
  api: AgentConnectStatusBridge,
  provider: AgentProvider,
  timeoutMs: number = AGENT_CONNECT_STATUS_LIMIT_MS,
): Promise<AgentConnectKind> {
  if (typeof api?.agentStatus !== 'function') return 'delayed';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  try {
    const res = await Promise.race([api.agentStatus(provider), limit]);
    if (res === 'timeout' || !res?.success) return 'delayed';
    return agentConnectClassify(res.status);
  } catch {
    return 'delayed';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * First ready agent, decided only once every earlier agent has answered, so the selection
 * never flickers. With no ready agent the first agent stays selected. Without agents: nothing.
 */
export function agentConnectPickDefault(
  agentValues: readonly string[],
  kinds: ReadonlyMap<string, AgentConnectChipKind>,
): { readonly value: string; readonly settled: boolean } {
  for (const value of agentValues) {
    const kind = kinds.get(value) ?? 'checking';
    if (kind === 'checking') return { value: '', settled: false };
    if (kind === 'ready') return { value, settled: true };
  }
  return { value: agentValues[0] ?? '', settled: true };
}

/** Fills the chips of every agent card and applies the default-agent rule once. */
export function agentConnectStartChips(
  overlay: HTMLElement,
  agentValues: readonly string[],
  api: AgentConnectStatusBridge,
  hooks: AgentConnectChipHooks,
): AgentConnectChipController {
  const kinds = new Map<string, AgentConnectChipKind>(agentValues.map((value) => [value, 'checking']));
  const pending = new Map<string, Promise<void>>();
  let decided = false;
  const paint = (value: string, kind: AgentConnectChipKind): void => {
    kinds.set(value, kind);
    const chip = overlay.querySelector<HTMLElement>(`[data-engine-chip="${value}"]`);
    if (chip) agentConnectPaintChip(chip, kind);
  };
  const decide = (): void => {
    if (decided || !hooks.autoSelect()) return;
    const pick = agentConnectPickDefault(agentValues, kinds);
    if (!pick.settled) return;
    decided = true;
    if (pick.value) hooks.select(pick.value);
  };
  const load = async (value: string): Promise<void> => {
    const provider = agentConnectProviderFromValue(value);
    const kind = provider ? await agentConnectFetchKind(api, provider) : 'delayed';
    if (!overlay.isConnected) return;
    paint(value, kind);
    decide();
  };
  const track = (value: string): Promise<void> => {
    const run = load(value);
    pending.set(value, run);
    return run;
  };
  agentValues.forEach((value) => { void track(value); });
  return {
    kinds,
    refresh: (value) => { paint(value, 'checking'); return track(value); },
    settle: async (value) => {
      if (kinds.get(value) === 'checking') await pending.get(value);
      return kinds.get(value) ?? 'delayed';
    },
  };
}
