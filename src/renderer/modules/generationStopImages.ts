// src/renderer/modules/generationStopImages.ts
// Puts the image stage behind the stop window. The finished slots live in a ledger that outlives every attempt, so
// "same engine", "other engine" and a later resume only make the slots that are still open.
// Renderer bundle note: one shared scope, so every top-level name carries the generationStop prefix.

import { gstopCreateLedger } from '../../generationStop/stageGate.js';
import { gstopIsAccountLevelAgentError } from '../../generationStop/stopClassifier.js';
import { generationStopImageEngineForRun, generationStopRunStage } from './generationStopGate.js';
import type { GenerationStopContext } from './generationStopGate.js';

export interface GenerationStopImageOptions {
  readonly stopContext?: GenerationStopContext;
  readonly imageLedger?: ReturnType<typeof gstopCreateLedger>;
  readonly onProgress?: (message: string) => void;
}

/** limit / login / model failures of a subscription engine: the same engine fails the same way, retrying it is wasted. */
export function generationStopIsEngineLevelError(error: unknown): boolean {
  return gstopIsAccountLevelAgentError(error);
}

/**
 * Runs `run(engine, ledger)` for the image stage. Without a stopContext the window still opens, but nothing is saved
 * for a later resume (the caller has no queue or article to restore).
 */
export async function generationStopRunImages<T>(
  provider: string,
  postTitle: unknown,
  options: GenerationStopImageOptions | undefined,
  run: (engine: string, ledger: ReturnType<typeof gstopCreateLedger>) => Promise<T>,
): Promise<T> {
  const ledger = options?.imageLedger ?? options?.stopContext?.ledger ?? gstopCreateLedger();
  const base: GenerationStopContext = options?.stopContext ?? { kind: 'full-auto', label: String(postTitle ?? ''), noRecord: true };
  const ctx: GenerationStopContext = { ...base, ledger, label: base.label || String(postTitle ?? '') };
  const result = await generationStopRunStage('image', generationStopImageEngineForRun(provider), ctx, (engine, attempt) => {
    if (attempt > 1 || engine !== provider) options?.onProgress?.(`🔁 이미지 단계를 이어서 만듭니다 (엔진: ${engine}, 만든 ${ledger.size}칸은 그대로)`);
    return run(engine, ledger);
  });
  return result.value;
}
