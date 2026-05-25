/**
 * humanBehavior.ts — P5 SPEC-NAVER-PROTECTION-2026
 *
 * Bot detection countermeasures for idle-state user behavior signatures.
 *
 * Background:
 * Naver's bot detection inspects the input event timeline immediately after login.
 * A typical bot pattern: mouse pointer stays static (0 movement) between login
 * completion and the next navigation. Real users produce 1~3 micro-movements
 * within the first 2 seconds due to involuntary hand motion, tab switching,
 * or scroll wheel touches.
 *
 * This module emits short, variable mouse movements that mimic that idle pattern.
 * All movement counts, distances, and steps are randomized to avoid forming a
 * detectable bot signature.
 *
 * Usage:
 *   import { performIdleMouseShake } from './automation/humanBehavior';
 *   await performIdleMouseShake(page).catch(() => {});  // fire-and-forget
 */

import type { Page } from 'puppeteer';

/**
 * Random integer in [min, max] inclusive.
 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Idle mouse shake — 1~3 micro-movements with variable steps and dwell.
 *
 * Total duration: typically 200~900ms (negligible impact on publishing time).
 * Safe to call concurrently with other page operations (read-only mouse events).
 *
 * Failure mode: silently absorbs all exceptions via inner try/catch on each
 * move call. Caller should also wrap in .catch() for outer safety.
 */
export async function performIdleMouseShake(page: Page): Promise<void> {
  const viewport = page.viewport();
  if (!viewport) return;

  const { width, height } = viewport;
  // Constrain to inner safe area (avoid hitting menu bar / scrollbar)
  const xMin = Math.floor(width * 0.25);
  const xMax = Math.floor(width * 0.75);
  const yMin = Math.floor(height * 0.25);
  const yMax = Math.floor(height * 0.75);

  const moveCount = randInt(1, 3);

  for (let i = 0; i < moveCount; i++) {
    const x = randInt(xMin, xMax);
    const y = randInt(yMin, yMax);
    const steps = randInt(8, 18);
    try {
      await page.mouse.move(x, y, { steps: steps });
    } catch {
      // mouse.move may fail if page navigated away — ignore
      return;
    }
    // Inter-move dwell: 80~250ms (matches micro-pause between glances)
    const dwellMs = randInt(80, 250);
    await new Promise((resolve) => setTimeout(resolve, dwellMs));
  }
}
