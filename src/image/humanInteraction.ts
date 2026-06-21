// Human-like interaction primitives for browser automation (anti-BotGuard).
//
// Google BotGuard (Flow / ImageFX / reCAPTCHA) flags automation by behavioral signals:
//   - mouse velocity variance < 10 (humans: 50–500), straight/teleport paths
//   - keystroke interval variance < 5ms (humans: 20–50ms), constant delays
//   - actions performed with ZERO preceding mouse movement = "bot by default"
//   - near-zero timing jitter (Welford variance) = automation
//
// These helpers add curved, jittered, variable-velocity mouse motion and Gaussian-jittered
// keystroke timing so the driven browser produces human-shaped input distributions.
// Pure timing/curve helpers are exported for unit testing without a real browser.

import type { Page, Locator } from 'playwright';

/** Box-Muller Gaussian sample → rounded delay (ms), clamped to >= min. */
export function gaussianDelay(mean: number, std: number, min = 0): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.round(mean + n * std));
}

export function randBetween(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Cubic Bézier scalar. */
export function bezierPoint(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** ease-in-out for accel/decel velocity profile. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

type Pt = { x: number; y: number };

/**
 * Generate a jittered cubic-Bézier path of mouse points from start → end with an
 * ease-in-out velocity profile and per-point micro-jitter. Pure (no browser) for testing.
 */
export function buildMousePath(start: Pt, end: Pt): Pt[] {
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(15, Math.min(80, Math.round(dist / randBetween(8, 18))));
  const c1: Pt = {
    x: start.x + (end.x - start.x) * 0.3 + randBetween(-60, 60),
    y: start.y + (end.y - start.y) * 0.3 + randBetween(-60, 60),
  };
  const c2: Pt = {
    x: start.x + (end.x - start.x) * 0.7 + randBetween(-60, 60),
    y: start.y + (end.y - start.y) * 0.7 + randBetween(-60, 60),
  };
  const path: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = easeInOut(i / steps);
    path.push({
      x: bezierPoint(start.x, c1.x, c2.x, end.x, t) + randBetween(-1.5, 1.5),
      y: bezierPoint(start.y, c1.y, c2.y, end.y, t) + randBetween(-1.5, 1.5),
    });
  }
  path.push({ ...end });
  return path;
}

function lastMouse(page: Page): Pt {
  return (page as any).__hmLast || { x: randBetween(80, 400), y: randBetween(80, 400) };
}

/** Move the mouse to (x,y) along a human path with variable per-step timing (~10–50 events/s). */
export async function humanMouseMoveTo(page: Page, x: number, y: number): Promise<void> {
  const path = buildMousePath(lastMouse(page), { x, y });
  for (const p of path) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(gaussianDelay(13, 6, 3));
  }
  (page as any).__hmLast = { x, y };
}

/** Move to a locator's center via a human path, hover briefly, then press with realistic duration. */
export async function humanClick(page: Page, locator: Locator): Promise<void> {
  let box: { x: number; y: number; width: number; height: number } | null = null;
  try { box = await locator.boundingBox(); } catch { /* fall through */ }
  if (!box) {
    await locator.click();
    return;
  }
  const tx = box.x + box.width * randBetween(0.3, 0.7);
  const ty = box.y + box.height * randBetween(0.35, 0.65);
  await humanMouseMoveTo(page, tx, ty);
  await page.waitForTimeout(gaussianDelay(120, 50, 40)); // hover before click
  await page.mouse.down();
  await page.waitForTimeout(gaussianDelay(60, 25, 20));  // press duration
  await page.mouse.up();
}

/**
 * Type text into a locator with human keystroke rhythm: focus via a human click, then per-char
 * Gaussian delays (variance!), longer pauses after punctuation/space, occasional think-pauses.
 */
export async function humanType(page: Page, locator: Locator, text: string): Promise<void> {
  await humanClick(page, locator);
  await page.waitForTimeout(gaussianDelay(180, 70, 60));
  for (const ch of text) {
    await page.keyboard.type(ch);
    let d = gaussianDelay(52, 28, 12); // base ~12–130ms with real variance
    if (/[.,!?;:。，！？、]/.test(ch)) d += gaussianDelay(170, 80, 50);
    else if (ch === ' ' || ch === '\n') d += gaussianDelay(45, 30, 0);
    if (Math.random() < 0.04) d += gaussianDelay(340, 150, 120); // occasional think pause
    await page.waitForTimeout(d);
  }
}
