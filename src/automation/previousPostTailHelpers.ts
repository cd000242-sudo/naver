import { Page } from 'puppeteer';
import { recordSilentFailure } from './silentFailureCounter.js';
import { ensureTailTypingReady } from './richTextPaste.js';
import { isEditorDocumentRewriteEnabled } from './editorDocumentRewriteGate.js';

function emitDebug(stage: string, payload: Record<string, unknown>): void {
  try {
    console.warn(`[TailDebug] ${JSON.stringify({ stage, ...payload })}`);
  } catch (error) {
    console.warn('[TailDebug] emit failed', (error as Error).message);
  }
}

/** Put the caret back at the editor tail after a previous-post card; failures are counted, never thrown. */
export async function refocusPreviousPostTail(self: any, page: Page): Promise<void> {
  try {
    const frame = typeof self.getAttachedFrame === 'function' ? await self.getAttachedFrame() : null;
    if (frame) {
      const ready = await ensureTailTypingReady(page, frame, (m: string) => self.log(m));
      if (!ready) recordSilentFailure('editor:previous-post-tail-refocus');
    }
  } catch (error) {
    recordSilentFailure('editor:previous-post-tail-refocus');
    emitDebug('previous-post-tail-refocus-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Optional layout hook (e.g. centring) that runs once after every previous-post card is placed.
 * Absent hook = no-op; a failing hook never blocks the tail.
 * The hook rewrites the editor document, which blanked the editor in live runs (see editorDocumentRewriteGate): off by default.
 */
export async function runPreviousPostCardsLayoutHook(self: any, page: Page, urls: readonly string[]): Promise<void> {
  if (!isEditorDocumentRewriteEnabled()) return;
  if (urls.length === 0 || typeof self.alignPreviousPostCards !== 'function') return;
  try {
    await self.alignPreviousPostCards([...urls]);
    await refocusPreviousPostTail(self, page);
  } catch (error) {
    emitDebug('previous-post-align-failed', { message: error instanceof Error ? error.message : String(error) });
  }
}
