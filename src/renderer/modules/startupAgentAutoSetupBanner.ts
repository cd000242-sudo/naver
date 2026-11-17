// src/renderer/modules/startupAgentAutoSetupBanner.ts
// The small banner of startupAgentAutoSetup: install progress, and one row per engine in use that still needs
// the person (login, a failed install, a subscription problem). Split out to keep both files under 300 lines.
//
// A login can start in exactly one place: the click handler at the bottom of this file.
// Renderer bundle note: every top-level identifier carries the agentAutoSetup / AGENT_AUTO_SETUP prefix.

import type { AgentProvider } from '../../agentCli/types.js';
import { agentConnectProviderLabel, agentConnectRun, type AgentConnectApi } from './agentConnectFlow.js';
import { refreshAgentQuotaBadge } from './agentQuotaBadge.js';
import type { AgentAutoSetupResult } from './startupAgentAutoSetup.js';

export const AGENT_AUTO_SETUP_FAILED_PREFIX = 'agentAutoSetupInstallFailedAt:';
const AGENT_AUTO_SETUP_BANNER_ID = 'agent-auto-setup-banner';

function agentAutoSetupBanner(): HTMLElement {
  const existing = document.getElementById(AGENT_AUTO_SETUP_BANNER_ID);
  if (existing) return existing;
  const banner = document.createElement('div');
  banner.id = AGENT_AUTO_SETUP_BANNER_ID;
  banner.setAttribute('role', 'status');
  // Bottom-left: the bottom-right corner already holds the chatbot and the floating image-settings button.
  banner.style.cssText = [
    'position:fixed', 'left:16px', 'bottom:16px', 'z-index:9000', 'max-width:340px', 'padding:12px 40px 12px 14px',
    'border-radius:12px', 'background:var(--bg-secondary,#1f2937)', 'color:var(--text-strong,#f9fafb)',
    'border:1px solid var(--border-light,rgba(255,255,255,.16))', 'box-shadow:0 8px 24px rgba(0,0,0,.28)',
    'font-size:14px', 'line-height:1.5',
  ].join(';');
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', '닫기');
  close.textContent = '×';
  close.style.cssText = 'position:absolute;top:4px;right:6px;width:32px;height:32px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer';
  close.addEventListener('click', () => banner.remove());
  const progress = document.createElement('div');
  progress.dataset.role = 'progress';
  const rows = document.createElement('div');
  rows.dataset.role = 'rows';
  banner.append(close, progress, rows);
  document.body.appendChild(banner); // body, not the header: a filtered header breaks position:fixed
  return banner;
}

export function agentAutoSetupCloseIfEmpty(): void {
  const banner = document.getElementById(AGENT_AUTO_SETUP_BANNER_ID);
  if (!banner) return;
  const progress = banner.querySelector<HTMLElement>('[data-role="progress"]');
  const rows = banner.querySelector<HTMLElement>('[data-role="rows"]');
  if (!progress?.textContent && !rows?.children.length) banner.remove();
}

export function agentAutoSetupSetProgress(line: string): void {
  if (!line && !document.getElementById(AGENT_AUTO_SETUP_BANNER_ID)) return;
  const progress = agentAutoSetupBanner().querySelector<HTMLElement>('[data-role="progress"]');
  if (progress) progress.textContent = line;
  if (!line) agentAutoSetupCloseIfEmpty();
}

export function agentAutoSetupRowText(result: AgentAutoSetupResult): { text: string; action: string } | null {
  const label = agentConnectProviderLabel(result.provider);
  if (result.installFailed) return { text: `${label} 설치 실패 — ${result.message || '네트워크를 확인해 주세요.'}`, action: '다시 시도' };
  if (result.kind === 'install' || result.kind === 'update') return { text: `${label} 설치가 끝나지 않았어요.`, action: '다시 시도' };
  if (result.kind === 'login') return { text: `${label} 로그인이 필요해요.`, action: '로그인' };
  if (result.kind === 'unavailable') {
    return { text: `${label}: ${result.status?.detail || '구독 상태를 확인해 주세요.'}`, action: '' };
  }
  return null; // ready, or a probe that could not answer: say nothing
}

/** Rows only for the engines in use. Other CLIs were installed quietly and are connected from settings. */
export function agentAutoSetupShowRows(api: AgentConnectApi, results: readonly AgentAutoSetupResult[], inUse: readonly AgentProvider[]): void {
  const pending = results
    .filter((result) => inUse.includes(result.provider))
    .map((result) => ({ result, row: agentAutoSetupRowText(result) }))
    .filter((entry): entry is { result: AgentAutoSetupResult; row: { text: string; action: string } } => entry.row !== null);
  if (pending.length === 0) return;
  const rows = agentAutoSetupBanner().querySelector<HTMLElement>('[data-role="rows"]');
  if (!rows) return;
  for (const { result, row } of pending) {
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px';
    const text = document.createElement('span');
    text.textContent = row.text;
    line.appendChild(text);
    if (row.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.action;
      button.style.cssText = 'align-self:flex-start;min-height:36px;padding:6px 14px;border-radius:8px;border:0;cursor:pointer;font-weight:700;background:#03c75a;color:#fff';
      button.addEventListener('click', () => { void agentAutoSetupOnLoginClick(api, result.provider, line, button); });
      line.appendChild(button);
    }
    rows.appendChild(line);
  }
}

// ── The only place a login can start: the person pressed the button. Keep this function last. ──
async function agentAutoSetupOnLoginClick(
  api: AgentConnectApi,
  provider: AgentProvider,
  line: HTMLElement,
  button: HTMLButtonElement,
): Promise<void> {
  button.disabled = true;
  // One status line and one mount per row, reused on every retry.
  const statusElement = line.querySelector<HTMLElement>('[data-role="status"]') ?? document.createElement('div');
  statusElement.dataset.role = 'status';
  statusElement.style.cssText = 'font-size:13px;opacity:.9';
  const mountElement = document.createElement('div');
  line.append(statusElement, mountElement);
  try {
    localStorage.removeItem(AGENT_AUTO_SETUP_FAILED_PREFIX + provider);
    const result = await agentConnectRun({
      provider,
      api,
      mountElement,
      statusElement,
      report: (text) => { statusElement.textContent = text; },
    });
    if (result.ok) {
      line.remove();
      agentAutoSetupCloseIfEmpty();
      try { await refreshAgentQuotaBadge(); } catch { /* badge refresh is cosmetic */ }
      return;
    }
    statusElement.textContent = result.message;
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : '연결하지 못했습니다. 다시 시도해 주세요.';
  }
  mountElement.remove();
  button.disabled = false;
}
