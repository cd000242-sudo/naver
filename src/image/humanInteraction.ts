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

/*
 * [2026-09-15 사장님 실측] "이미지 생성이 엄청 느리다."
 *
 * 구간별로 재보니 1장 180초 중 Flow 가 그림을 그리는 건 42~58초뿐이고, 나머지를 여기서 쓴다.
 *   humanWarmup      81,395ms · 두 번째 사이클은 154,777ms
 *   humanClick(전송) 80,824ms
 *   셀렉터·입력·검증  합쳐서 7초 (정상)
 *
 * 원인은 화면 밖 창이다. Flow 창은 봇 감지를 피하려고 headless 대신 headful 로 띄우고
 * --window-position=-32000,-32000 으로 밀어낸다. 그 창에 mouse.move 를 한 점씩 보내면
 * 호출 하나하나가 정상 속도로 처리되지 않아, 코드상 2~3초짜리 워밍업이 1~2분이 된다.
 *
 * 화면 밖 창에서 마우스 궤적은 사람 행동을 흉내 내는 값이 거의 없고 비용만 낸다.
 * 그래서 화면 밖일 때는 궤적을 건너뛰고 바로 누른다. headful·실제 Chrome·실 UA 라는
 * 나머지 봇 회피 장치는 그대로 유지된다.
 *
 * 되돌릴 수 있게 플래그로 둔다 — 차단이 늘면 setHumanMotionEnabled(true) 로 복구한다.
 */
let _motionEnabled = true;

/** 화면 밖(off-screen) 창이면 false 로 둔다. 기본값은 예전 동작(궤적 사용). */
export function setHumanMotionEnabled(enabled: boolean): void {
  _motionEnabled = enabled;
}

export function isHumanMotionEnabled(): boolean {
  return _motionEnabled;
}

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
  if (!_motionEnabled) {
    // 화면 밖 창 — 궤적 없이 한 번에 옮긴다. 마지막 좌표는 그대로 기록한다.
    await page.mouse.move(x, y);
    (page as any).__hmLast = { x, y };
    return;
  }
  const path = buildMousePath(lastMouse(page), { x, y });
  for (const p of path) {
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(gaussianDelay(13, 6, 3));
  }
  (page as any).__hmLast = { x, y };
}

/** Move to a locator's center via a human path, hover briefly, then press with realistic duration. */
export async function humanClick(page: Page, locator: Locator): Promise<void> {
  if (!_motionEnabled) {
    // 화면 밖 창 — 궤적·호버 없이 바로 누른다. 여기서 80초가 샜다.
    await locator.click();
    return;
  }
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

/** Random in-viewport points for a pre-action mouse warmup (builds behavioral history). Pure. */
export function buildWarmupTargets(vw: number, vh: number, count?: number): Pt[] {
  const n = count ?? Math.round(randBetween(2, 4));
  return Array.from({ length: n }, () => ({
    x: Math.round(randBetween(vw * 0.1, vw * 0.9)),
    y: Math.round(randBetween(vh * 0.1, vh * 0.9)),
  }));
}

/** Wheel-scroll with human-like chunking + variable timing. */
export async function humanScroll(page: Page, deltaY: number): Promise<void> {
  const steps = Math.round(randBetween(3, 6));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, Math.round(deltaY / steps + randBetween(-15, 15)));
    await page.waitForTimeout(gaussianDelay(90, 40, 30));
  }
}

/**
 * Pre-action warmup: a few human mouse moves to random points + occasional scroll + idle.
 * BotGuard flags "meaningful action with ZERO preceding mouse movement" — this seeds the session
 * with human-shaped activity before the prompt/generate action. Best-effort (never throws).
 */
export async function humanWarmup(
  page: Page,
  viewport: { width: number; height: number } = { width: 1280, height: 800 },
): Promise<void> {
  // 화면 밖 창에는 볼 사람도, 흉내 낼 커서도 없다. 81~155초를 여기서 돌려받는다.
  if (!_motionEnabled) return;
  try {
    for (const t of buildWarmupTargets(viewport.width, viewport.height)) {
      await humanMouseMoveTo(page, t.x, t.y);
      await page.waitForTimeout(gaussianDelay(220, 120, 80));
    }
    if (Math.random() < 0.6) await humanScroll(page, randBetween(120, 400));
    await page.waitForTimeout(gaussianDelay(300, 150, 120));
  } catch {
    /* warmup is best-effort — never block generation on it */
  }
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
