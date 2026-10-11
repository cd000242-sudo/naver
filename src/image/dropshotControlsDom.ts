// src/image/dropshotControlsDom.ts
// Browser-context helpers for the Dropshot image board. Each function runs inside page.evaluate(fn), so it must stay
// self-contained: no imports, no module-scope references, only `document`.
// [2026-10-11 live DOM] The image count is a stepper now ("— 2장 +" with buttons labelled "생성 개수 줄이기/늘리기");
//   input[type=number] is gone, so the old count setter silently left 2 images per request. Turning the unlimited
//   switch on without a Pro/Team plan opens a subscription dialog ("Pro · Team 구독하면 이미지 생성 무제한").

export interface DropshotCountStep { count: number | null; clicked: boolean }

/** Reads the stepper count ("N장") and clicks "줄이기" once when it is above 1. */
export function stepDropshotCountDown(): DropshotCountStep {
  const compact = (value: string | null | undefined): string => String(value || '').replace(/\s+/g, ' ').trim();
  const label = (el: Element): string => compact(`${(el as HTMLElement).innerText || el.textContent || ''} ${el.getAttribute('aria-label') || ''}`);
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const decrement = buttons.find((button) => /생성\s*개수\s*줄이기/.test(label(button)) && button.getBoundingClientRect().width > 0);
  if (!decrement) return { count: null, clicked: false };
  const match = compact(decrement.parentElement?.textContent || '').match(/(\d+)\s*장/);
  const count = match ? Number(match[1]) : null;
  if (count === null || count <= 1 || decrement.disabled) return { count, clicked: false };
  decrement.click();
  return { count, clicked: true };
}

/** Text of the subscription dialog Dropshot shows when unlimited mode needs a Pro/Team plan; null when absent. */
export function detectDropshotSubscriptionPrompt(): string | null {
  const compact = (value: string | null | undefined): string => String(value || '').replace(/\s+/g, ' ').trim();
  const candidates = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) as HTMLElement[];
  const scope = candidates.length ? candidates : [document.body];
  for (const el of scope) {
    const text = compact(el?.innerText || el?.textContent || '');
    if (/구독/.test(text) && /무제한/.test(text) && (/구독하면/.test(text) || /무제한 혜택 보기/.test(text) || /플랜 업그레이드/.test(text))) {
      return text.slice(0, 160);
    }
  }
  return null;
}
