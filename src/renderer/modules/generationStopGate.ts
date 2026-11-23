// src/renderer/modules/generationStopGate.ts
// Wires one generation stage (writing the article / making the images) to the stop window and the saved record.
//   stop -> save the record (and tell the owner when the window is hidden) -> ask -> same / other engine / stop here.
// "Other engine" is applied for THIS run only unless the owner ticked "설정에도 저장". Nothing is switched silently.
// Renderer bundle note: one shared scope, so every top-level name carries the generationStop prefix.

import { gstopBuildRecord } from '../../generationStop/resumeRecord.js';
import type { GstopKind, GstopQueueEntry, GstopRecord } from '../../generationStop/resumeRecord.js';
import { GstopHaltedError, gstopCreateLedger, gstopRunStage } from '../../generationStop/stageGate.js';
import type { GstopStageResult } from '../../generationStop/stageGate.js';
import { gstopClassify, gstopEngineLabel } from '../../generationStop/stopClassifier.js';
import type { GstopDecision, GstopInfo, GstopStage } from '../../generationStop/stopClassifier.js';
import { retiredImageEngineChoices } from '../../runtime/retiredImageEngines.js';
import { generationStopModalAsk } from './generationStopModal.js';
import type { GenerationStopModalEngine } from './generationStopModal.js';
// Bundle-scope functions of startupEngineGate: declared and called directly (never imported: importing it pulls the whole
// settings window into every module that uses this gate, and that file touches `window` when it loads).
declare function applyEngineGateSelection(model: string, title: string): Promise<void>;
declare function collectEngineGateOptions(root?: ParentNode): ReadonlyArray<{ readonly value: string; readonly title: string }>;

/** What the caller knows about the run, so the saved record can carry the finished work. */
export interface GenerationStopContext {
  readonly kind: GstopKind;
  readonly label: string;
  readonly recordId?: string;
  readonly article?: () => unknown;
  readonly images?: () => readonly unknown[];
  readonly ledger?: ReturnType<typeof gstopCreateLedger>;
  readonly queue?: () => readonly GstopQueueEntry[];
  readonly stoppedItemId?: string;
  readonly progressLine?: string;
  /** Shopping runs keep their image engine in one more key. */
  readonly shopping?: boolean;
  /** True for a run that cannot show a window: stop, save, notify, never ask. */
  readonly unattended?: boolean;
  /** The caller cannot resume from a saved record (no queue / article to restore): ask inline only, save nothing. */
  readonly noRecord?: boolean;
}

export interface GenerationStopGateDeps {
  readonly ask: typeof generationStopModalAsk;
  readonly saveRecord: (record: GstopRecord, notify: boolean) => Promise<void>;
  readonly removeRecord: (id: string) => Promise<void>;
  readonly isHidden: () => boolean;
  readonly applyEngine: (stage: GstopStage, engine: string, persist: boolean, ctx: GenerationStopContext) => Promise<void>;
  readonly engines: (stage: GstopStage, current: string) => GenerationStopModalEngine[];
}

const GENERATION_STOP_TEXT_RESTORE_KEY = 'generationStop.textRestore.v1';
/** Engine the owner picked "for this run only" in the window; cleared when the run ends. */
const generationStopRunEngines: { image?: string; text?: string } = {};

export function generationStopRunEngine(stage: GstopStage): string | undefined { return generationStopRunEngines[stage]; }
export function generationStopImageEngineForRun(requested: string): string {
  const picked = generationStopRunEngines.image;
  return picked && !['skip', 'saved', 'local-folder', 'naver', 'naver-search', 'collect-photos'].includes(requested) ? picked : requested;
}

export function generationStopImageEngines(current: string): GenerationStopModalEngine[] {
  return retiredImageEngineChoices().filter((value) => value !== current).map((value) => ({ value, label: gstopEngineLabel(value) }));
}
export function generationStopTextEngines(current: string): GenerationStopModalEngine[] {
  return collectEngineGateOptions().filter((option) => option.value !== current).map((option) => ({ value: option.value, label: option.title }));
}

function generationStopCurrentTextModel(): string {
  return (document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement | null)?.value || '';
}

async function generationStopApplyEngine(stage: GstopStage, engine: string, persist: boolean, ctx: GenerationStopContext): Promise<void> {
  generationStopRunEngines[stage] = engine;
  if (stage === 'image') {
    if (persist) {
      for (const key of ctx.shopping ? ['fullAutoImageSource', 'globalImageSource', 'scAIImageEngine'] : ['fullAutoImageSource', 'globalImageSource']) localStorage.setItem(key, engine);
      delete generationStopRunEngines.image;
    }
    return;
  }
  // The writing engine is read from the saved settings by the main process, so it is saved now and put back when the run ends.
  const previous = generationStopCurrentTextModel();
  if (!persist && previous && !localStorage.getItem(GENERATION_STOP_TEXT_RESTORE_KEY)) localStorage.setItem(GENERATION_STOP_TEXT_RESTORE_KEY, previous);
  if (persist) { localStorage.removeItem(GENERATION_STOP_TEXT_RESTORE_KEY); delete generationStopRunEngines.text; }
  await applyEngineGateSelection(engine, gstopEngineLabel(engine));
}

/**
 * End of a run, and app start: drop the run-only image pick and put the writing engine back. Never throws.
 * The marker is removed only after the engine is back, so an app that died mid-run restores it at the next start.
 */
export async function generationStopEndRun(deps: { apply?: (model: string, title: string) => Promise<void> } = {}): Promise<void> {
  delete generationStopRunEngines.image;
  delete generationStopRunEngines.text;
  try {
    const previous = localStorage.getItem(GENERATION_STOP_TEXT_RESTORE_KEY);
    if (!previous) return;
    await (deps.apply ?? applyEngineGateSelection)(previous, gstopEngineLabel(previous));
    localStorage.removeItem(GENERATION_STOP_TEXT_RESTORE_KEY);
  } catch (error) { console.warn('[GenerationStop] 글 엔진 복구 실패(다음 시작 때 다시 시도):', (error as Error)?.message); }
}

function generationStopDefaultDeps(): GenerationStopGateDeps {
  const api = () => (window as any).api;
  return {
    ask: generationStopModalAsk,
    saveRecord: async (record, notify) => { await api()?.generationStopSave?.(record, { notify }); },
    removeRecord: async (id) => { await api()?.generationStopRemove?.(id); },
    isHidden: () => document.hidden === true,
    applyEngine: generationStopApplyEngine,
    engines: (stage, current) => (stage === 'image' ? generationStopImageEngines(current) : generationStopTextEngines(current)),
  };
}

function generationStopRecordOf(ctx: GenerationStopContext, info: GstopInfo, recordId: string): GstopRecord {
  return gstopBuildRecord({
    kind: ctx.kind, info, label: ctx.label, id: recordId,
    article: ctx.article?.(), images: ctx.images?.(), ledger: ctx.ledger?.entries(),
    queue: ctx.queue?.(), stoppedItemId: ctx.stoppedItemId,
  });
}

async function generationStopSaveStop(ctx: GenerationStopContext, info: GstopInfo, recordId: string, deps: GenerationStopGateDeps): Promise<boolean> {
  if (ctx.noRecord) return false;
  try { await deps.saveRecord(generationStopRecordOf(ctx, info, recordId), ctx.unattended === true || deps.isHidden()); return true; }
  catch (error) { console.warn('[GenerationStop] 이어 가기 기록 저장 실패:', (error as Error)?.message); return false; }
}

/**
 * For a caller that owns its own retry loop (single full-auto): after a failure, ask what to do and return the engine to
 * continue with ("same" returns the same one). Throws the original error when no window can help with it, and
 * GstopHaltedError when the owner stops here or nobody can be asked.
 */
export async function generationStopResolveFailure(
  stage: GstopStage,
  engine: string,
  error: unknown,
  ctx: GenerationStopContext,
  deps: GenerationStopGateDeps = generationStopDefaultDeps(),
): Promise<string> {
  const info = gstopClassify(error, stage, engine);
  if (!info) throw error;
  await generationStopSaveStop(ctx, info, ctx.recordId || `gstop-${ctx.kind}-${Date.now()}`, deps);
  if (ctx.unattended) throw new GstopHaltedError(info, 'unattended');
  const decision = await deps.ask({ info, engines: deps.engines(stage, info.engine), progressLine: ctx.progressLine });
  if (decision.kind === 'halt') throw new GstopHaltedError(info, 'halted');
  if (decision.kind === 'switch') { await deps.applyEngine(stage, decision.engine, decision.persist, ctx); return decision.engine; }
  return engine;
}

/**
 * Runs one stage behind the stop window. `run` receives the engine to use and is entered again after every continue,
 * so it must reuse finished work (see gstopCreateLedger). Rethrows GstopHaltedError when the owner stops here.
 */
export async function generationStopRunStage<T>(
  stage: GstopStage,
  engine: string,
  ctx: GenerationStopContext,
  run: (engine: string, attempt: number) => Promise<T>,
  deps: GenerationStopGateDeps = generationStopDefaultDeps(),
): Promise<GstopStageResult<T>> {
  const recordId = ctx.recordId || `gstop-${ctx.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let saved = false;
  return gstopRunStage<T>({
    stage, engine, run,
    ...(ctx.unattended ? {} : {
      ask: async (info): Promise<GstopDecision> => deps.ask({ info, engines: deps.engines(stage, info.engine), progressLine: ctx.progressLine }),
    }),
    onStop: async (info) => { saved = (await generationStopSaveStop(ctx, info, recordId, deps)) || saved; },
    onSwitch: (picked, persist) => deps.applyEngine(stage, picked, persist, ctx),
    onDone: async () => { if (saved) await deps.removeRecord(recordId).catch(() => undefined); },
  });
}

/** App start: a writing engine left switched by a run that died is put back (before anything can start a run). */
function generationStopRestoreOnStart(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || (window as any).__generationStopRestoreWired) return;
  (window as any).__generationStopRestoreWired = true;
  setTimeout(() => { if ((window as any).isContinuousMode !== true) void generationStopEndRun(); }, 2500);
}
generationStopRestoreOnStart();
