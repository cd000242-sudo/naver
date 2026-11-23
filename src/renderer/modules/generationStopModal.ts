// src/renderer/modules/generationStopModal.ts
// The blocking window shown when a run stops while it writes the article or makes the images.
// It only asks; the owner's answer comes back as a GstopDecision. Nothing here switches an engine by itself.
// Short texts on purpose (senior user). Renderer bundle note: one shared scope, so every top-level name carries
// the generationStopModal prefix.

import { gstopEngineLabel, gstopFormatResetClock, gstopSummaryLine } from '../../generationStop/stopClassifier.js';
import type { GstopDecision, GstopInfo } from '../../generationStop/stopClassifier.js';

export const GENERATION_STOP_MODAL_ID = 'generation-stop-modal';

export interface GenerationStopModalEngine { readonly value: string; readonly label: string }

export interface GenerationStopModalRequest {
  readonly info: GstopInfo;
  /** Engines of the stopped stage (text list for a writing stop, image list for an image stop), failed one excluded. */
  readonly engines: readonly GenerationStopModalEngine[];
  /** Where the run goes on from, e.g. "3번째 글 · 이미지 4/6". Optional. */
  readonly progressLine?: string;
}

function generationStopModalNode<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string, css = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (css) node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function generationStopModalButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const button = generationStopModalNode('button', primary ? 'nv-btn nv-btn--primary' : 'nv-btn', label, 'padding:0.75rem 1.1rem;font-size:1rem;width:100%;');
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

/** One line under "같은 모델로 이어서": the reset moment when the limit message named one. */
export function generationStopModalSameNote(info: Pick<GstopInfo, 'cause' | 'resetAt'>, now: number = Date.now()): string {
  if (info.cause !== 'limit') return '';
  if (info.resetAt === undefined) return '한도가 풀린 뒤에 눌러 주세요.';
  return info.resetAt > now ? `초기화 ${gstopFormatResetClock(info.resetAt)} — 그때 이후에 눌러 주세요.` : '초기화 시각이 지났어요. 지금 이어 갈 수 있어요.';
}

function generationStopModalPicker(request: GenerationStopModalRequest, finish: (decision: GstopDecision) => void): HTMLElement {
  const box = generationStopModalNode('div', '', undefined, 'display:none;flex-direction:column;gap:0.5rem;margin-top:0.25rem;');
  const group = `${GENERATION_STOP_MODAL_ID}-engine`;
  request.engines.forEach((engine, index) => {
    const row = generationStopModalNode('label', '', undefined, 'display:flex;gap:0.5rem;align-items:center;font-size:1rem;cursor:pointer;');
    const radio = generationStopModalNode('input');
    radio.type = 'radio'; radio.name = group; radio.value = engine.value; radio.checked = index === 0;
    row.append(radio, generationStopModalNode('span', '', engine.label));
    box.appendChild(row);
  });
  const saveRow = generationStopModalNode('label', '', undefined, 'display:flex;gap:0.5rem;align-items:center;font-size:0.9rem;margin-top:0.25rem;');
  const save = generationStopModalNode('input');
  save.type = 'checkbox'; save.checked = false; save.setAttribute('data-gstop-persist', '1');
  saveRow.append(save, generationStopModalNode('span', '', '설정에도 저장 (끄면 이번만)'));
  box.appendChild(saveRow);
  box.appendChild(generationStopModalButton('이 엔진으로 이어서', true, () => {
    const picked = box.querySelector<HTMLInputElement>(`input[name="${group}"]:checked`)?.value;
    if (picked) finish({ kind: 'switch', engine: picked, persist: save.checked });
  }));
  return box;
}

/** Shows the window and resolves with the owner's choice. There is no close button and no timeout: a stop waits for an answer. */
export function generationStopModalAsk(request: GenerationStopModalRequest): Promise<GstopDecision> {
  document.getElementById(GENERATION_STOP_MODAL_ID)?.remove();
  return new Promise<GstopDecision>((resolve) => {
    const overlay = generationStopModalNode('div', 'nv-scrim', undefined, 'z-index:10000002;');
    overlay.id = GENERATION_STOP_MODAL_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const panel = generationStopModalNode('div', 'nv-modal nv-modal--warn', undefined, 'max-width:480px;padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:0.6rem;');
    const finish = (decision: GstopDecision): void => { overlay.remove(); resolve(decision); };

    panel.appendChild(generationStopModalNode('div', 'nv-modal__title', gstopSummaryLine(request.info), 'font-size:1.15rem;font-weight:900;'));
    if (request.progressLine) panel.appendChild(generationStopModalNode('div', 'nv-modal__sub', request.progressLine));
    panel.appendChild(generationStopModalNode('div', 'nv-modal__note', '만든 글과 이미지는 그대로 있어요.', 'font-size:0.9rem;'));

    panel.appendChild(generationStopModalButton(`같은 모델로 이어서 (${gstopEngineLabel(request.info.engine)})`, true, () => finish({ kind: 'same' })));
    const sameNote = generationStopModalSameNote(request.info);
    if (sameNote) panel.appendChild(generationStopModalNode('div', 'nv-modal__note', sameNote, 'font-size:0.85rem;'));

    if (request.engines.length > 0) {
      const picker = generationStopModalPicker(request, finish);
      panel.appendChild(generationStopModalButton('다른 모델로 바꿔서 이어서', false, () => {
        picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
      }));
      panel.appendChild(picker);
    }
    panel.appendChild(generationStopModalButton('여기서 멈추기', false, () => finish({ kind: 'halt' })));
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  });
}
