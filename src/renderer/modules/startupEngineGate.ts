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

import { resolveTextModelSelection } from '../utils/agentProductPolicyUi.js';
import { restoreTextModelRadio } from '../utils/settingsModal.js';

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderOption(option: EngineGateOption, checked: boolean): string {
  const badge = option.badge
    ? `<span style="font-size:0.72rem;padding:2px 8px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-weight:700;white-space:nowrap;">${escapeHtml(option.badge)}</span>`
    : '';
  return `
    <label data-engine-option="${escapeHtml(option.value)}" style="display:flex;gap:0.75rem;align-items:flex-start;border:2px solid ${checked ? '#4f46e5' : '#e5e7eb'};border-radius:12px;padding:0.8rem 0.9rem;cursor:pointer;background:${checked ? '#eef2ff' : '#fff'};">
      <input type="radio" name="startup-engine-choice" value="${escapeHtml(option.value)}" ${checked ? 'checked' : ''} style="margin-top:3px;width:18px;height:18px;accent-color:#4f46e5;cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;font-weight:800;color:#111827;font-size:0.98rem;">
          <span>${escapeHtml(option.title)}</span>${badge}
        </div>
        ${option.description ? `<div style="font-size:0.82rem;color:#4b5563;margin-top:0.25rem;line-height:1.4;">${escapeHtml(option.description)}</div>` : ''}
      </div>
    </label>`;
}

function renderGate(options: EngineGateOption[], savedModel: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = STARTUP_ENGINE_GATE_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000000;background:rgba(15,23,42,0.82);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem;';
  const savedLine = savedModel
    ? `<div style="font-size:0.85rem;color:#4b5563;margin-bottom:0.75rem;">이전에 선택한 엔진: <b>${escapeHtml(savedModel)}</b> — 그대로 쓰려면 확인을 누르세요.</div>`
    : `<div style="font-size:0.85rem;color:#b45309;margin-bottom:0.75rem;">저장된 엔진이 없습니다. 글을 만들기 전에 엔진을 골라 주세요.</div>`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;width:min(640px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 60px -20px rgba(0,0,0,0.6);overflow:hidden;">
      <div style="padding:1.25rem 1.5rem 0.75rem;">
        <div style="font-size:1.25rem;font-weight:900;color:#111827;">✍️ 글생성 엔진을 먼저 선택하세요</div>
        <div style="font-size:0.9rem;color:#6b7280;margin-top:0.3rem;">앱을 켤 때마다 확인합니다. 선택한 엔진으로만 글이 생성되고 과금됩니다.</div>
      </div>
      <div style="padding:0 1.5rem;">${savedLine}</div>
      <div id="${STARTUP_ENGINE_GATE_ID}-list" style="padding:0 1.5rem 0.5rem;display:flex;flex-direction:column;gap:0.55rem;overflow-y:auto;">
        ${options.map((option) => renderOption(option, option.value === savedModel)).join('')}
      </div>
      <div style="padding:0.9rem 1.5rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;align-items:center;gap:0.75rem;">
        <span id="${STARTUP_ENGINE_GATE_ID}-hint" style="font-size:0.82rem;color:#6b7280;flex:1;">${savedModel ? '' : '엔진을 하나 고르면 확인 버튼이 켜집니다.'}</span>
        <button id="${STARTUP_ENGINE_GATE_ID}-confirm" type="button" ${savedModel ? '' : 'disabled'} style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:0.7rem 1.4rem;font-weight:800;font-size:0.95rem;cursor:pointer;">이 엔진으로 시작</button>
      </div>
    </div>`;
  return overlay;
}

function highlightChoice(overlay: HTMLElement, value: string): void {
  overlay.querySelectorAll<HTMLElement>('[data-engine-option]').forEach((card) => {
    const active = card.dataset.engineOption === value;
    card.style.borderColor = active ? '#4f46e5' : '#e5e7eb';
    card.style.background = active ? '#eef2ff' : '#fff';
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

/** Resolves once the user confirms an engine. The overlay has no close or skip path. */
export function showStartupEngineGate(savedModel: string): Promise<string | null> {
  const options = collectEngineGateOptions();
  if (options.length === 0) {
    console.warn('[StartupEngineGate] 엔진 카드가 없어 게이트를 건너뜁니다.');
    return Promise.resolve(null);
  }
  document.getElementById(STARTUP_ENGINE_GATE_ID)?.remove();
  const preselected = options.some((option) => option.value === savedModel) ? savedModel : '';
  const overlay = renderGate(options, preselected);
  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    const confirmBtn = overlay.querySelector<HTMLButtonElement>(`#${STARTUP_ENGINE_GATE_ID}-confirm`);
    const hint = overlay.querySelector<HTMLElement>(`#${STARTUP_ENGINE_GATE_ID}-hint`);
    const selectedValue = () =>
      overlay.querySelector<HTMLInputElement>('input[name="startup-engine-choice"]:checked')?.value || '';

    overlay.addEventListener('change', () => {
      const value = selectedValue();
      highlightChoice(overlay, value);
      if (confirmBtn) confirmBtn.disabled = !value;
      if (hint) hint.textContent = '';
    });

    confirmBtn?.addEventListener('click', async () => {
      const value = selectedValue();
      if (!value || !confirmBtn) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '저장 중...';
      const title = options.find((option) => option.value === value)?.title || value;
      try {
        await applyEngineGateSelection(value, title);
        overlay.remove();
        resolve(value);
      } catch (error) {
        console.error('[StartupEngineGate] 엔진 저장 실패:', error);
        confirmBtn.disabled = false;
        confirmBtn.textContent = '이 엔진으로 시작';
        if (hint) hint.textContent = `저장 실패: ${(error as Error)?.message || error}. 다시 시도해 주세요.`;
      }
    });
  });
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
