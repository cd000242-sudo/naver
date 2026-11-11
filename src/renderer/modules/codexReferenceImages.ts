/**
 * [2026-11-11] Image tab "참고 사진" block (#mgmt-codex-reference): shown only while the Codex subscription engine is selected.
 * Chosen files are read as data URLs and stored through the existing `downloadAndSaveImage` channel (the app image folder),
 * so the engine receives a path inside an app-managed folder. The list lives in memory for the current post only; when a
 * copy leaves the list the store asks this screen to delete it through `deleteReferenceCopy` (main checks the path).
 * The title row folds the block; only that screen state (not the photos) is remembered in localStorage.
 * Top-level names are prefixed (codexRef…) because copy-static inlines every renderer file into one scope.
 */
import { IMAGE_SETTINGS_CHANGED_EVENT } from '../../runtime/imageSettingsSync.js';
import { describeMissingCodexReferences, pruneMissingCodexReferenceCopies, setCodexReferenceUseSink } from '../utils/codexReferenceCentral.js';
import {
  CODEX_REFERENCE_ENGINE,
  CODEX_REFERENCE_MAX,
  addCodexReferenceEntries,
  codexReferenceCollectedImages,
  effectiveCodexReferenceEntries,
  extractCodexReferenceFailure,
  getCodexReferenceState,
  removeCodexReferenceEntry,
  setCodexReferenceCopyRemover,
  setCodexReferenceRole,
  setCodexReferenceState,
  subscribeCodexReferenceState,
  syncCodexReferenceOwner,
  type CodexEffectiveEntry,
  type CodexReferenceEntry,
  type CodexReferenceRole,
} from '../utils/codexReferenceImageList.js';

type CodexRefNotify = (message: string, kind: 'success' | 'error') => void;
interface CodexRefApi {
  downloadAndSaveImage?: (imageUrl: string, heading: string, postTitle?: string) => Promise<{ success: boolean; filePath?: string; message?: string }>;
  deleteReferenceCopy?: (filePath: string) => Promise<unknown>;
}
export interface CodexRefDeps {
  api?: CodexRefApi;
  readAsDataUrl?: (file: File) => Promise<string>;
}

const CODEX_REF_MAX_BYTES = 20 * 1024 * 1024;
const CODEX_REF_FOLDER_TITLE = '참고 사진';
const CODEX_REF_TOAST_GAP_MS = 8000;
const CODEX_REF_COLLAPSE_KEY = 'codexReferenceCollapsed';
let codexRefNotify: CodexRefNotify = () => undefined;
let codexRefRender: () => void = () => undefined;
let codexRefLastReport = { message: '', at: 0 };
let codexRefIdCounter = 0;
let codexRefStartupCleaned = false;

// The image tab log lives in the same bundle scope (imageManagerCore writes to it the same way).
declare function appendLog(message: string, targetId?: string): void;
function codexRefLog(line: string): void {
  if (typeof appendLog === 'function') appendLog(line, 'images-log-output');
  else console.log(line);
}

function codexRefReadFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** A small address for the preview (not the whole picture as text); falls back to the data URL only without object URLs. */
function codexRefPreview(file: File, dataUrl: string): string {
  try { if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') return URL.createObjectURL(file); } catch { /* use the data URL */ }
  return dataUrl;
}

function codexRefReadCollapsed(): boolean {
  try { return localStorage.getItem(CODEX_REF_COLLAPSE_KEY) === '1'; } catch { return false; }
}
function codexRefWriteCollapsed(collapsed: boolean): void {
  try { localStorage.setItem(CODEX_REF_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* the fold is a convenience only */ }
}

function codexRefHeading(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || '참고 사진';
}

function codexRefButton(label: string, attrs: Record<string, string>, pressed?: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.entries(attrs).forEach(([key, value]) => button.setAttribute(key, value));
  if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
  const active = pressed === true;
  button.style.cssText = `flex:1; min-height:36px; padding:0.35rem 0.6rem; border-radius:6px; font-size:0.85rem; font-weight:700; cursor:pointer; border:1px solid var(--border-medium); background:${active ? 'var(--primary, #8d7be8)' : 'var(--bg-tertiary)'}; color:${active ? '#fff' : 'var(--text-strong)'};`;
  return button;
}

function codexRefCard(entry: CodexEffectiveEntry): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute('data-ref-id', entry.id);
  card.style.cssText = 'width:150px; display:flex; flex-direction:column; gap:6px; padding:8px; border:1px solid var(--border-medium); border-radius:8px;';
  const image = document.createElement('img');
  image.alt = entry.name;
  image.src = entry.previewSrc;
  image.style.cssText = 'width:100%; height:100px; object-fit:cover; border-radius:6px; background:var(--bg-tertiary);';
  const caption = document.createElement('div');
  caption.textContent = entry.auto ? '수집한 대표 사진' : entry.name;
  caption.style.cssText = 'font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
  caption.title = entry.name;
  const roles = document.createElement('div');
  roles.setAttribute('role', 'group');
  roles.setAttribute('aria-label', '사진 종류');
  roles.style.cssText = 'display:flex; gap:6px;';
  roles.append(
    codexRefButton('인물', { 'data-role': 'person' }, entry.role === 'person'),
    codexRefButton('제품', { 'data-role': 'product' }, entry.role === 'product'),
  );
  const remove = codexRefButton('빼기', { 'data-action': 'remove' });
  remove.style.flex = 'none';
  card.append(image, caption, roles, remove);
  return card;
}

/** The line under the title row. The title row already says "없음" or "N/3장", so this one only guides (empty or at the limit otherwise). */
export function codexReferenceStatusText(userCount: number, shown: number): string {
  if (userCount >= CODEX_REFERENCE_MAX) return `최대 ${CODEX_REFERENCE_MAX}장`;
  if (shown === 0) return `[사진 추가]로 최대 ${CODEX_REFERENCE_MAX}장까지 넣어요`;
  return '';
}

/** Re-draws the block from the store (also reads the engine select, so it is safe to call at any time). */
export function refreshCodexReferenceImages(): void {
  codexRefRender();
}

/** Tells the user, once per message in a short window, why the Codex reference photos stopped the run. */
export function reportCodexReferenceFailure(message: unknown): void {
  const text = extractCodexReferenceFailure(message);
  if (!text) return;
  const now = Date.now();
  if (text === codexRefLastReport.message && now - codexRefLastReport.at < CODEX_REF_TOAST_GAP_MS) return;
  codexRefLastReport = { message: text, at: now };
  codexRefNotify(text, 'error');
  // A photo that could not be read: take the ones whose copy file is gone out of the list so the next press does not fail again.
  if (/USER_REFERENCE_LOAD_FAILED/.test(String(message))) {
    void pruneMissingCodexReferenceCopies()
      .then((gone) => { if (gone.length > 0) codexRefNotify(describeMissingCodexReferences(gone), 'error'); })
      .catch(() => undefined);
  }
}

export function bindCodexReferenceImages(notify: CodexRefNotify, deps: CodexRefDeps = {}): void {
  const block = document.getElementById('mgmt-codex-reference');
  const list = document.getElementById('mgmt-codex-reference-list');
  const addButton = document.getElementById('mgmt-codex-reference-add') as HTMLButtonElement | null;
  const fileInput = document.getElementById('mgmt-codex-reference-file') as HTMLInputElement | null;
  const status = document.getElementById('mgmt-codex-reference-status');
  const toggle = document.getElementById('mgmt-codex-reference-toggle');
  const body = document.getElementById('mgmt-codex-reference-body');
  const count = document.getElementById('mgmt-codex-reference-count');
  const arrow = document.getElementById('mgmt-codex-reference-arrow');
  const select = document.getElementById('image-source-select') as HTMLSelectElement | null;
  if (!block || !list || !addButton || !fileInput) return;
  codexRefNotify = notify;
  const apiOf = (): CodexRefApi | undefined => deps.api ?? (window as any).api;
  const previews = new Map<string, string>();
  let pending = 0;
  let queue: Promise<void> = Promise.resolve();
  let collapsed = codexRefReadCollapsed();
  let lastShown = 0;

  const paintFold = (): void => {
    if (body) body.hidden = collapsed;
    toggle?.setAttribute('aria-expanded', String(!collapsed));
    if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
  };

  const render = (): void => {
    syncCodexReferenceOwner(); // a different post empties the list first (this may re-enter render once)
    block.style.display = select?.value === CODEX_REFERENCE_ENGINE ? '' : 'none';
    const state = getCodexReferenceState();
    const shown = effectiveCodexReferenceEntries(state, codexReferenceCollectedImages());
    list.replaceChildren(...shown.map(codexRefCard));
    addButton.disabled = pending > 0 || state.entries.length >= CODEX_REFERENCE_MAX;
    if (status) status.textContent = codexReferenceStatusText(state.entries.length, shown.length);
    if (count) count.textContent = shown.length === 0 ? '없음' : `${shown.length}/${CODEX_REFERENCE_MAX}장`;
    // A photo coming in (own pick or the auto-reflected representative photo) opens a folded block.
    if (shown.length > lastShown && collapsed) { collapsed = false; codexRefWriteCollapsed(false); }
    lastShown = shown.length;
    paintFold();
  };
  codexRefRender = render;

  const dropCopy = (path: string): void => {
    const preview = previews.get(path);
    if (preview) { try { URL.revokeObjectURL(preview); } catch { /* already gone */ } previews.delete(path); }
    void Promise.resolve(apiOf()?.deleteReferenceCopy?.(path)).catch(() => undefined);
  };
  // Every copied photo that leaves the list (remove, new post, publish finished) loses its copy; originals are never touched.
  setCodexReferenceCopyRemover((paths) => paths.forEach(dropCopy));
  // "참고 사진 N장을 붙여 만듭니다": the central request decision reports here when photos are really attached.
  setCodexReferenceUseSink(codexRefLog);
  // Once per app start the list is empty, so every file a previous run left in the copy folder is stale.
  if (!codexRefStartupCleaned) {
    codexRefStartupCleaned = true;
    const cleanApi = apiOf() as { clearReferenceCopies?: () => Promise<{ deleted?: number; failed?: number }> } | undefined;
    void Promise.resolve(cleanApi?.clearReferenceCopies?.())
      .then((result) => { if (result && (result.deleted ?? 0) > 0) codexRefLog(`🧹 지난번 참고 사진 사본 ${result.deleted}개를 정리했습니다${result.failed ? ` (못 지운 ${result.failed}개)` : ''}`); })
      .catch(() => undefined);
  }

  const addFiles = async (files: File[]): Promise<void> => {
    syncCodexReferenceOwner();
    const read = deps.readAsDataUrl ?? codexRefReadFile;
    const room = Math.max(0, CODEX_REFERENCE_MAX - getCodexReferenceState().entries.length);
    if (room === 0) { notify(`참고 사진은 최대 ${CODEX_REFERENCE_MAX}장입니다. 먼저 [빼기]로 자리를 비워 주세요.`, 'error'); return; }
    if (files.length > room) notify(`참고 사진은 최대 ${CODEX_REFERENCE_MAX}장입니다. 앞의 ${room}장만 넣습니다.`, 'error');
    const made: CodexReferenceEntry[] = [];
    for (const file of files.slice(0, room)) {
      try {
        if (!/^image\//i.test(file.type)) throw new Error('사진 파일이 아닙니다.');
        if (file.size > CODEX_REF_MAX_BYTES) throw new Error('사진이 너무 큽니다(20MB 이하).');
        const dataUrl = await read(file);
        const saved = await apiOf()?.downloadAndSaveImage?.(dataUrl, codexRefHeading(file.name), CODEX_REF_FOLDER_TITLE);
        if (!saved?.success || !saved.filePath) throw new Error(saved?.message || '앱 폴더에 보관하지 못했습니다.');
        const previewSrc = codexRefPreview(file, dataUrl);
        if (previewSrc.startsWith('blob:')) previews.set(saved.filePath, previewSrc);
        made.push({ id: `ref-${Date.now()}-${++codexRefIdCounter}`, path: saved.filePath, role: 'product', name: file.name, previewSrc, copied: true });
      } catch (error) {
        notify(`${file.name}: ${(error as Error)?.message || '넣지 못했습니다.'}`, 'error');
      }
    }
    if (made.length === 0) return;
    // A photo chosen while the collected representative photo was shown replaces it (user photos win).
    const result = addCodexReferenceEntries(getCodexReferenceState(), made);
    setCodexReferenceState(result.state);
    syncCodexReferenceOwner(); // the first post adopts photos put in before it existed
    const kept = new Set(result.state.entries.map((entry) => entry.path));
    made.filter((entry) => !kept.has(entry.path)).forEach((entry) => dropCopy(entry.path));
  };

  // Picks made while an earlier one is still being stored wait their turn; nothing is thrown away silently.
  const enqueue = (files: File[]): Promise<void> => {
    if (files.length === 0) return Promise.resolve();
    pending += 1; render();
    queue = queue.then(() => addFiles(files)).catch(() => undefined).finally(() => { pending -= 1; render(); });
    return queue;
  };

  toggle?.addEventListener('click', () => { collapsed = !collapsed; codexRefWriteCollapsed(collapsed); paintFold(); });
  addButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const chosen = Array.from(fileInput.files ?? []);
    void enqueue(chosen).finally(() => { try { fileInput.value = ''; } catch { /* some engines forbid resetting */ } });
  });
  list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const card = target?.closest('[data-ref-id]') as HTMLElement | null;
    const id = card?.getAttribute('data-ref-id');
    if (!target || !id) return;
    const collected = codexReferenceCollectedImages();
    const role = target.closest('[data-role]')?.getAttribute('data-role') as CodexReferenceRole | null;
    if (role === 'person' || role === 'product') setCodexReferenceState(setCodexReferenceRole(getCodexReferenceState(), id, role, collected));
    else if (target.closest('[data-action="remove"]')) setCodexReferenceState(removeCodexReferenceEntry(getCodexReferenceState(), id, collected));
  });
  select?.addEventListener('change', render);
  // The engine may also be changed by code (settings sync) while this block is hidden: look again on that notice.
  window.addEventListener(IMAGE_SETTINGS_CHANGED_EVENT, render);
  subscribeCodexReferenceState(render);
  // The hidden block never intersects anything, so watch the always-visible engine select: it shows when the tab opens.
  if (typeof IntersectionObserver === 'function') new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) render(); }).observe(select ?? block);
  render();
}
