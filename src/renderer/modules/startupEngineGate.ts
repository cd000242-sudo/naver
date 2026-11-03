// src/renderer/modules/startupEngineGate.ts
// [2026-09-10] Blocking engine picker shown on EVERY app launch.
//
// Owner directive: "앱이 켜지면 항상 글생성엔진부터 선택하도록해". Background: whenever
// primaryGeminiTextModel was missing from settings.json, every fallback path (settings
// radios, main-process vision routing, configManager normalisation) silently resolved to
// Gemini 3.1 Flash-Lite, so users kept publishing on an engine they never picked.
//
// The gate reuses the engine cards already in index.html (input[name="primaryGeminiTextModel"])
// so the list of engines has exactly one source of truth. Persisting goes through the same
// fields settingsModal.saveSettings writes (primaryGeminiTextModel + defaultAiProvider).

// [2026-11-03] Agent-first: agent-* cards are listed on top and pre-selected when nothing was
// saved; an agent that is not ready is connected (install -> login -> real answer) inside this
// window. A failed connection keeps the window open: no silent engine swap.

import type { AgentProvider } from '../../agentCli/types.js';
import { resolveTextModelSelection } from '../utils/agentProductPolicyUi.js';
import { restoreTextModelRadio } from '../utils/settingsModal.js';
import { agentConnectRun, agentConnectWriteLog } from './agentConnectFlow.js';
import type { AgentConnectResult } from './agentConnectFlow.js';
import {
  agentConnectGateChoice,
  agentConnectGateLock,
  agentConnectGateNeedsConnect,
  agentConnectIsAgentValue,
  agentConnectOrderGateOptions,
  agentConnectProviderFromValue,
  agentConnectStartChips,
} from './agentConnectGate.js';
import type { AgentConnectChipController } from './agentConnectGate.js';
import { startupGateViewHighlight, startupGateViewRender } from './startupEngineGateView.js';
import {
  startupImageBuildPlan,
  startupImageCollectOptions,
  startupImageGateBind,
  startupImageGateCommit,
  startupImageGateHtml,
  startupImageGatePending,
} from './startupImageEngineGate.js';

export const STARTUP_ENGINE_GATE_ID = 'startup-engine-gate';

export interface EngineGateOption {
  readonly value: string;
  readonly title: string;
  readonly badge: string;
  readonly description: string;
}

/** Reads the engine cards from the settings DOM. Empty when the settings UI is absent. */
export function collectEngineGateOptions(root: ParentNode = document): EngineGateOption[] {
  const radios = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[name="primaryGeminiTextModel"]'),
  );
  return radios
    .filter((radio) => radio.value.trim().length > 0)
    .map((radio) => {
      const card = radio.closest('label');
      const body = card?.querySelector<HTMLElement>('div[style*="flex: 1"]');
      const headline = body?.children[0] as HTMLElement | undefined;
      const spans = headline ? Array.from(headline.querySelectorAll('span')) : [];
      const title = (spans[0]?.textContent || radio.value).trim();
      const badge = (spans[1]?.textContent || '').trim();
      const description = ((body?.children[1] as HTMLElement | undefined)?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      return Object.freeze({ value: radio.value, title, badge, description });
    });
}

/** Persists the choice the same way settingsModal.saveSettings does and syncs dependent UI. */
export async function applyEngineGateSelection(model: string, title: string): Promise<void> {
  const selection = resolveTextModelSelection(model, undefined, false);
  const api = (window as any).api;
  const cfg = (await api.getConfig()) || {};
  await api.saveConfig({
    ...cfg,
    primaryGeminiTextModel: selection.model,
    defaultAiProvider: selection.provider,
  });
  restoreTextModelRadio(selection.model);
  const unifiedGenerator = document.getElementById('unified-generator') as HTMLInputElement | null;
  if (unifiedGenerator) unifiedGenerator.value = selection.provider;
  const navStatus = document.getElementById('nav-text-engine-status');
  if (navStatus) navStatus.textContent = `현재: ${title}`;
  console.log(`[StartupEngineGate] 글생성 엔진 확정: ${selection.model} (provider=${selection.provider})`);
}

interface GateState {
  userTouched: boolean; // the user clicked a radio: the automatic agent default stops
  busy: boolean; // a connection / save is running: radios and button stay locked
}

interface GateContext {
  readonly overlay: HTMLElement;
  readonly options: readonly EngineGateOption[];
  readonly chips: AgentConnectChipController;
  readonly confirmBtn: HTMLButtonElement;
  readonly hint: HTMLElement;
  readonly resolve: (value: string) => void;
  readonly state: GateState;
}

/** Confirm needs a text engine and, when the image tab offers engines, an image engine too. */
function startupGateCanConfirm(overlay: HTMLElement, state: GateState): boolean {
  return !!agentConnectGateChoice(overlay) && !state.busy && !startupImageGatePending(overlay);
}

function startupGateSelect(overlay: HTMLElement, confirmBtn: HTMLButtonElement, state: GateState, value: string): void {
  const radio = overlay.querySelector<HTMLInputElement>(`input[name="startup-engine-choice"][value="${value}"]`);
  if (!radio) return;
  radio.checked = true;
  startupGateViewHighlight(overlay, value);
  confirmBtn.disabled = !startupGateCanConfirm(overlay, state);
}

/** Runs the shared connection flow inside the gate: log line + login prompt mount live here. */
function startupGateConnect(overlay: HTMLElement, provider: AgentProvider): Promise<AgentConnectResult> {
  const log = overlay.querySelector<HTMLElement>(`#${STARTUP_ENGINE_GATE_ID}-connect-log`) as HTMLElement;
  const mount = overlay.querySelector<HTMLElement>(`#${STARTUP_ENGINE_GATE_ID}-connect-mount`) as HTMLElement;
  return agentConnectRun({
    provider,
    api: (window as any).api,
    mountElement: mount,
    statusElement: log,
    report: (line, tone) => agentConnectWriteLog(log, line, tone),
  });
}

async function startupGateConfirm(ctx: GateContext): Promise<void> {
  const value = agentConnectGateChoice(ctx.overlay);
  if (!value || ctx.state.busy) return;
  ctx.state.busy = true;
  agentConnectGateLock(ctx.overlay, true);
  ctx.confirmBtn.disabled = true;
  const title = ctx.options.find((option) => option.value === value)?.title || value;
  try {
    const provider = agentConnectProviderFromValue(value);
    if (provider && agentConnectGateNeedsConnect(await ctx.chips.settle(value))) {
      ctx.confirmBtn.textContent = '연결 중...';
      const result = await startupGateConnect(ctx.overlay, provider);
      if (!result.ok) {
        void ctx.chips.refresh(value);
        ctx.hint.textContent = '위 사유를 해결한 뒤 다시 누르거나, 다른 엔진을 고를 수 있습니다.';
        return;
      }
    }
    ctx.confirmBtn.textContent = '저장 중...';
    await applyEngineGateSelection(value, title);
    const imageProblem = await startupImageGateCommit(ctx.overlay); // image tab save path; consent for collect-photos
    if (imageProblem) {
      ctx.hint.textContent = imageProblem;
      return;
    }
    ctx.overlay.remove();
    ctx.resolve(value);
  } catch (error) {
    console.error('[StartupEngineGate] 엔진 저장 실패:', error);
    ctx.hint.textContent = `저장 실패: ${(error as Error)?.message || error}. 다시 시도해 주세요.`;
  } finally {
    ctx.state.busy = false;
    if (ctx.overlay.isConnected) {
      agentConnectGateLock(ctx.overlay, false);
      ctx.confirmBtn.disabled = !startupGateCanConfirm(ctx.overlay, ctx.state);
      ctx.confirmBtn.textContent = '이 엔진으로 시작';
    }
  }
}

function startupGateBind(
  overlay: HTMLElement,
  options: readonly EngineGateOption[],
  agentValues: readonly string[],
  agentDefault: boolean,
  resolve: (value: string) => void,
): void {
  const confirmBtn = overlay.querySelector<HTMLButtonElement>(`#${STARTUP_ENGINE_GATE_ID}-confirm`);
  const hint = overlay.querySelector<HTMLElement>(`#${STARTUP_ENGINE_GATE_ID}-hint`);
  if (!confirmBtn || !hint) return;
  const state: GateState = { userTouched: false, busy: false };
  const chips = agentConnectStartChips(overlay, agentValues, (window as any).api, {
    autoSelect: () => agentDefault && !state.userTouched,
    select: (value) => startupGateSelect(overlay, confirmBtn, state, value),
  });
  const ctx: GateContext = { overlay, options, chips, confirmBtn, hint, resolve, state };

  overlay.addEventListener('change', (event) => {
    if ((event.target as HTMLInputElement | null)?.name !== 'startup-engine-choice') return;
    state.userTouched = true;
    startupGateViewHighlight(overlay, agentConnectGateChoice(overlay));
    confirmBtn.disabled = !startupGateCanConfirm(overlay, state);
    hint.textContent = '';
  });
  startupImageGateBind(overlay, () => {
    confirmBtn.disabled = !startupGateCanConfirm(overlay, state);
    hint.textContent = '';
  });
  confirmBtn.addEventListener('click', () => { void startupGateConfirm(ctx); });
}

/** Resolves once the user confirms an engine. The overlay has no close or skip path. */
export function showStartupEngineGate(savedModel: string): Promise<string | null> {
  const options = agentConnectOrderGateOptions(collectEngineGateOptions());
  if (options.length === 0) {
    console.warn('[StartupEngineGate] 엔진 카드가 없어 게이트를 건너뜁니다.');
    return Promise.resolve(null);
  }
  document.getElementById(STARTUP_ENGINE_GATE_ID)?.remove();
  const saved = options.some((option) => option.value === savedModel) ? savedModel : '';
  const agentValues = options.map((option) => option.value).filter(agentConnectIsAgentValue);
  const agentDefault = !saved && agentValues.length > 0;
  const checked = saved || (agentDefault ? agentValues[0] : '');
  const imagePlan = startupImageBuildPlan(startupImageCollectOptions());
  const imageHtml = startupImageGateHtml(imagePlan);
  const ready = !!checked && (!imageHtml || !!imagePlan.checked);
  const overlay = startupGateViewRender(STARTUP_ENGINE_GATE_ID, options, { checked, saved, agentDefault, imageHtml, ready });
  document.body.appendChild(overlay);
  return new Promise((resolve) => startupGateBind(overlay, options, agentValues, agentDefault, resolve));
}

/**
 * Startup entry. Skipped when there is no IPC bridge (unit tests) or under Playwright
 * (E2E_TEST=1), where a blocking overlay would swallow every click.
 */
export async function initStartupEngineGate(): Promise<string | null> {
  const api = (window as any).api;
  if (!api?.getConfig || !api?.saveConfig) return null;
  try {
    const info = await api.getAppInfo?.();
    if (info?.e2eTest) return null;
  } catch { /* treat as normal launch */ }
  let savedModel = '';
  try {
    const cfg = await api.getConfig();
    savedModel = String(cfg?.primaryGeminiTextModel || '').trim();
  } catch (error) {
    console.warn('[StartupEngineGate] 설정 로드 실패 — 저장값 없이 게이트 표시:', error);
  }
  return showStartupEngineGate(savedModel);
}
