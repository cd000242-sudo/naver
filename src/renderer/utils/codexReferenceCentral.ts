/**
 * [2026-11-11] One place that decides whether an image request gets the user's Codex reference photos.
 * generateImagesWithCostSafety (costAndAutoGen) calls resolveCodexReferenceForCall for every request, so the image tab's
 * batch, per-cell [생성] and regenerate paths all send the photos without each call site having to remember to.
 *
 * Scope for this release: image tab and semi-auto only. Full-auto, continuous publishing, multi-account and scheduled runs
 * carry `longRunImageGeneration` / `isContinuousMode` / `isMultiAccount` (set only in fullAutoFlow.ts and
 * multiAccountManager.ts) and are left out. `isFullAuto` is NOT such a marker: the image tab sets it on its own requests.
 * Thumbnail items are also skipped by the main process; a request made only of thumbnails is not even tagged here.
 * A caller whose image is not an article picture (the thumbnail background preview) sends `noUserReference: true`.
 * A photo whose copy file is gone is found BEFORE the request (checkCodexReferenceBeforeCall): the request is not sent, the
 * photo leaves the list, and the user presses again; nothing is generated with fewer photos behind the user's back.
 * Top-level names are prefixed (codexRef…) because copy-static inlines all renderer files into one scope.
 */
import {
  CODEX_REFERENCE_ENGINE,
  codexUserReferenceOptions,
  getCodexReferenceState,
  setCodexReferenceState,
  syncCodexReferenceOwner,
  type CodexUserReferenceOptions,
} from './codexReferenceImageList.js';

/** True for requests made by an automatic publishing run (not by the image tab). */
export function isCodexReferenceExcludedRun(options: unknown): boolean {
  const record = (options ?? {}) as Record<string, unknown>;
  return record.longRunImageGeneration === true || record.isContinuousMode === true || record.isMultiAccount === true;
}

function codexRefOnlyThumbnails(items: unknown): boolean {
  return Array.isArray(items) && items.length > 0 && items.every((item) => (item as { isThumbnail?: unknown } | null)?.isThumbnail === true);
}

/** Codex engine, not already carrying photos (an empty list counts as carrying), not automatic, not opted out, not thumbnails only. */
export function shouldAttachCodexReference(options: unknown, provider: unknown): boolean {
  if (provider !== CODEX_REFERENCE_ENGINE) return false;
  const record = (options ?? {}) as Record<string, unknown>;
  if (record.userReferenceImages !== undefined) return false;
  if (record.noUserReference === true) return false;
  if (isCodexReferenceExcludedRun(record)) return false;
  return !codexRefOnlyThumbnails(record.items);
}

/** "🖼️ 참고 사진 N장(인물 a · 제품 b)을 붙여 만듭니다", or '' when there is nothing to say. */
export function describeCodexReferenceUse(photos: ReadonlyArray<{ role?: unknown }> | undefined): string {
  const list = Array.isArray(photos) ? photos : [];
  if (list.length === 0) return '';
  const person = list.filter((photo) => photo?.role === 'person').length;
  return `🖼️ 참고 사진 ${list.length}장(인물 ${person} · 제품 ${list.length - person})을 붙여 만듭니다`;
}

let codexRefUseSink: ((line: string) => void) | null = null;

/** The image tab screen registers where the "photos used" line goes (its log). */
export function setCodexReferenceUseSink(sink: ((line: string) => void) | null): void {
  codexRefUseSink = sink;
}

/** Option to merge into the request: the current post's photos (own pick or auto-reflected representative photo), or {}. */
export function resolveCodexReferenceForCall(options: unknown, provider: unknown): CodexUserReferenceOptions {
  if (!shouldAttachCodexReference(options, provider)) return {};
  const attached = codexUserReferenceOptions(provider);
  const line = describeCodexReferenceUse(attached.userReferenceImages); // only when photos are really attached, once per request
  if (line) { try { codexRefUseSink?.(line); } catch { /* a failed log line must not stop the request */ } }
  return attached;
}

// ── A photo whose copy file is gone ────────────────────────────────────────

export interface CodexReferenceMissing { path: string; name: string }
/** true = the file is there, false = clearly gone, null = could not tell (never treated as gone). */
export type CodexReferenceExists = (path: string) => Promise<boolean | null>;

/** Asks the main process (read-only) whether a copy file is still there. Only a clear "gone" is false; any doubt is null. */
export async function codexReferenceCopyExists(path: string): Promise<boolean | null> {
  try {
    const api = (window as any).api;
    if (typeof api?.referenceCopyExists !== 'function') return null;
    const result = await api.referenceCopyExists(path);
    if (!result || result.success !== true) return null;
    if (result.exists === true) return true;
    return result.reason === 'missing' || result.reason === 'not-file' ? false : null;
  } catch { return null; }
}

/**
 * Takes the user's own copied photos whose file is gone out of the list and returns them. The auto-shown representative photo
 * is not a copy (main checks it and reports its own failure). The list is read again after the checks: it may have changed.
 */
export async function pruneMissingCodexReferenceCopies(check: CodexReferenceExists = codexReferenceCopyExists): Promise<CodexReferenceMissing[]> {
  const gone: CodexReferenceMissing[] = [];
  for (const entry of getCodexReferenceState().entries.filter((item) => item.copied === true)) {
    if ((await check(entry.path)) === false) gone.push({ path: entry.path, name: entry.name });
  }
  if (gone.length === 0) return gone;
  const paths = new Set(gone.map((item) => item.path));
  const state = getCodexReferenceState();
  setCodexReferenceState({ ...state, entries: state.entries.filter((entry) => !paths.has(entry.path)) });
  return gone;
}

export function describeMissingCodexReferences(gone: readonly CodexReferenceMissing[]): string {
  return `참고 사진 '${gone.map((item) => item.name).join("', '")}' 을 찾을 수 없어 목록에서 뺐습니다. 다시 넣거나 그대로 다시 눌러 주세요.`;
}

/** Before a request carries the photos: the stop message when a photo file is gone (do not send), else null. */
export async function checkCodexReferenceBeforeCall(options: unknown, provider: unknown, check?: CodexReferenceExists): Promise<string | null> {
  if (!shouldAttachCodexReference(options, provider)) return null;
  syncCodexReferenceOwner();
  const gone = await pruneMissingCodexReferenceCopies(check);
  return gone.length > 0 ? `USER_REFERENCE_LOAD_FAILED: ${describeMissingCodexReferences(gone)}` : null;
}
