/**
 * defamationHandlers.ts — SPEC-DEFAMATION-2026 P1 (C) publish-boundary risk gate IPC.
 *
 * Right before a publish starts, the renderer asks whether the payload contains a
 * risky celebrity assertion (crime/private-life fact stated as certain). The detection
 * logic lives in the main process only (celebrityAssertionSanitizer), so it is exposed
 * over IPC; the renderer shows a one-time confirm modal (NOT a hard block — live-publish
 * trust). This covers the finalize blind spot: saved reposts, semi-auto paste, manual input.
 */
import { ipcMain } from 'electron';
import { evaluateCelebrityPublishRisk } from '../../content/celebrityAssertionSanitizer.js';

export function registerDefamationHandlers(): void {
  ipcMain.handle('defamation:checkPublishRisk', async (_e, payload) => {
    try {
      return evaluateCelebrityPublishRisk(payload);
    } catch (e) {
      // A gate failure must never block publishing — fall back to not-risky and log.
      console.warn('[Defamation] publish risk gate evaluation failed:', (e as Error)?.message);
      return { risky: false, samples: [], source: 'none' };
    }
  });
}
