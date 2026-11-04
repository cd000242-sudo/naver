// src/automation/aiImageMark.ts
// [2026-11-04] NAVER editor "AI 활용" image mark: find the toolbar button, confirm the click turned it on, summarize.
// Customer report: the option was on but posts went out unmarked. The publish step looked once after a fixed 400 ms,
// skipped silently when the toolbar was late, never re-read the state after clicking and always logged "완료".
// Clicking the image / the button stays in naverBlogAutomation (coordinate clicks); this module only finds and checks.
// Based on the unmerged c19c39545 (2026-10-20) module, without its element-click change (never verified live).
import type { ElementHandle, Frame } from 'puppeteer';

export const AI_MARK_BUTTON_SELECTOR = 'button.se-set-ai-mark-button-toggle';
export type AiImageMarkResult = 'enabled' | 'already-enabled' | 'button-missing' | 'unconfirmed';
export interface AiMarkButtonState { readonly visible: boolean; readonly active: boolean }
export interface AiMarkControl { readonly button: ElementHandle<Element>; readonly state: AiMarkButtonState }
type Delay = (ms: number) => Promise<void>;
/** An image component handle or the editor frame — both answer `$$`. */
type Scope = { $$(selector: string): Promise<ElementHandle<Element>[]> } | ElementHandle<Element> | Frame;
const queryAll = (scope: Scope, selector: string): Promise<ElementHandle<Element>[]> =>
  (scope as { $$(selector: string): Promise<ElementHandle<Element>[]> }).$$(selector);

/** Runs in the editor frame. Hidden or disabled duplicate toolbar buttons are not actionable. */
export function readAiMarkButtonState(button: Element): AiMarkButtonState {
  const rect = button.getBoundingClientRect();
  const style = window.getComputedStyle(button);
  return {
    visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      && !(button as HTMLButtonElement).disabled,
    active: button.classList.contains('se-is-selected') || button.getAttribute('aria-pressed') === 'true'
      || button.getAttribute('aria-checked') === 'true',
  };
}

/** The first visible AI mark button: the image component's own toolbar first, then the frame's. */
export async function findVisibleAiMarkButton(component: Scope, frame: Scope): Promise<AiMarkControl | null> {
  for (const scope of [component, frame]) {
    const buttons = await queryAll(scope, AI_MARK_BUTTON_SELECTOR).catch(() => [] as ElementHandle<Element>[]);
    for (const button of buttons) {
      const state = await button.evaluate(readAiMarkButtonState).catch(() => null);
      if (state?.visible) return { button, state };
    }
  }
  return null;
}

/** Poll for the toolbar after the image was clicked (default up to 8 × 250 ms = 2 s). */
export async function waitForAiMarkButton(
  component: Scope, frame: Scope, delay: Delay, attempts = 8, intervalMs = 250,
): Promise<AiMarkControl | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await delay(intervalMs);
    const control = await findVisibleAiMarkButton(component, frame);
    if (control) return control;
  }
  return null;
}

/** Re-read fresh handles after the click (the toolbar may re-render) until the mark reads as on. */
export async function confirmAiMarkActive(
  component: Scope, frame: Scope, delay: Delay, attempts = 5, intervalMs = 200,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await delay(intervalMs);
    const control = await findVisibleAiMarkButton(component, frame);
    if (control?.state.active) return true;
  }
  return false;
}

/** One honest summary line: "완료" only when every target ended on. */
export function summarizeAiMarkResults(results: readonly AiImageMarkResult[]): string {
  if (results.length === 0) return 'ℹ️ [AI 마크] 표시할 AI 이미지가 없습니다';
  const count = (kind: AiImageMarkResult) => results.filter((r) => r === kind).length;
  const missing = count('button-missing');
  const unconfirmed = count('unconfirmed');
  const head = `켬 ${count('enabled')} · 이미 켜짐 ${count('already-enabled')}`;
  if (missing === 0 && unconfirmed === 0) return `✅ [AI 마크] AI 활용 표시 완료 — ${head}`;
  return `⚠️ [AI 마크] AI 활용 표시 일부 실패 — ${head} · 버튼 못 찾음 ${missing} · 켜짐 미확인 ${unconfirmed} (발행 후 해당 이미지의 AI 활용 표시를 확인해 주세요)`;
}
