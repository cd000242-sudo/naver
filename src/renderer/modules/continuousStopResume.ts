// src/renderer/modules/continuousStopResume.ts
// Continuous-publishing side of the stop window: what a queue item carries across a stop (finished article, finished
// images), the context handed to the stop window, and putting a saved queue back after the app was closed and opened.
// Renderer bundle note: one shared scope, so every top-level name carries the continuousStop prefix.

import { gstopCreateLedger } from '../../generationStop/stageGate.js';
import { gstopQueueForResume } from '../../generationStop/resumeRecord.js';
import type { GstopQueueEntry, GstopRecord } from '../../generationStop/resumeRecord.js';
import type { GenerationStopContext } from './generationStopGate.js';

type ContinuousStopItem = { id: string; value: string; status: string; contentMode?: string; [key: string]: unknown };

/** Light copy of the queue for the saved record: finished posts stay "completed", heavy generated payloads are left out. */
export function continuousStopQueueSnapshot(queue: readonly ContinuousStopItem[]): GstopQueueEntry[] {
  return queue.map((item) => {
    const { structuredContent, collectedImages, additionalUrls, _resumeArticle, _resumeLedger, ...rest } = item as Record<string, unknown>;
    void structuredContent; void collectedImages; void _resumeArticle; void _resumeLedger;
    return { ...rest, ...(Array.isArray(additionalUrls) ? { additionalUrls } : {}) } as GstopQueueEntry;
  });
}

/** The ledger of finished images stays on the item, so a retry or a restart of the same post only makes the open slots. */
export function continuousStopLedger(item: ContinuousStopItem): ReturnType<typeof gstopCreateLedger> {
  const held = item._resumeLedger as ReturnType<typeof gstopCreateLedger> | undefined;
  if (held) return held;
  const created = gstopCreateLedger();
  item._resumeLedger = created;
  return created;
}

export function continuousStopContext(
  item: ContinuousStopItem,
  queue: readonly ContinuousStopItem[],
  article: () => unknown,
  progressLine: string,
): GenerationStopContext {
  return {
    kind: 'continuous',
    label: String(item.value || '').slice(0, 40),
    recordId: `continuous-${item.id}`,
    article,
    ledger: continuousStopLedger(item),
    queue: () => continuousStopQueueSnapshot(queue),
    stoppedItemId: item.id,
    shopping: item.contentMode === 'affiliate',
    progressLine,
  };
}

/** Drops what an item carried (called when the post finished). */
export function continuousStopClear(item: ContinuousStopItem): void {
  delete item._resumeArticle;
  delete item._resumeLedger;
}

/**
 * Puts the saved queue back into the live queue array (in place) and hands the finished article / images to the item
 * that stopped. Finished posts stay "completed"; the stopped post and the waiting ones start again.
 */
export function continuousStopRestoreQueue(live: ContinuousStopItem[], record: GstopRecord): number {
  if (!record.queue || !record.stoppedItemId) return 0;
  const restored = gstopQueueForResume(record.queue, record.stoppedItemId).map((entry) => ({ ...entry })) as unknown as ContinuousStopItem[];
  const stopped = restored.find((item) => item.id === record.stoppedItemId);
  if (stopped) {
    if (record.article) stopped._resumeArticle = record.article;
    stopped._resumeLedger = gstopCreateLedger((record.ledger as never) ?? []);
  }
  live.splice(0, live.length, ...restored);
  return restored.length;
}
