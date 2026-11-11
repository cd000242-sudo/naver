/**
 * [2026-11-11] "Reference photos" list for the Codex subscription image engine (image tab).
 * Pure rules (add / remove / role / max 3 / auto-reflect the collected representative photo / what to send)
 * plus a tiny in-memory store that lives only for the current post. Nothing is persisted: the list is cleared
 * when a publish finishes (resetAfterPublish) or a different post appears, and is gone after an app restart.
 * Copies the app made for the user's own photos are reported to a remover when they leave the list.
 * Inputs are never mutated; every function returns new objects. Top-level names are prefixed (codexRef…/CODEX_REFERENCE_…)
 * because copy-static inlines all renderer files into one scope.
 */
export type CodexReferenceRole = 'person' | 'product';

export const CODEX_REFERENCE_MAX = 3;
export const CODEX_REFERENCE_ENGINE = 'codex-image';
const CODEX_REFERENCE_AUTO_PREFIX = 'auto:';
const CODEX_REFERENCE_NOT_LOCAL = /^(https?|data|file|blob):/i;
const CODEX_REFERENCE_FAILURE = /USER_REFERENCE_(?:INVALID|LOAD_FAILED):\s*([^\r\n]+)/;

export interface CodexReferenceEntry {
  id: string;
  /** Absolute path inside an app-managed folder (the main process refuses anything else). */
  path: string;
  role: CodexReferenceRole;
  name: string;
  /** Preview only (object URL or file URL); never sent to the engine. */
  previewSrc: string;
  /** True when the app made this copy from a file the user picked: it is deleted when the entry leaves the list. */
  copied?: boolean;
}

export interface CodexReferenceState {
  entries: readonly CodexReferenceEntry[];
  /** Representative photo path the user took out — it is not auto-reflected again. */
  dismissedAutoPath: string;
  /** Which post the list belongs to (see codexReferenceContentKey); empty/undefined = no post yet. */
  ownerKey?: string;
}

export interface CodexEffectiveEntry extends CodexReferenceEntry {
  /** True for the collected representative photo shown automatically (not chosen by the user). */
  auto: boolean;
}

export const EMPTY_CODEX_REFERENCE_STATE: CodexReferenceState = Object.freeze({ entries: Object.freeze([]), dismissedAutoPath: '' });

/** Windows path -> file URL for the preview (spaces, #, ? and Korean are escaped). */
export function codexReferenceFileUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  if (CODEX_REFERENCE_NOT_LOCAL.test(value)) return value;
  return `file:///${encodeURI(value.replace(/\\/g, '/').replace(/^\/+/, '')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function codexRefBaseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

export interface CodexRepresentativeReference { path: string; name: string; previewSrc: string }

/** The shopping representative photo (isRepresentative) with a local file path; URLs cannot be sent to the engine. */
export function findCodexRepresentativeReference(collected: unknown): CodexRepresentativeReference | null {
  if (!Array.isArray(collected)) return null;
  const representative = collected.find((image) => image && typeof image === 'object' && (image as any).isRepresentative === true);
  if (!representative) return null;
  for (const key of ['localPath', 'filePath', 'referenceImagePath']) {
    const candidate = typeof representative[key] === 'string' ? representative[key].trim() : '';
    if (candidate && !CODEX_REFERENCE_NOT_LOCAL.test(candidate)) {
      return { path: candidate, name: codexRefBaseName(candidate), previewSrc: codexReferenceFileUrl(candidate) };
    }
  }
  return null;
}

function codexRefAutoEntry(state: CodexReferenceState, collected: unknown): CodexEffectiveEntry | null {
  if (state.entries.length > 0) return null;
  const found = findCodexRepresentativeReference(collected);
  if (!found || found.path === state.dismissedAutoPath) return null;
  return { id: `${CODEX_REFERENCE_AUTO_PREFIX}${found.path}`, path: found.path, role: 'product', name: found.name, previewSrc: found.previewSrc, auto: true };
}

/** What the screen shows and what is sent: the user's own photos, or (when there are none) the collected representative photo. */
export function effectiveCodexReferenceEntries(state: CodexReferenceState, collected: unknown): CodexEffectiveEntry[] {
  const auto = codexRefAutoEntry(state, collected);
  if (auto) return [auto];
  return state.entries.map((entry) => ({ ...entry, auto: false }));
}

export function addCodexReferenceEntries(
  state: CodexReferenceState,
  incoming: readonly CodexReferenceEntry[],
): { state: CodexReferenceState; accepted: number; dropped: number } {
  const next = [...state.entries];
  let dropped = 0;
  for (const entry of incoming) {
    if (next.some((existing) => existing.path === entry.path)) continue; // the same file twice is not "over the limit"
    if (next.length >= CODEX_REFERENCE_MAX) { dropped += 1; continue; }
    next.push({ ...entry });
  }
  return { state: { ...state, entries: next }, accepted: next.length - state.entries.length, dropped };
}

export function removeCodexReferenceEntry(state: CodexReferenceState, id: string, collected: unknown): CodexReferenceState {
  const auto = codexRefAutoEntry(state, collected);
  if (auto && auto.id === id) return { ...state, dismissedAutoPath: auto.path };
  if (!state.entries.some((entry) => entry.id === id)) return state;
  return { ...state, entries: state.entries.filter((entry) => entry.id !== id) };
}

/** Changing the role of the auto-shown photo turns it into the user's own photo (so it no longer follows the collection). */
export function setCodexReferenceRole(state: CodexReferenceState, id: string, role: CodexReferenceRole, collected: unknown): CodexReferenceState {
  const auto = codexRefAutoEntry(state, collected);
  if (auto && auto.id === id) {
    const { auto: _auto, ...own } = auto;
    return { ...state, entries: [{ ...own, id: `ref:${auto.path}`, role }] };
  }
  if (!state.entries.some((entry) => entry.id === id)) return state;
  return { ...state, entries: state.entries.map((entry) => (entry.id === id ? { ...entry, role } : entry)) };
}

// ── Which post the list belongs to ─────────────────────────────────────────

/**
 * Stable id of the current post. An identity issued by issueCodexReferenceKey / inherited by inheritCodexReferenceKey wins
 * (a hand-brought manuscript may later get a saved-post id and the key must not change then), else the saved post id
 * (a title edit keeps it), else a generation stamp, else '' (unknown).
 * The issued identity lives OUTSIDE the post object (a WeakMap, never a property), so saved JSON, drafts and publish
 * payloads carry no trace of it. A copy ({...post}) has no identity of its own: code that re-creates the SAME post as a
 * new object must call inheritCodexReferenceKey(previous, next).
 */
const codexRefIdentity = new WeakMap<object, string>();
let codexRefIssueCounter = 0;

export function codexReferenceContentKey(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const own = codexRefIdentity.get(content as object);
  if (own) return own;
  const record = content as Record<string, unknown>;
  const id = typeof record._postId === 'string' ? record._postId.trim() : '';
  if (id) return `post:${id}`;
  const stamp = record.generatedAt ?? record.createdAt;
  if (typeof stamp === 'string' && stamp.trim()) return `at:${stamp.trim()}`;
  if (typeof stamp === 'number' && Number.isFinite(stamp)) return `at:${stamp}`;
  return '';
}

/** Unknown current post or the same post: unchanged. First post: adopts photos added before it. Another post: emptied. */
export function reconcileCodexReferenceOwner(state: CodexReferenceState, currentKey: string): CodexReferenceState {
  if (!currentKey) return state;
  const owner = state.ownerKey ?? '';
  if (owner === currentKey) return state;
  if (owner === '') return { ...state, ownerKey: currentKey };
  return { ...EMPTY_CODEX_REFERENCE_STATE, ownerKey: currentKey };
}

/** Copies the app made that are in `prev` but no longer in `next` (the user's originals are never listed here). */
export function removedCodexReferenceCopies(prev: CodexReferenceState, next: CodexReferenceState): string[] {
  const kept = new Set(next.entries.map((entry) => entry.path));
  return prev.entries.filter((entry) => entry.copied === true && !kept.has(entry.path)).map((entry) => entry.path);
}

/** One line for the log after a URL collection: says it is in the list only when it really shows up there. */
export function describeCodexReferenceReflection(input: { poolSynced: boolean; engine: unknown; collected: unknown; userEntryCount: number }): string {
  if (!input.poolSynced) return '⚠️ 만들어 둔 글이 없어 AI 생성 참고 사진 목록에는 넣지 못했습니다';
  if (input.engine !== CODEX_REFERENCE_ENGINE) return 'ℹ️ 수집한 사진은 AI 생성 재료로 담았습니다. 참고 사진 칸은 Codex 구독 이미지를 고르면 나타납니다';
  if (input.userEntryCount > 0) return 'ℹ️ 직접 넣은 사진이 있어 그 사진만 참고로 씁니다';
  if (!findCodexRepresentativeReference(input.collected)) return 'ℹ️ 수집은 됐지만 대표 사진이 내 PC 에 저장되지 않아 참고 사진으로 쓰지 못합니다';
  return '✅ 참고 사진 칸에 대표 사진을 넣었습니다';
}

export interface CodexUserReferenceOptions {
  userReferenceImages?: Array<{ path: string; role: CodexReferenceRole }>;
}

/** Option to spread into a generateImages call: only for the Codex engine, never for a thumbnail card, never when empty. */
export function buildCodexUserReferenceOptions(request: {
  provider: unknown;
  isThumbnail?: boolean;
  state: CodexReferenceState;
  collected: unknown;
}): CodexUserReferenceOptions {
  if (request.provider !== CODEX_REFERENCE_ENGINE || request.isThumbnail === true) return {};
  const shown = effectiveCodexReferenceEntries(request.state, request.collected);
  if (shown.length === 0) return {};
  return { userReferenceImages: shown.slice(0, CODEX_REFERENCE_MAX).map((entry) => ({ path: entry.path, role: entry.role })) };
}

/** The Korean sentence the main process stopped with (after USER_REFERENCE_*:), or null for any other message. */
export function extractCodexReferenceFailure(message: unknown): string | null {
  const match = typeof message === 'string' ? CODEX_REFERENCE_FAILURE.exec(message) : null;
  return match ? match[1].trim() : null;
}

// ── Current-post store (memory only) ───────────────────────────────────────
let codexRefState: CodexReferenceState = EMPTY_CODEX_REFERENCE_STATE;
const codexRefListeners = new Set<(state: CodexReferenceState) => void>();
let codexRefCopyRemover: ((paths: string[]) => void) | null = null;

export function getCodexReferenceState(): CodexReferenceState {
  return codexRefState;
}

/** The screen registers what deletes a copy; the store calls it whenever a copied photo leaves the list. */
export function setCodexReferenceCopyRemover(remover: ((paths: string[]) => void) | null): void {
  codexRefCopyRemover = remover;
}

export function setCodexReferenceState(next: CodexReferenceState): void {
  const removed = removedCodexReferenceCopies(codexRefState, next);
  codexRefState = next;
  if (removed.length > 0) { try { codexRefCopyRemover?.(removed); } catch { /* a failed delete must not block the list */ } }
  codexRefListeners.forEach((listener) => listener(next));
}

export function subscribeCodexReferenceState(listener: (state: CodexReferenceState) => void): () => void {
  codexRefListeners.add(listener);
  return () => { codexRefListeners.delete(listener); };
}

/** The current post's collected photo pool (window data, not a bundle-scope function). */
export function codexReferenceCollectedImages(): unknown {
  try { return (window as any).currentStructuredContent?.collectedImages; } catch { return undefined; }
}

/** Gives this post object a brand-new identity (another manuscript took its place). Non-objects get ''. */
export function issueCodexReferenceKey(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const key = `m:${++codexRefIssueCounter}`;
  codexRefIdentity.set(content as object, key);
  return key;
}

/** `next` is the same post as `previous`, re-created as a new object: it keeps the previous key (issued first when there was none). */
export function inheritCodexReferenceKey(previous: unknown, next: unknown): string {
  if (!next || typeof next !== 'object') return '';
  if (!previous || typeof previous !== 'object' || previous === next) return codexReferenceContentKey(next);
  const key = codexReferenceContentKey(previous) || issueCodexReferenceKey(previous);
  codexRefIdentity.set(next as object, key);
  return key;
}

/** A post object that carries no identity at all (code brought it in: file import, draft restore, LLM JSON ...) gets one when first seen. */
function codexRefKeyOf(content: unknown): string {
  return codexReferenceContentKey(content) || issueCodexReferenceKey(content);
}

/** Looks at the current post and empties the list when it is a different post than the one the photos were put in for. */
export function syncCodexReferenceOwner(): void {
  let key = '';
  try { key = codexRefKeyOf((window as any).currentStructuredContent); } catch { key = ''; }
  const next = reconcileCodexReferenceOwner(codexRefState, key);
  if (next !== codexRefState) setCodexReferenceState(next);
}

/** Clears the list (publish finished / new work). Does nothing visible when it is already empty. */
export function clearCodexReferenceImages(): void {
  if (codexRefState.entries.length === 0 && codexRefState.dismissedAutoPath === '') return;
  setCodexReferenceState(EMPTY_CODEX_REFERENCE_STATE);
}

/** Spread into a generateImages options object at every call that can reach the Codex engine. */
export function codexUserReferenceOptions(provider: unknown, extra: { isThumbnail?: boolean } = {}): CodexUserReferenceOptions {
  syncCodexReferenceOwner();
  return buildCodexUserReferenceOptions({ provider, isThumbnail: extra.isThumbnail, state: codexRefState, collected: codexReferenceCollectedImages() });
}

/** The log line after a URL collection, read from the screen (engine select) and the store. */
export function describeCodexReferenceReflectionNow(poolSynced: boolean): string {
  let engine: unknown;
  try { engine = (document.getElementById('image-source-select') as HTMLSelectElement | null)?.value; } catch { engine = undefined; }
  return describeCodexReferenceReflection({
    poolSynced,
    engine,
    collected: codexReferenceCollectedImages(),
    userEntryCount: codexRefState.entries.length,
  });
}
