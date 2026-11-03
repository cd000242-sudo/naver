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
    ? `<span class="nv-tag">${startupGateViewEscape(option.badge)}</span>`
    : '';
  const badge = agentConnectIsAgentValue(option.value)
    ? `<span style="display:flex;gap:0.35rem;align-items:center;">${planBadge}${agentConnectChipHtml(startupGateViewEscape(option.value))}</span>`
    : planBadge;
  return `
    <label data-engine-option="${startupGateViewEscape(option.value)}" style="display:flex;gap:0.75rem;align-items:flex-start;padding:0.8rem 0.9rem;cursor:pointer;">
      <input type="radio" name="startup-engine-choice" value="${startupGateViewEscape(option.value)}" ${checked ? 'checked' : ''} style="margin-top:3px;width:18px;height:18px;cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;font-weight:800;font-size:0.98rem;">
          <span>${startupGateViewEscape(option.title)}</span>${badge}
        </div>
        ${option.description ? `<div class="nv-modal__note" style="margin-top:0.25rem;">${startupGateViewEscape(option.description)}</div>` : ''}
      </div>
    </label>`;
}

function startupGateViewSavedLine(plan: StartupGateViewPlan): string {
  if (plan.saved) {
    return `<div class="nv-modal__note" style="margin-bottom:0.75rem;">이전에 선택한 엔진: <b>${startupGateViewEscape(plan.saved)}</b> — 그대로 쓰려면 확인을 누르세요.</div>`;
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
  // Colors come from the theme classes (theme-naver-components.css section 2); only the stacking order stays inline.
  overlay.className = 'nv-scrim';
  overlay.style.zIndex = '10000000';
  // With an image section the two lists sit side by side (text left, image right), each scrolling on its own.
  const twoCols = Boolean(plan.imageHtml);
  overlay.innerHTML = `
    <div class="nv-modal nv-modal--sections${twoCols ? ' nv-gate--two' : ''}" style="max-width:${twoCols ? '1120px' : '640px'};">
      <div style="padding:1.25rem 1.5rem 0.75rem;">
        <div class="nv-modal__title" style="font-size:1.25rem;font-weight:900;margin-bottom:0;">${twoCols ? '✍️ 글생성 · 🎨 이미지 엔진을 선택하세요' : '✍️ 글생성 엔진을 먼저 선택하세요'}</div>
        <div class="nv-modal__sub" style="margin:0.3rem 0 0;">앱을 켤 때마다 확인합니다. 선택한 엔진으로만 글이 생성되고 과금됩니다.</div>
      </div>
      <div class="nv-gate-cols">
        <div class="nv-gate-col">
          ${twoCols ? '<div class="nv-gate-col__head">✍️ 글생성 엔진</div>' : ''}
          ${startupGateViewSavedLine(plan)}
          <div id="${gateId}-list" class="nv-gate-col__list" style="display:flex;flex-direction:column;gap:0.55rem;">
            ${options.map((option) => startupGateViewOption(option, option.value === plan.checked)).join('')}
          </div>
        </div>
        ${plan.imageHtml}
      </div>
      <div style="padding:0 1.5rem 0.5rem;">
        <div id="${gateId}-connect-log" role="status" aria-live="polite" style="display:none;font-size:0.85rem;line-height:1.45;word-break:keep-all;"></div>
        <div id="${gateId}-connect-mount"></div>
      </div>
      <div class="nv-modal__foot" style="padding:0.9rem 1.5rem 1.25rem;">
        <span id="${gateId}-hint" class="nv-modal__note">${startupGateViewHint(plan)}</span>
        <button id="${gateId}-confirm" type="button" ${plan.ready ? '' : 'disabled'} class="nv-btn nv-btn--primary" style="padding:0.7rem 1.4rem;font-size:0.95rem;">이 엔진으로 시작</button>
      </div>
    </div>`;
  return overlay;
}

export function startupGateViewHighlight(overlay: HTMLElement, value: string): void {
  overlay.querySelectorAll<HTMLElement>('[data-engine-option]').forEach((card) => {
    const active = card.dataset.engineOption === value;
    // The chosen look comes from the theme (checked radio -> lavender card), not from inline colors.
    card.classList.toggle('is-chosen', active);
  });
}
