// src/renderer/modules/generationStopResumeCard.ts
// "이어서 발행" card: shown when the app opens (or gets focus) and a saved stop record exists.
//   - continuous queue: [이어서 발행] puts the queue back (finished posts stay "완료"), starts from the stopped post.
//   - multi-account queue / single full-auto: [이어서 발행] hands the record to that module (it restores and starts).
//   - daily auto-publisher (nobody could be asked): information only. Nothing was switched to another engine.
// Renderer bundle note: one shared scope, so every top-level name carries the generationStopResumeCard prefix.

import { gstopParseRecords, gstopResumeSummary } from '../../generationStop/resumeRecord.js';
import type { GstopRecord } from '../../generationStop/resumeRecord.js';

// Bundle-scope functions of continuousPublishing: declared and called directly (never looked up on window).
declare function restoreContinuousQueueFromStop(record: unknown): number;
declare function startContinuousPublishingV2(): Promise<void>;
// Bundle-scope functions of fullAutoStopResume / multiAccountStopResume (same rule).
declare function fullAutoStopResumeStart(record: unknown): Promise<boolean>;
declare function fullAutoStopResumeBusy(): boolean;
declare function multiAccountStopResumeStart(record: unknown): Promise<boolean>;
declare function multiAccountStopResumeBusy(): boolean;

export const GENERATION_STOP_CARD_ID = 'generation-stop-resume-card';

export interface GenerationStopResumeCardDeps {
  readonly list: () => Promise<readonly GstopRecord[]>;
  readonly remove: (id: string) => Promise<void>;
  readonly restoreQueue: (record: GstopRecord) => number;
  readonly startQueue: () => Promise<void>;
  /** Multi-account / single full-auto: restores the saved run and starts it. False = nothing was started (record is kept). */
  readonly resumeRun?: (record: GstopRecord) => Promise<boolean>;
  /** True while a run is going or the stop window is open: the saved record belongs to that run, not to a resume. */
  readonly busy?: () => boolean;
}

export interface GenerationStopResumeCardRow {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly progress: string;
  readonly canResume: boolean;
}

export function generationStopResumeCardModel(records: readonly GstopRecord[]): GenerationStopResumeCardRow[] {
  return [...records].sort((a, b) => b.createdAt - a.createdAt).map((record) => ({
    id: record.id,
    title: GENERATION_STOP_CARD_TITLES[record.kind] || '발행',
    summary: record.summary,
    progress: gstopResumeSummary(record) || (record.label ? `글: ${record.label}` : ''),
    canResume: generationStopResumeCardCanResume(record),
  }));
}

const GENERATION_STOP_CARD_TITLES: Record<string, string> = { daily: '매일 자동발행', continuous: '연속발행', multi: '다중계정 발행', 'full-auto': '풀오토 발행' };

/** Queue runs need the saved queue; a single full-auto run needs its saved inputs. Daily runs are information only. */
export function generationStopResumeCardCanResume(record: GstopRecord): boolean {
  if (record.kind === 'continuous' || record.kind === 'multi') return Array.isArray(record.queue) && record.queue.length > 0 && !!record.stoppedItemId;
  if (record.kind === 'full-auto') return record.resumeData !== undefined && record.resumeData !== null;
  return false;
}

function generationStopResumeCardButton(label: string, attribute: string, primary: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = primary ? 'nv-btn nv-btn--primary' : 'nv-btn';
  button.setAttribute(attribute, '1');
  button.style.cssText = 'padding:0.5rem 0.9rem;font-size:0.95rem;';
  button.textContent = label;
  return button;
}

function generationStopResumeCardDefaultDeps(): GenerationStopResumeCardDeps {
  const api = () => (window as any).api;
  return {
    list: async () => gstopParseRecords((await api()?.generationStopList?.())?.records),
    remove: async (id) => { await api()?.generationStopRemove?.(id); },
    restoreQueue: (record) => restoreContinuousQueueFromStop(record),
    startQueue: () => startContinuousPublishingV2(),
    resumeRun: (record) => (record.kind === 'multi' ? multiAccountStopResumeStart(record) : fullAutoStopResumeStart(record)),
    busy: () => (window as any).isContinuousMode === true || document.getElementById('generation-stop-modal') !== null
      || fullAutoStopResumeBusy() || multiAccountStopResumeBusy(),
  };
}

/** Draws (or removes) the card from the saved records. Never throws: a broken record file must not block the app. */
export async function generationStopResumeCardRefresh(deps: GenerationStopResumeCardDeps = generationStopResumeCardDefaultDeps()): Promise<void> {
  let records: readonly GstopRecord[] = [];
  try { records = await deps.list(); } catch { records = []; }
  document.getElementById(GENERATION_STOP_CARD_ID)?.remove();
  if (records.length === 0 || deps.busy?.() === true) return;

  const card = document.createElement('div');
  card.id = GENERATION_STOP_CARD_ID;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', '멈춘 발행');
  card.style.cssText = 'position:fixed;right:1rem;bottom:1rem;z-index:10000000;max-width:380px;display:flex;flex-direction:column;gap:0.6rem;';
  for (const row of generationStopResumeCardModel(records)) {
    const box = document.createElement('div');
    box.className = 'nv-modal nv-modal--warn';
    box.style.cssText = 'padding:0.9rem 1rem;display:flex;flex-direction:column;gap:0.4rem;';
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:900;font-size:1rem;';
    heading.textContent = `${row.title} · ${row.summary}`;
    box.appendChild(heading);
    if (row.progress) {
      const progress = document.createElement('div');
      progress.className = 'nv-modal__note';
      progress.style.cssText = 'font-size:0.85rem;';
      progress.textContent = row.progress;
      box.appendChild(progress);
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end;';
    const record = records.find((entry) => entry.id === row.id) as GstopRecord;
    if (row.canResume) {
      const resume = generationStopResumeCardButton('이어서 발행', 'data-gstop-resume', true);
      resume.addEventListener('click', () => {
        void (async () => {
          resume.disabled = true;
          try {
            if (record.kind !== 'continuous') {
              // The record is removed only after the run really started, so a failed start keeps the card.
              if (await deps.resumeRun?.(record)) {
                // A run that stopped again right away saved a newer record under the same id: that one is kept.
                const latest = (await deps.list().catch(() => [] as readonly GstopRecord[])).find((entry) => entry.id === record.id);
                if (!latest || latest.createdAt === record.createdAt) await deps.remove(record.id);
                card.remove();
              } else { resume.disabled = false; }
            } else if (deps.restoreQueue(record) > 0) { await deps.remove(record.id); card.remove(); await deps.startQueue(); }
          } catch (error) { console.warn('[GenerationStop] 이어서 발행 실패:', (error as Error)?.message); resume.disabled = false; }
        })();
      });
      actions.appendChild(resume);
    }
    const dismiss = generationStopResumeCardButton(row.canResume ? '지우기' : '확인', 'data-gstop-dismiss', false);
    dismiss.addEventListener('click', () => { void deps.remove(row.id).catch(() => undefined).then(() => generationStopResumeCardRefresh(deps)); });
    actions.appendChild(dismiss);
    box.appendChild(actions);
    card.appendChild(box);
  }
  document.body.appendChild(card);
}

/** App open / window focus: look for saved stops. The first look waits a little so it never slows the start. */
function generationStopResumeCardInit(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || (window as any).__generationStopCardWired) return;
  (window as any).__generationStopCardWired = true;
  setTimeout(() => { void generationStopResumeCardRefresh(); }, 4000);
  window.addEventListener('focus', () => { void generationStopResumeCardRefresh(); });
}
generationStopResumeCardInit();
