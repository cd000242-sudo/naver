// src/renderer/modules/retiredImageEngineGate.ts
// [2026-11-03] One-time blocking dialog for a saved image engine that no longer exists
// (Leonardo AI / DeepInfra / Prodia).
//
// Why a dialog and not a quiet default: when the stored value is missing, every reader falls back to
// a paid engine (덕트테이프). The retired value is parked by markRetiredImageEngines() and only the
// user's explicit pick here is saved. Until then assertNoRetiredImageEnginePending() blocks generation.

import {
  markRetiredImageEngines,
  pendingRetiredImageEngineLabels,
  resolveRetiredImageEngineChoice,
  retiredImageEngineChoices,
} from '../../runtime/retiredImageEngines.js';

export const RETIRED_ENGINE_GATE_ID = 'retired-image-engine-gate';

export interface RetiredEngineGateOption {
  readonly value: string;
  readonly title: string;
  readonly price: string;
}

function retiredEngineGateEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reads the remaining engines from the image engine dropdown so the list has one source of truth. */
export function collectRetiredEngineGateOptions(root: ParentNode = document): RetiredEngineGateOption[] {
  const choices = new Set(retiredImageEngineChoices());
  const options = Array.from(root.querySelectorAll<HTMLOptionElement>('#image-source-select option'));
  return options
    .filter((option) => choices.has(option.value))
    .map((option) => Object.freeze({
      value: option.value,
      title: (option.textContent || option.value).trim(),
      price: option.dataset.price || '',
    }));
}

function retiredEngineGateCard(option: RetiredEngineGateOption): string {
  const price = option.price
    ? `<div class="nv-modal__note" style="margin-top:0.2rem;">${retiredEngineGateEscape(option.price)}</div>`
    : '';
  return `
    <label data-engine-option="${retiredEngineGateEscape(option.value)}" style="display:flex;gap:0.75rem;align-items:flex-start;padding:0.75rem 0.9rem;cursor:pointer;">
      <input type="radio" name="retired-engine-choice" value="${retiredEngineGateEscape(option.value)}" style="margin-top:3px;width:18px;height:18px;cursor:pointer;">
      <div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:0.95rem;">${retiredEngineGateEscape(option.title)}</div>${price}</div>
    </label>`;
}

function retiredEngineGateRender(options: readonly RetiredEngineGateOption[], labels: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = RETIRED_ENGINE_GATE_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  // Colors come from the theme classes (theme-naver-components.css section 2); only the stacking order stays inline.
  overlay.className = 'nv-scrim';
  overlay.style.zIndex = '10000001';
  overlay.innerHTML = `
    <div class="nv-modal nv-modal--sections" style="max-width:560px;">
      <div style="padding:1.25rem 1.5rem 0.5rem;">
        <div class="nv-modal__title" style="font-size:1.2rem;font-weight:900;margin-bottom:0;">🎨 이미지 엔진을 다시 골라 주세요</div>
        <div class="nv-modal__text" style="margin:0.4rem 0 0;">선택하셨던 <b>${retiredEngineGateEscape(labels)}</b> 이미지 엔진은 지원이 끝났습니다. 앱이 대신 다른 유료 엔진을 고르지 않으니, 사용할 엔진을 직접 골라 주세요. 고르기 전에는 이미지 생성이 시작되지 않습니다.</div>
        <div class="nv-modal__note" style="margin-top:0.4rem;">Flow · 리더스 나노바나나 · 젠스파크는 이미지 탭에서 로그인이 필요합니다.</div>
      </div>
      <div style="padding:0.5rem 1.5rem;display:flex;flex-direction:column;gap:0.5rem;overflow-y:auto;">${options.map(retiredEngineGateCard).join('')}</div>
      <div class="nv-modal__foot" style="padding:0.9rem 1.5rem 1.25rem;">
        <span id="${RETIRED_ENGINE_GATE_ID}-hint" class="nv-modal__note">엔진을 하나 고르면 확인 버튼이 켜집니다.</span>
        <button id="${RETIRED_ENGINE_GATE_ID}-confirm" type="button" disabled class="nv-btn nv-btn--primary" style="padding:0.7rem 1.4rem;font-size:0.95rem;">이 엔진으로 저장</button>
      </div>
    </div>`;
  return overlay;
}

/** Saves the pick and mirrors it into the dropdown/buttons through the shared setter. */
function retiredEngineGateApply(choice: string): boolean {
  if (!resolveRetiredImageEngineChoice(choice)) return false;
  try { (window as any).setGlobalImageSource?.(choice); } catch (error) {
    console.warn('[RetiredEngineGate] 화면 동기화 실패(저장은 완료):', error);
  }
  return true;
}

/** Resolves with the chosen engine. The overlay has no close or skip path. */
export function showRetiredImageEngineGate(labels: string): Promise<string | null> {
  const options = collectRetiredEngineGateOptions();
  if (options.length === 0) {
    console.warn('[RetiredEngineGate] 이미지 엔진 목록이 없어 안내를 건너뜁니다.');
    return Promise.resolve(null);
  }
  document.getElementById(RETIRED_ENGINE_GATE_ID)?.remove();
  const overlay = retiredEngineGateRender(options, labels);
  document.body.appendChild(overlay);
  const confirmBtn = overlay.querySelector<HTMLButtonElement>(`#${RETIRED_ENGINE_GATE_ID}-confirm`) as HTMLButtonElement;
  const hint = overlay.querySelector<HTMLElement>(`#${RETIRED_ENGINE_GATE_ID}-hint`) as HTMLElement;
  return new Promise((resolve) => {
    overlay.addEventListener('change', () => {
      const picked = overlay.querySelector<HTMLInputElement>('input[name="retired-engine-choice"]:checked');
      overlay.querySelectorAll<HTMLElement>('[data-engine-option]').forEach((card) => {
        // The chosen look comes from the theme (checked radio -> lavender card), not from inline colors.
        card.classList.toggle('is-chosen', card.dataset.engineOption === picked?.value);
      });
      confirmBtn.disabled = !picked;
      hint.textContent = '';
    });
    confirmBtn.addEventListener('click', () => {
      const picked = overlay.querySelector<HTMLInputElement>('input[name="retired-engine-choice"]:checked');
      if (!picked) return;
      if (!retiredEngineGateApply(picked.value)) {
        hint.textContent = '저장하지 못했습니다. 다시 시도해 주세요.';
        return;
      }
      overlay.remove();
      resolve(picked.value);
    });
  });
}

/**
 * Startup entry. Parks any retired value first, then asks once. Skipped under Playwright
 * (E2E_TEST=1) where a blocking overlay would swallow every click — generation stays blocked there too.
 */
export async function initRetiredImageEngineGate(): Promise<string | null> {
  const pending = markRetiredImageEngines();
  if (!pending) return null;
  try {
    const info = await (window as any).api?.getAppInfo?.();
    if (info?.e2eTest) return null;
  } catch { /* treat as a normal launch */ }
  return showRetiredImageEngineGate(pendingRetiredImageEngineLabels(pending).join(', '));
}
