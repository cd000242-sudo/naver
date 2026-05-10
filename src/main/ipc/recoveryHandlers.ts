/**
 * SPEC-IMAGE-RECOVERY-001: main-process IPC handlers for the recovery layer.
 *
 * - Receives `recovery:user-choice` from the renderer after a blocking modal
 *   is dismissed and routes the choice into `RecoveryCoordinator`'s metrics.
 * - Optional: forwards "open settings"/"schedule retry" intents to the
 *   appropriate window manager / scheduler.
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getRecoveryCoordinator, getRecoveryMetrics } from '../../image/recovery';
import type { BlockingModalCode } from '../../image/recovery';

/**
 * SPEC M-4: flush whatever progress data is in memory before a modal opens.
 * The marathon flow already persists progress.json continuously, so we only
 * write a side-channel "modal-event.json" so support staff can correlate.
 */
function flushRecoveryModalCheckpoint(code: string, errorCode?: string): void {
  try {
    const baseDir = path.join(app.getPath('userData'), 'recovery-events');
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    const file = path.join(baseDir, `modal-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({
      timestampMs: Date.now(),
      code,
      errorCode: errorCode ?? null,
      metrics: getRecoveryMetrics().snapshot(),
    }, null, 2));
  } catch (err) {
    console.warn('[RecoveryHandlers] checkpoint flush 실패 (무시):', err);
  }
}

interface UserChoicePayload {
  readonly code: string;
  readonly chosenId: string;
  readonly choiceLabel: string;
}

const VALID_CODES: ReadonlySet<BlockingModalCode> = new Set([
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
]);

/**
 * Trigger flush + broadcast a recovery modal request to the active window.
 * Called by generator code via `recovery:request-modal` IPC.
 */
function broadcastModalRequest(payload: {
  code: BlockingModalCode;
  reason: string;
  errorCode?: string;
}): void {
  flushRecoveryModalCheckpoint(payload.code, payload.errorCode);
  // C7: recordModalShown은 coordinator.showBlockingModal에서만 호출됨 (중복 제거).
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('recovery:show-modal', payload);
    }
  }
}

export function registerRecoveryHandlers(): void {
  ipcMain.on('recovery:user-choice', (_event, payload: UserChoicePayload) => {
    if (!payload || typeof payload !== 'object') return;
    if (!VALID_CODES.has(payload.code as BlockingModalCode)) {
      console.warn('[RecoveryHandlers] 잘못된 모달 코드:', payload.code);
      return;
    }

    getRecoveryMetrics().recordUserChoice({
      chosenId: payload.chosenId,
      choiceLabel: payload.choiceLabel,
      timestampMs: Date.now(),
    });

    console.log(`[RECOVERY:USER_CHOICE] ${payload.code} -> ${payload.chosenId}`);

    // Touch the singleton to ensure metrics are visible to dashboard reads.
    getRecoveryCoordinator();
  });

  // Generator code (main process) calls this to surface a blocking modal.
  ipcMain.on('recovery:request-modal', (_event, payload: { code: BlockingModalCode; reason: string; errorCode?: string }) => {
    if (!payload?.code || !VALID_CODES.has(payload.code)) {
      console.warn('[RecoveryHandlers] 잘못된 modal 요청:', payload);
      return;
    }
    broadcastModalRequest(payload);
  });

  ipcMain.handle('recovery:get-metrics', () => {
    return getRecoveryMetrics().snapshot();
  });
}

// Exported for direct main-process callers (avoids event round-trip).
export { broadcastModalRequest };
