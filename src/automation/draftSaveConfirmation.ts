// src/automation/draftSaveConfirmation.ts
// [2026-10-10] A Naver draft save does not navigate, so waiting only for navigation always ran the full
//   timeout after the save had already finished. Finish as soon as the header's
//   "임시저장된 글 보기, N개" count grows. If the count cannot be read or stays the same (overwriting an
//   existing draft), wait for navigation or the timeout exactly as before — never longer.

export type DraftSaveSignal = 'count' | 'navigation' | 'timeout';

export interface DraftSaveWaitDeps {
  /** Current draft count in the editor header, or null when it cannot be read. */
  readCount(): Promise<number | null>;
  /** Resolves when the frame navigates; rejects on timeout or when the frame goes away. */
  waitNavigation(timeoutMs: number): Promise<unknown>;
  delay(ms: number): Promise<void>;
  now?(): number;
}

export const DRAFT_SAVE_WAIT_MS = 10_000;
export const DRAFT_SAVE_POLL_MS = 500;

/** A save is confirmed only when the count was readable before the click and grew after it. */
export function isDraftCountIncreased(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && after > before;
}

function isTimeoutError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return e?.name === 'TimeoutError' || /timeout/i.test(String(e?.message ?? ''));
}

export async function waitForDraftSaveSignal(
  before: number | null,
  deps: DraftSaveWaitDeps,
  timeoutMs = DRAFT_SAVE_WAIT_MS,
): Promise<DraftSaveSignal> {
  const now = deps.now ?? Date.now;
  let settled = false;
  // A frame that detaches right after the save ends the wait too, as the old `.catch(() => undefined)` did.
  const navigation: Promise<DraftSaveSignal> = deps.waitNavigation(timeoutMs)
    .then(() => 'navigation' as const, (error: unknown) => (isTimeoutError(error) ? 'timeout' as const : 'navigation' as const));
  if (before === null) return navigation;
  const counting = (async (): Promise<DraftSaveSignal> => {
    const deadline = now() + timeoutMs;
    while (!settled && now() < deadline) {
      const after = await deps.readCount().catch(() => null);
      if (isDraftCountIncreased(before, after)) return 'count';
      await deps.delay(DRAFT_SAVE_POLL_MS);
    }
    return 'timeout';
  })();
  const result = await Promise.race([navigation, counting]);
  settled = true;
  return result;
}
