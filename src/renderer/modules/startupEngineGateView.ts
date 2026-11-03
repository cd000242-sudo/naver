// src/renderer/modules/startupEngineGateView.ts
// [2026-11-03] Markup of the startup engine gate, split out of startupEngineGate.ts (file-size limit).
// Pure rendering: no persistence, no connection logic. The image engine section arrives as ready-made HTML
// from startupImageEngineGate.ts so this file does not depend on it.
// NOTE: inline bundle = single scope. Every top-level identifier is prefixed startupGateView*.

import type { EngineGateOption } from './startupEngineGate.js';
import { agentConnectChipHtml, agentConnectIsAgentValue } from './agentConnectGate.js';

export interface StartupGateViewPlan {
  readonly checked: string; // text engine radio checked at first paint ('' = none)
  readonly saved: string; // valid saved text engine ('' = none)
  readonly agentDefault: boolean; // first agent pre-selected because nothing valid was saved
  readonly imageHtml: string; // image engine section ('' = the image tab has no engine list)
  readonly ready: boolean; // confirm enabled at first paint (text engine and, when present, image engine chosen)
}

export function startupGateViewEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function startupGateViewOption(option: EngineGateOption, checked: boolean): string {
  const planBadge = option.badge
    ? `<span style="font-size:0.72rem;padding:2px 8px;border-radius:999px;background:#e0e7ff;color:#3730a3;font-weight:700;white-space:nowrap;">${startupGateViewEscape(option.badge)}</span>`
    : '';
  const badge = agentConnectIsAgentValue(option.value)
    ? `<span style="display:flex;gap:0.35rem;align-items:center;">${planBadge}${agentConnectChipHtml(startupGateViewEscape(option.value))}</span>`
    : planBadge;
  return `
    <label data-engine-option="${startupGateViewEscape(option.value)}" style="display:flex;gap:0.75rem;align-items:flex-start;border:2px solid ${checked ? '#4f46e5' : '#e5e7eb'};border-radius:12px;padding:0.8rem 0.9rem;cursor:pointer;background:${checked ? '#eef2ff' : '#fff'};">
      <input type="radio" name="startup-engine-choice" value="${startupGateViewEscape(option.value)}" ${checked ? 'checked' : ''} style="margin-top:3px;width:18px;height:18px;accent-color:#4f46e5;cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;font-weight:800;color:#111827;font-size:0.98rem;">
          <span>${startupGateViewEscape(option.title)}</span>${badge}
        </div>
        ${option.description ? `<div style="font-size:0.82rem;color:#4b5563;margin-top:0.25rem;line-height:1.4;">${startupGateViewEscape(option.description)}</div>` : ''}
      </div>
    </label>`;
}

function startupGateViewSavedLine(plan: StartupGateViewPlan): string {
  if (plan.saved) {
    return `<div style="font-size:0.85rem;color:#4b5563;margin-bottom:0.75rem;">이전에 선택한 엔진: <b>${startupGateViewEscape(plan.saved)}</b> — 그대로 쓰려면 확인을 누르세요.</div>`;
  }
  if (plan.agentDefault) {
    return `<div style="font-size:0.85rem;color:#4b5563;margin-bottom:0.75rem;">저장된 엔진이 없어 구독 에이전트를 먼저 골라 두었습니다. 설치·로그인이 안 된 에이전트는 확인을 누르면 이 창에서 바로 연결합니다.</div>`;
  }
  return `<div style="font-size:0.85rem;color:#b45309;margin-bottom:0.75rem;">저장된 엔진이 없습니다. 글을 만들기 전에 엔진을 골라 주세요.</div>`;
}

function startupGateViewHint(plan: StartupGateViewPlan): string {
  if (plan.ready) return '';
  return plan.imageHtml
    ? '글생성 엔진과 이미지 엔진을 모두 고르면 확인 버튼이 켜집니다.'
    : '엔진을 하나 고르면 확인 버튼이 켜집니다.';
}

export function startupGateViewRender(
  gateId: string,
  options: readonly EngineGateOption[],
  plan: StartupGateViewPlan,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = gateId;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000000;background:rgba(15,23,42,0.82);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:18px;width:min(640px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 60px -20px rgba(0,0,0,0.6);overflow:hidden;">
      <div style="padding:1.25rem 1.5rem 0.75rem;">
        <div style="font-size:1.25rem;font-weight:900;color:#111827;">✍️ 글생성 엔진을 먼저 선택하세요</div>
        <div style="font-size:0.9rem;color:#6b7280;margin-top:0.3rem;">앱을 켤 때마다 확인합니다. 선택한 엔진으로만 글이 생성되고 과금됩니다.</div>
      </div>
      <div style="padding:0 1.5rem;">${startupGateViewSavedLine(plan)}</div>
      <div id="${gateId}-list" style="padding:0 1.5rem 0.5rem;display:flex;flex-direction:column;gap:0.55rem;overflow-y:auto;">
        ${options.map((option) => startupGateViewOption(option, option.value === plan.checked)).join('')}
      </div>
      ${plan.imageHtml}
      <div style="padding:0 1.5rem 0.5rem;">
        <div id="${gateId}-connect-log" role="status" aria-live="polite" style="display:none;font-size:0.85rem;line-height:1.45;word-break:keep-all;"></div>
        <div id="${gateId}-connect-mount"></div>
      </div>
      <div style="padding:0.9rem 1.5rem 1.25rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;align-items:center;gap:0.75rem;">
        <span id="${gateId}-hint" style="font-size:0.82rem;color:#6b7280;flex:1;">${startupGateViewHint(plan)}</span>
        <button id="${gateId}-confirm" type="button" ${plan.ready ? '' : 'disabled'} style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:0.7rem 1.4rem;font-weight:800;font-size:0.95rem;cursor:pointer;">이 엔진으로 시작</button>
      </div>
    </div>`;
  return overlay;
}

export function startupGateViewHighlight(overlay: HTMLElement, value: string): void {
  overlay.querySelectorAll<HTMLElement>('[data-engine-option]').forEach((card) => {
    const active = card.dataset.engineOption === value;
    card.style.borderColor = active ? '#4f46e5' : '#e5e7eb';
    card.style.background = active ? '#eef2ff' : '#fff';
  });
}
