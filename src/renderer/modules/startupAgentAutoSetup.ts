// src/renderer/modules/startupAgentAutoSetup.ts
// [2026-11-17 owner] "처음에 엔진 선택부터 뜨는 것 없애고, 글은 클로드 코드 · 이미지는 코덱스. CLI 연동 상태만
// 점검해서 자동 설치까지." Buyers run the app on their own subscription through the agent CLIs, so the app
// must be usable right after launch. This replaces the blocking startup engine window (2026-09-10).
//
//   1. Once per install: text engine = Claude Code, image engine = Codex (owner decision: existing users too).
//      After that the choice made in settings is never touched again.
//   2. In the background: install any of the three agent CLIs that is missing or too old.
//   3. Login is never started here. A small banner offers a [로그인] button for the engines in use only.
// Nothing here switches to another engine when one is not ready (no silent fallback).
//
// Renderer bundle note: copy-static concatenates renderer modules into one scope, so every top-level
// identifier carries the agentAutoSetup / AGENT_AUTO_SETUP prefix.

import type { AgentCliStatus, AgentProvider } from '../../agentCli/types.js';
import { resolveTextModelSelection } from '../utils/agentProductPolicyUi.js';
import { restoreTextModelRadio } from '../utils/settingsModal.js';
import { agentConnectClassify, agentConnectProviderLabel, type AgentConnectKind } from './agentConnectFlow.js';
import { refreshAgentQuotaBadge } from './agentQuotaBadge.js';
import {
  AGENT_AUTO_SETUP_FAILED_PREFIX,
  agentAutoSetupCloseIfEmpty,
  agentAutoSetupSetProgress,
  agentAutoSetupShowRows,
} from './startupAgentAutoSetupBanner.js';
import { startupImageApplyDefault } from './startupImageEngineGate.js';

export const AGENT_AUTO_SETUP_PROVIDERS: readonly AgentProvider[] = Object.freeze(['claude', 'codex', 'gemini']);
/** Text-engine flag: lives in the config file next to the engine it guards (localStorage is only a backup). */
export const AGENT_AUTO_SETUP_MIGRATION_KEY = 'engineDefaultsClaudeCodexV1';
/** Image-engine flag: the image engine itself is kept in localStorage, so its flag is too. */
export const AGENT_AUTO_SETUP_IMAGE_KEY = 'engineDefaultsImageCodexV1';
/** After a failed install the next automatic try waits this long; the banner button still retries at once. */
export const AGENT_AUTO_SETUP_RETRY_MS = 6 * 60 * 60 * 1000;
const AGENT_AUTO_SETUP_TEXT_ENGINE = 'agent-claude';
const AGENT_AUTO_SETUP_IMAGE_ENGINE = 'codex-image';

export interface AgentAutoSetupResult {
  readonly provider: AgentProvider;
  readonly kind: AgentConnectKind;
  readonly installFailed?: boolean;
  readonly message?: string;
  readonly status?: Partial<AgentCliStatus>;
}

type AgentAutoSetupInstallApi = Pick<Window['api'], 'agentStatus' | 'agentInstall'>;
type AgentAutoSetupConfigApi = Pick<Window['api'], 'getConfig' | 'saveConfig'>;
type AgentAutoSetupStore = Pick<Storage, 'getItem' | 'setItem'>;
interface AgentAutoSetupInstallOptions {
  readonly store?: AgentAutoSetupStore;
  readonly now?: () => number;
}

export function agentAutoSetupNeedsMigration(config: unknown, store: Pick<Storage, 'getItem'>): boolean {
  const flagged = (config as Record<string, unknown> | null)?.[AGENT_AUTO_SETUP_MIGRATION_KEY] === true;
  return !flagged && store.getItem(AGENT_AUTO_SETUP_MIGRATION_KEY) !== '1';
}

/** Engines whose login matters right now: the text agent, and Codex when it draws the images. */
export function agentAutoSetupLoginProviders(textEngine: string, imageEngine: string): AgentProvider[] {
  const text = /^agent-(claude|codex|gemini)$/.exec(String(textEngine || '').trim())?.[1] as AgentProvider | undefined;
  const needed = new Set<AgentProvider>();
  if (text) needed.add(text);
  if (String(imageEngine || '').trim() === AGENT_AUTO_SETUP_IMAGE_ENGINE) needed.add('codex');
  return AGENT_AUTO_SETUP_PROVIDERS.filter((provider) => needed.has(provider));
}

async function agentAutoSetupProbe(api: AgentAutoSetupInstallApi, provider: AgentProvider): Promise<Partial<AgentCliStatus> | null> {
  try {
    const res = await api.agentStatus(provider, { forceRefresh: true });
    return res?.success && res.status ? res.status : null;
  } catch {
    return null; // a probe that could not answer is "unknown", never "not installed"
  }
}

/** Installs every missing or outdated CLI, one at a time. Never throws; a failure is reported and skipped. */
export async function runAgentAutoSetupInstalls(
  api: AgentAutoSetupInstallApi,
  report: (line: string) => void,
  options: AgentAutoSetupInstallOptions = {},
): Promise<AgentAutoSetupResult[]> {
  const now = options.now ?? Date.now;
  const results: AgentAutoSetupResult[] = [];
  for (const provider of AGENT_AUTO_SETUP_PROVIDERS) {
    const label = agentConnectProviderLabel(provider);
    let status = await agentAutoSetupProbe(api, provider);
    let kind = agentConnectClassify(status);
    if (kind === 'install' || kind === 'update') {
      const failedAt = Number(options.store?.getItem(AGENT_AUTO_SETUP_FAILED_PREFIX + provider) || 0);
      if (failedAt > 0 && now() - failedAt < AGENT_AUTO_SETUP_RETRY_MS) {
        // Do not reinstall on every launch of a PC where the download is blocked.
        results.push({ provider, kind, installFailed: true, message: '자동 설치가 최근에 실패했습니다.' });
        continue;
      }
      report(`${label} ${kind === 'update' ? '업데이트' : '설치'} 중…`);
      let outcome: { success?: boolean; code?: string; message?: string } | undefined;
      try {
        outcome = await api.agentInstall(provider);
      } catch (error) {
        outcome = { success: false, message: error instanceof Error ? error.message : String(error) };
      }
      if (!outcome?.success && outcome?.code === 'busy') {
        // The person is installing or logging in from settings right now: that is not a failure.
        results.push({ provider, kind: 'delayed' });
        continue;
      }
      if (!outcome?.success) {
        const message = outcome?.message || '설치에 실패했습니다.';
        report(`${label} 설치 실패`);
        options.store?.setItem(AGENT_AUTO_SETUP_FAILED_PREFIX + provider, String(now()));
        results.push({ provider, kind, installFailed: true, message });
        continue;
      }
      status = await agentAutoSetupProbe(api, provider);
      kind = agentConnectClassify(status);
    }
    results.push({ provider, kind, ...(status ? { status } : {}) });
  }
  return results;
}

/**
 * Text engine, once. Saves only its own three fields (never the whole config back), then re-reads: the flag
 * is trusted only when the engine really is what was written. Returns false when nothing was applied.
 */
export async function agentAutoSetupApplyTextDefault(api: AgentAutoSetupConfigApi, store: AgentAutoSetupStore): Promise<boolean> {
  const before = await api.getConfig();
  if (!agentAutoSetupNeedsMigration(before, store)) return false;
  const selection = resolveTextModelSelection(AGENT_AUTO_SETUP_TEXT_ENGINE, undefined, false);
  await api.saveConfig({
    primaryGeminiTextModel: selection.model,
    defaultAiProvider: selection.provider,
    [AGENT_AUTO_SETUP_MIGRATION_KEY]: true,
  } as never);
  const after = (await api.getConfig()) as Record<string, unknown> | null;
  if (String(after?.primaryGeminiTextModel || '') !== selection.model) {
    throw new Error('기본 글 엔진이 저장되지 않았습니다.');
  }
  // Backup for a config that does not keep the flag: without it the next launch would overwrite the user's choice.
  if (after?.[AGENT_AUTO_SETUP_MIGRATION_KEY] !== true) store.setItem(AGENT_AUTO_SETUP_MIGRATION_KEY, '1');
  restoreTextModelRadio(selection.model);
  const unifiedGenerator = document.getElementById('unified-generator') as HTMLInputElement | null;
  if (unifiedGenerator) unifiedGenerator.value = selection.provider;
  const navStatus = document.getElementById('nav-text-engine-status');
  if (navStatus) navStatus.textContent = '현재: Claude Code';
  console.log('[AgentAutoSetup] 기본 글 엔진 적용: Claude Code');
  return true;
}

/** Image engine, once. Its own flag, set only when the engine was really saved (retried next launch otherwise). */
export function agentAutoSetupApplyImageDefault(store: AgentAutoSetupStore, apply: (value: string) => boolean = startupImageApplyDefault): boolean {
  if (store.getItem(AGENT_AUTO_SETUP_IMAGE_KEY) === '1') return false;
  if (!apply(AGENT_AUTO_SETUP_IMAGE_ENGINE)) {
    console.warn('[AgentAutoSetup] 이미지 엔진 기본값을 적용하지 못했습니다 — 다음 실행 때 다시 시도합니다.');
    return false;
  }
  store.setItem(AGENT_AUTO_SETUP_IMAGE_KEY, '1');
  console.log('[AgentAutoSetup] 기본 이미지 엔진 적용: Codex');
  return true;
}

async function agentAutoSetupRunBackground(api: Window['api'], textEngine: string, imageEngine: string): Promise<void> {
  let stopProgress: (() => void) | undefined;
  // agentModeGuard reads this to say "being installed" instead of "go install it" while the installs run.
  (window as any).__agentAutoSetupInstalling = true;
  try {
    stopProgress = api.onAgentInstallProgress?.((progress) => {
      agentAutoSetupSetProgress(`${agentConnectProviderLabel(progress.provider)} · ${progress.message}`);
    });
    const results = await runAgentAutoSetupInstalls(api, agentAutoSetupSetProgress, { store: localStorage });
    for (const result of results) {
      if (result.installFailed) console.warn(`[AgentAutoSetup] ${result.provider} 설치 실패: ${result.message}`);
    }
    agentAutoSetupSetProgress('');
    agentAutoSetupShowRows(api, results, agentAutoSetupLoginProviders(textEngine, imageEngine));
    agentAutoSetupCloseIfEmpty();
    await refreshAgentQuotaBadge();
  } catch (error) {
    console.warn('[AgentAutoSetup] 자동 점검 실패 — 환경설정에서 직접 연결할 수 있습니다:', error);
  } finally {
    (window as any).__agentAutoSetupInstalling = false;
    try { stopProgress?.(); } catch { /* the event source may already be closed */ }
  }
}

/**
 * Startup entry. Applies the one-time defaults (awaited: later startup steps read them), then checks and
 * installs in the background. Skipped without an IPC bridge (unit tests) and under E2E_TEST=1.
 */
export async function initStartupAgentAutoSetup(): Promise<void> {
  const api = (window as any).api as Window['api'] | undefined;
  if (!api?.getConfig || !api?.saveConfig || !api?.agentStatus || !api?.agentInstall) return;
  try {
    const info = await (window as any).api.getAppInfo?.(); // not on the typed bridge (same call as the old gate)
    if (info?.e2eTest) return;
  } catch { /* treat as a normal launch */ }

  try {
    await agentAutoSetupApplyTextDefault(api, localStorage);
  } catch (error) {
    console.warn('[AgentAutoSetup] 기본 글 엔진 적용 실패 — 다음 실행 때 다시 시도합니다:', error);
  }
  try {
    agentAutoSetupApplyImageDefault(localStorage);
  } catch (error) {
    console.warn('[AgentAutoSetup] 기본 이미지 엔진 적용 실패 — 다음 실행 때 다시 시도합니다:', error);
  }

  let textEngine = '';
  try {
    textEngine = String(((await api.getConfig()) as { primaryGeminiTextModel?: unknown } | null)?.primaryGeminiTextModel || '').trim();
  } catch { /* unknown text engine: only the image engine decides who needs a login row */ }
  const imageEngine = String(localStorage.getItem('globalImageSource') || AGENT_AUTO_SETUP_IMAGE_ENGINE);
  void agentAutoSetupRunBackground(api, textEngine, imageEngine);
}
