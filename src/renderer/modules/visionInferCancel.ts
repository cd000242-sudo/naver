// src/renderer/modules/visionInferCancel.ts
// [2026-09-10] Stop button support for photo-mode inference ("추론 중").
//
// Photo-mode inference is one blocking IPC call (vision:infer-and-write) that can run for
// minutes. Before this module the renderer had no way to abort it: the progress modal's
// cancel button only aborted *content generation* request ids, the "⏳ 추론 중..." button
// was disabled, and a late result still popped the review panel after the user gave up.
//
// One request id is active at a time (the UI serialises inference), so a single global
// slot is enough. The id travels with the infer payload and is the key the main-process
// ScopedAbortRegistry aborts on.

const ACTIVE_REQUEST_KEY = '_activeVisionInferRequestId';

function randomSuffix(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Creates a new inference request id and marks it as the active run. */
export function beginVisionInferRequest(): string {
  const requestId = `vision-infer-${randomSuffix()}`;
  (window as any)[ACTIVE_REQUEST_KEY] = requestId;
  return requestId;
}

/** Clears the active slot, but only if it still belongs to this request. */
export function endVisionInferRequest(requestId: string): void {
  if ((window as any)[ACTIVE_REQUEST_KEY] === requestId) {
    (window as any)[ACTIVE_REQUEST_KEY] = '';
  }
}

export function getActiveVisionInferRequestId(): string {
  const value = (window as any)[ACTIVE_REQUEST_KEY];
  return typeof value === 'string' ? value : '';
}

/** True when `requestId` is no longer the active run (user stopped it or a newer run began). */
export function isVisionInferStale(requestId: string): boolean {
  return getActiveVisionInferRequestId() !== requestId;
}

/**
 * Aborts the active inference in the main process. Returns true when something was
 * aborted. Clears the active slot first so a late IPC result is treated as stale.
 */
export async function cancelActiveVisionInfer(reason: string): Promise<boolean> {
  const requestId = getActiveVisionInferRequestId();
  if (!requestId) return false;
  (window as any)[ACTIVE_REQUEST_KEY] = '';
  try {
    const result = await (window as any).api?.cancelInferAndWrite?.({ requestId, reason });
    return Number(result?.aborted ?? 0) > 0;
  } catch (error) {
    console.warn('[VisionInferCancel] cancel IPC failed:', (error as Error)?.message);
    return false;
  }
}
