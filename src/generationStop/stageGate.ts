// src/generationStop/stageGate.ts
// One generation stage (text or image) behind the stop window: run it; when it stops for a reason a window can help
// with, ask the owner (same engine / another engine / stop here) and continue from that stage only.
// Nothing here picks an engine: a different engine runs only when the owner chose it. Without a way to ask (unattended
// run) the stop is recorded and the run ends — it never switches engines on its own.
// Pure file, inlined into the renderer bundle (gstop prefix). Needs stopClassifier.ts registered before it.

import { gstopClassify } from './stopClassifier.js';
import type { GstopDecision, GstopInfo, GstopStage } from './stopClassifier.js';

/** A stop ended the run on purpose ("halted": the owner chose to stop, "unattended": nobody could be asked). */
export class GstopHaltedError extends Error {
  readonly info: GstopInfo;
  readonly reason: 'halted' | 'unattended';
  constructor(info: GstopInfo, reason: 'halted' | 'unattended') {
    super(reason === 'halted' ? '사용자가 여기서 멈추기를 골랐습니다.' : '창을 띄울 수 없는 실행이라 멈춘 상태를 저장했습니다.');
    this.name = 'GstopHaltedError';
    this.info = info;
    this.reason = reason;
  }
}

export interface GstopStageRequest<T> {
  readonly stage: GstopStage;
  readonly engine: string;
  /** Runs the stage with the engine (re-entered after every continue; reuse finished work through a ledger). */
  readonly run: (engine: string, attempt: number) => Promise<T>;
  /** Asks the owner. Omit for a run that cannot show a window. */
  readonly ask?: (info: GstopInfo) => Promise<GstopDecision>;
  /** Called at every stop, before asking: save the resume record here. */
  readonly onStop?: (info: GstopInfo) => void | Promise<void>;
  /** Called when the owner picks another engine (apply it for this run, save it when persist is true). */
  readonly onSwitch?: (engine: string, persist: boolean) => void | Promise<void>;
  /** Called after the stage finally succeeded (drop the saved record). */
  readonly onDone?: () => void | Promise<void>;
  readonly now?: () => number;
}

export interface GstopStageResult<T> { readonly value: T; readonly engine: string }

export async function gstopRunStage<T>(request: GstopStageRequest<T>): Promise<GstopStageResult<T>> {
  let engine = request.engine;
  for (let attempt = 1; ; attempt++) {
    try {
      const value = await request.run(engine, attempt);
      if (attempt > 1) await request.onDone?.();
      return { value, engine };
    } catch (error) {
      const info = gstopClassify(error, request.stage, engine, request.now?.());
      if (!info) throw error;
      await request.onStop?.(info);
      if (!request.ask) throw new GstopHaltedError(info, 'unattended');
      const decision = await request.ask(info);
      if (decision.kind === 'halt') throw new GstopHaltedError(info, 'halted');
      if (decision.kind === 'switch') {
        engine = decision.engine;
        await request.onSwitch?.(decision.engine, decision.persist);
      }
    }
  }
}

export interface GstopLedgerEntry<I = unknown> { readonly key: string; readonly image: I }

/** Finished images of one stage, by slot. It only grows: a failed attempt never removes what an earlier one made. */
export function gstopCreateLedger<I = any>(saved: readonly GstopLedgerEntry<I>[] = []) {
  const slots = new Map<string, I>(saved.map((entry) => [entry.key, entry.image]));
  return {
    get: (key: string): I | undefined => slots.get(key),
    set: (key: string, image: I): void => { slots.set(key, image); },
    get size(): number { return slots.size; },
    values: (): I[] => Array.from(slots.values()),
    entries: (): GstopLedgerEntry<I>[] => Array.from(slots, ([key, image]) => ({ key, image })),
  };
}

/** Slot identity that survives a rerun of the same article: thumbnail flag + place + heading. */
export function gstopSlotKey(item: { heading?: unknown; originalIndex?: unknown; isThumbnail?: unknown }): string {
  const heading = String(item?.heading ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return `${item?.isThumbnail === true ? 'T' : 'S'}|${item?.originalIndex ?? ''}|${heading}`;
}
