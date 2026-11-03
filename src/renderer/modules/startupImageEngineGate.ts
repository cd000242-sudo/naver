// src/renderer/modules/startupImageEngineGate.ts
// [2026-11-03] Image engine section of the startup engine gate.
//
// Owner decisions: (1) the choices are read from the image tab's #image-source-select (single source of truth, like
// the text engines read the settings radios); (2) the FIRST time the window is shown, '관련 사진 찾기' is pre-selected,
// afterwards the engine that is currently saved (= the last one confirmed here or in the image tab); (3) confirming
// goes through the image tab's own change handler so both screens share ONE save path (globalImageSource,
// fullAutoImageSource, shopping sync, login rows); (4) '관련 사진 찾기' needs the copyright agreement and a refusal
// keeps the window open so another engine can be picked.
// NOTE: inline bundle = single scope. Every top-level identifier is prefixed startupImage* / STARTUP_IMAGE_*.

import {
  markRetiredImageEngines,
  readRetiredImageEnginePending,
  resolveRetiredImageEngineChoice,
  retiredImageEngineChoices,
} from '../../runtime/retiredImageEngines.js';
import {
  COLLECT_ENGINE_VALUE,
  collectEngineAllowPick,
  collectEngineDispatchApprovedChange,
} from './imageCollectEngineConsent.js';

export const STARTUP_IMAGE_CHOICE_NAME = 'startup-image-engine-choice';
/** localStorage flag: set once the user confirmed this window (the pre-selected collect-photos applies only before). */
export const STARTUP_IMAGE_FIRST_SHOWN_KEY = 'startupImageEngineDefaultShownV1';
const STARTUP_IMAGE_SELECT_ID = 'image-source-select';
const STARTUP_IMAGE_SECTION_ID = 'startup-engine-gate-image';

export interface StartupImageOption {
  readonly value: string;
  readonly title: string;
  readonly price: string;
}

export interface StartupImagePlan {
  readonly options: readonly StartupImageOption[];
  readonly checked: string; // '' = nothing pre-selected
}

type StartupImageStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function startupImageStore(): StartupImageStore | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function startupImageEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Reads the engines from the image tab dropdown. Empty when the image tab is absent. */
export function startupImageCollectOptions(root: ParentNode = document): StartupImageOption[] {
  return Array.from(root.querySelectorAll<HTMLOptionElement>(`#${STARTUP_IMAGE_SELECT_ID} option`))
    .filter((option) => option.value.trim().length > 0 && !option.disabled)
    .map((option) => Object.freeze({
      value: option.value,
      title: (option.textContent || option.value).trim(),
      price: (option.dataset.price || '').trim(),
    }));
}

/**
 * Decides which engines are offered and which one is pre-selected. A retired engine value that is still in storage
 * is parked first (idempotent, same call the app makes at startup), so the order of the two startup steps does not matter.
 * - While a retired-engine marker is pending, only engines the retired dialog can resolve are offered
 *   (collect-photos is not one of them), so a pick here clears the marker and that dialog never shows twice.
 * - First show: collect-photos. Later: the saved engine if it is still offered, otherwise nothing (no silent default).
 */
export function startupImageBuildPlan(options: readonly StartupImageOption[], store = startupImageStore()): StartupImagePlan {
  const pending = store ? markRetiredImageEngines(store) : null;
  const resolvable = new Set(retiredImageEngineChoices());
  const offered = pending ? options.filter((option) => resolvable.has(option.value)) : options;
  const has = (value: string | null | undefined): value is string => !!value && offered.some((option) => option.value === value);
  const first = !store || store.getItem(STARTUP_IMAGE_FIRST_SHOWN_KEY) !== '1';
  if (first && has(COLLECT_ENGINE_VALUE)) return { options: offered, checked: COLLECT_ENGINE_VALUE };
  const saved = [store?.getItem('globalImageSource'), store?.getItem('fullAutoImageSource')].find(has);
  return { options: offered, checked: saved || '' };
}

function startupImageCard(option: StartupImageOption, checked: boolean): string {
  const price = option.price
    ? `<div style="font-size:0.78rem;color:#4b5563;margin-top:0.15rem;line-height:1.35;">${startupImageEscape(option.price)}</div>`
    : '';
  return `
    <label data-image-engine-option="${startupImageEscape(option.value)}" style="display:flex;gap:0.7rem;align-items:flex-start;border:2px solid ${checked ? '#4f46e5' : '#e5e7eb'};border-radius:10px;padding:0.55rem 0.8rem;cursor:pointer;background:${checked ? '#eef2ff' : '#fff'};">
      <input type="radio" name="${STARTUP_IMAGE_CHOICE_NAME}" value="${startupImageEscape(option.value)}" ${checked ? 'checked' : ''} style="margin-top:3px;width:17px;height:17px;accent-color:#4f46e5;cursor:pointer;">
      <div style="flex:1;min-width:0;"><div style="font-weight:800;color:#111827;font-size:0.92rem;">${startupImageEscape(option.title)}</div>${price}</div>
    </label>`;
}

/** Section markup for the gate ('' when the image tab offers no engines). */
export function startupImageGateHtml(plan: StartupImagePlan): string {
  if (plan.options.length === 0) return '';
  return `
      <div id="${STARTUP_IMAGE_SECTION_ID}" style="padding:0.5rem 1.5rem 0.5rem;flex:0 1 auto;overflow-y:auto;max-height:36vh;">
        <div style="font-size:1.05rem;font-weight:900;color:#111827;">🎨 이미지 엔진도 선택하세요</div>
        <div style="font-size:0.82rem;color:#6b7280;margin:0.2rem 0 0.6rem;">이미지 탭의 생성 엔진과 같은 설정입니다. Flow · 리더스 나노바나나 · 젠스파크는 이미지 탭에서 로그인이 필요합니다.</div>
        <div style="display:flex;flex-direction:column;gap:0.45rem;">${plan.options.map((option) => startupImageCard(option, option.value === plan.checked)).join('')}</div>
      </div>`;
}

/** Value of the checked image engine radio ('' when none or the section is absent). */
export function startupImageGateChoice(overlay: ParentNode): string {
  return overlay.querySelector<HTMLInputElement>(`input[name="${STARTUP_IMAGE_CHOICE_NAME}"]:checked`)?.value || '';
}

/** True when the section exists but no engine is chosen yet (the gate must not confirm). */
export function startupImageGatePending(overlay: ParentNode): boolean {
  return !!overlay.querySelector(`#${STARTUP_IMAGE_SECTION_ID}`) && !startupImageGateChoice(overlay);
}

/** Highlights the chosen card and tells the gate something changed. */
export function startupImageGateBind(overlay: HTMLElement, onChange: () => void): void {
  overlay.addEventListener('change', (event) => {
    if ((event.target as HTMLInputElement | null)?.name !== STARTUP_IMAGE_CHOICE_NAME) return;
    const value = startupImageGateChoice(overlay);
    overlay.querySelectorAll<HTMLElement>('[data-image-engine-option]').forEach((card) => {
      const active = card.dataset.imageEngineOption === value;
      card.style.borderColor = active ? '#4f46e5' : '#e5e7eb';
      card.style.background = active ? '#eef2ff' : '#fff';
    });
    onChange();
  });
}

/** Mirrors the pick into the image tab's save path. True when the image tab ended up holding the engine. */
function startupImagePersist(select: HTMLSelectElement, value: string, store: StartupImageStore): boolean {
  select.value = value;
  collectEngineDispatchApprovedChange(select);
  if (store.getItem('globalImageSource') === value) return true;
  // The image tab handler is not wired yet (very early confirm): use the shared setter, then re-check.
  try { (window as any).setGlobalImageSource?.(value); } catch (error) {
    console.warn('[StartupImageGate] 공용 저장 함수 실패:', error);
  }
  return store.getItem('globalImageSource') === value;
}

/**
 * Applies the chosen image engine. Returns '' on success (also when the section is absent) or a Korean message
 * for the gate hint when nothing was saved; the window stays open in that case.
 */
export async function startupImageGateCommit(overlay: ParentNode): Promise<string> {
  const value = startupImageGateChoice(overlay);
  if (!value) return '';
  const store = startupImageStore();
  const select = document.getElementById(STARTUP_IMAGE_SELECT_ID) as HTMLSelectElement | null;
  if (!store || !select) return '이미지 엔진 목록을 찾지 못했습니다. 이미지 탭에서 직접 골라 주세요.';
  if (!(await collectEngineAllowPick(value))) {
    return '관련 사진 찾기는 저작권 안내에 동의해야 쓸 수 있습니다. 동의하지 않으려면 다른 이미지 엔진을 골라 주세요.';
  }
  // Same order as the retired-engine dialog: clear the parked marker (fills the parked keys), then the tab path.
  if (readRetiredImageEnginePending(store)) resolveRetiredImageEngineChoice(value, store);
  if (!startupImagePersist(select, value, store)) {
    return '이미지 엔진을 저장하지 못했습니다. 다시 시도해 주세요.';
  }
  store.setItem(STARTUP_IMAGE_FIRST_SHOWN_KEY, '1');
  console.log(`[StartupImageGate] 이미지 엔진 확정: ${value}`);
  return '';
}
