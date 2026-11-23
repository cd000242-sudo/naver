// src/generationStop/shoppingSlots.ts
// Shopping body images: one batch call for all slots, then ONLY the slots that did not arrive are made again,
// one at a time, with the SAME engine. A slot that still fails is returned as missing so the caller can hand the run to
// the stop window (no other engine fills it, nothing is thrown away). Finished slots live in the ledger.
// Pure file, inlined into the renderer bundle (gstop prefix). Needs stageGate.ts registered before it.

import { gstopSlotKey } from './stageGate.js';
import type { gstopCreateLedger } from './stageGate.js';

export interface GstopShoppingSlotsInput {
  readonly items: readonly any[];
  readonly ledger: ReturnType<typeof gstopCreateLedger>;
  /** One request for the given slots (only called when nothing is finished yet and 2+ slots are open). */
  readonly batch: (items: readonly any[]) => Promise<readonly any[]>;
  /** One request for one slot; null / undefined when the engine returned nothing. */
  readonly single: (item: any) => Promise<any | null | undefined>;
  /** Maps received images to slot positions by heading (gsPrefetchMatchImages). */
  readonly match: (items: readonly any[], indexes: readonly number[], images: readonly any[]) => Map<number, any>;
  /** True when the image is a unique AI result for the slot (not a collected original, not a duplicate). */
  readonly accept: (image: any, accepted: readonly any[]) => boolean;
  /** True for limit / login / model errors: the same engine would fail the same way, so they go to the window. */
  readonly isEngineLevelError: (error: unknown) => boolean;
  readonly stopCheck?: () => boolean;
  readonly onProgress?: (message: string) => void;
  /** Tries per open slot after the batch (default 2). */
  readonly slotAttempts?: number;
}

export interface GstopShoppingSlotsResult { readonly images: any[]; readonly missing: any[] }

function gstopAcceptedBefore(input: GstopShoppingSlotsInput, upTo: number): any[] {
  return input.items.slice(0, upTo).map((item) => input.ledger.get(gstopSlotKey(item))).filter(Boolean);
}

export async function gstopFillShoppingSlots(input: GstopShoppingSlotsInput): Promise<GstopShoppingSlotsResult> {
  const { items, ledger } = input;
  const open = (): number[] => items.map((item, index) => (ledger.get(gstopSlotKey(item)) ? -1 : index)).filter((index) => index >= 0);
  const take = (index: number, image: any): boolean => {
    const accepted = items.map((item) => ledger.get(gstopSlotKey(item))).filter(Boolean);
    if (!image || !input.accept(image, accepted)) return false;
    ledger.set(gstopSlotKey(items[index]), image);
    return true;
  };

  if (ledger.size === 0 && items.length > 1 && !input.stopCheck?.()) {
    try {
      const received = await input.batch(items);
      const matched = input.match(items, open(), received);
      for (const index of open()) if (matched.has(index)) take(index, matched.get(index));
      const gap = open().length;
      if (gap > 0) input.onProgress?.(`🛒 묶음에서 ${items.length - gap}/${items.length}장 받음 — 빠진 ${gap}칸은 같은 엔진으로 한 장씩 다시 만듭니다.`);
    } catch (error) {
      if (input.isEngineLevelError(error)) throw error;
      input.onProgress?.(`⚠️ 쇼핑 묶음 요청 실패 — 같은 엔진으로 한 장씩 만듭니다: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
    }
  }

  const attempts = Math.max(1, input.slotAttempts ?? 2);
  for (const index of open()) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (input.stopCheck?.()) return { images: gstopAcceptedBefore(input, items.length), missing: open().map((i) => items[i]) };
      try {
        if (take(index, await input.single(items[index]))) break;
      } catch (error) {
        if (input.isEngineLevelError(error)) throw error;
      }
    }
  }
  return { images: gstopAcceptedBefore(input, items.length), missing: open().map((index) => items[index]) };
}
