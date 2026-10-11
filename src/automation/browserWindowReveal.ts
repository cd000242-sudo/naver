// src/automation/browserWindowReveal.ts
// [2026-10-11] Bring the typing Chrome window back to the front at the start of every publish and from the
//   "타이핑 보러가기" button. After a publish the window is hidden (Win32 SW_HIDE) or, when that fails, parked at
//   -32000 and minimized. A CDP minimized -> restored toggle shows a SW_HIDE window again (checked on Windows),
//   but restoring a parked window keeps it off screen, so its position is fixed first.

const OFFSCREEN_LIMIT = -10_000;

export interface WindowBounds { left?: number; top?: number; width?: number; height?: number; windowState?: string }

/** Minimal CDP surface used here, so the sequence can be tested without a browser. */
export interface WindowCdp {
  send(method: 'Browser.getWindowForTarget'): Promise<{ windowId: number; bounds?: WindowBounds }>;
  send(method: 'Browser.setWindowBounds', params: { windowId: number; bounds: WindowBounds }): Promise<unknown>;
}

export function isOffscreenBounds(bounds: { left?: number; top?: number }): boolean {
  return (typeof bounds.left === 'number' && bounds.left < OFFSCREEN_LIMIT)
    || (typeof bounds.top === 'number' && bounds.top < OFFSCREEN_LIMIT);
}

/** The window opens maximized, so a minimized or parked window goes back to maximized; a user-sized window stays. */
export function revealWindowState(current: string | undefined, offscreen: boolean): 'maximized' | 'normal' | 'fullscreen' {
  if (offscreen) return 'maximized';
  if (current === 'normal' || current === 'fullscreen') return current;
  return 'maximized';
}

/** Shows the window, moves a parked window back on screen and raises it. Returns the state it was restored to. */
export async function revealBrowserWindow(cdp: WindowCdp): Promise<'maximized' | 'normal' | 'fullscreen'> {
  const { windowId, bounds = {} } = await cdp.send('Browser.getWindowForTarget');
  const offscreen = isOffscreenBounds(bounds);
  const target = revealWindowState(bounds.windowState, offscreen);
  if (offscreen) {
    // Bounds can only change in the normal state.
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0 } });
  }
  // Minimizing first makes the restore raise the window instead of leaving it behind the app.
  // A parked window was just switched to normal above, so it is no longer minimized.
  const minimized = !offscreen && bounds.windowState === 'minimized';
  if (!minimized) await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
  // Chrome refuses minimized -> maximized/fullscreen directly ("restore it to normal state first").
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  if (target !== 'normal') await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: target } });
  return target;
}
