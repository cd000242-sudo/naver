// [2026-11-11] Codex reference photos: remaining limits (re-fill after blank, whole-selection input, identity kept outside the
// manuscript object, same-post continuity, thumbnail preview skip, log line, copy cleanup, vanished photo files).
import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
  EMPTY_CODEX_REFERENCE_STATE,
  codexReferenceContentKey,
  getCodexReferenceState,
  inheritCodexReferenceKey,
  issueCodexReferenceKey,
  setCodexReferenceCopyRemover,
  setCodexReferenceState,
  syncCodexReferenceOwner,
} from '../renderer/utils/codexReferenceImageList';
import {
  checkCodexReferenceBeforeCall,
  codexReferenceCopyExists,
  describeCodexReferenceUse,
  pruneMissingCodexReferenceCopies,
  resolveCodexReferenceForCall,
  setCodexReferenceUseSink,
  shouldAttachCodexReference,
} from '../renderer/utils/codexReferenceCentral';
import { bindManuscriptBodyWatch, isManuscriptInsertInput, isWholeSelectionInsert, observeBodyFill } from '../renderer/utils/importedManuscriptStamp';
import {
  clearReferenceCopyFolders,
  referenceCopyExists,
  REFERENCE_COPY_FOLDER,
  type ReferenceCopyClearDeps,
} from '../main/ipc/referenceCopyDelete';

const read = (...parts: string[]): string => readFileSync(path.join(process.cwd(), ...parts), 'utf8');
const entry = (name: string, copied = true) => ({ id: `id-${name}`, path: path.resolve('refs', name), role: 'product' as const, name, previewSrc: '', copied });

type Handler = (event: Record<string, unknown>) => void;
function fakeBox(value: string, start = 0, end = value.length) {
  const handlers = new Map<string, Handler[]>();
  return {
    value, selectionStart: start as number | null, selectionEnd: end as number | null,
    addEventListener: (name: string, handler: Handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    fire: (name: string, event: Record<string, unknown> = {}) => (handlers.get(name) ?? []).forEach((handler) => handler(event)),
  };
}
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.ts$/.test(name) ? [full] : [];
  });
}

afterEach(() => {
  setCodexReferenceUseSink(null);
  setCodexReferenceCopyRemover(null);
  setCodexReferenceState(EMPTY_CODEX_REFERENCE_STATE);
  delete (globalThis as any).window;
});

describe('limit 1 · body emptied then refilled', () => {
  it('observeBodyFill: refill after blank is a new manuscript; first fill, undo and key change are not', () => {
    const first = observeBodyFill(null, 'k1', '', undefined);
    expect(first.state).toEqual({ key: 'k1', hadContent: false, blanked: false });
    expect(observeBodyFill(first.state, 'k1', '처음 본문', 'insertText').newManuscript).toBe(false); // title first, body later
    const filled = observeBodyFill(first.state, 'k1', '본문', 'insertText').state;
    const blank = observeBodyFill(filled, 'k1', ' \n ', 'deleteContentBackward');
    expect(blank.state.blanked).toBe(true);
    expect(observeBodyFill(blank.state, 'k1', '새 원고', 'insertText').newManuscript).toBe(true);
    expect(observeBodyFill(blank.state, 'k1', '되돌린 본문', 'historyUndo').newManuscript).toBe(false);
    expect(observeBodyFill(blank.state, 'k2', '새 원고', 'insertText').newManuscript).toBe(false);
    expect(observeBodyFill(first.state, 'k1', '', 'deleteContentBackward').state.blanked).toBe(false);
  });

  it('binding: blank then refill issues a new identity; first fill and Ctrl+Z keep it; the manuscript object stays untouched', () => {
    const content: Record<string, unknown> = { title: '글' };
    const key = issueCodexReferenceKey(content);
    const box = fakeBox('앞 글 본문', 5, 5);
    bindManuscriptBodyWatch(box as any, () => content);
    box.value = ''; box.fire('input', { inputType: 'deleteContentBackward' });
    box.value = '되돌림'; box.fire('input', { inputType: 'historyUndo' });
    expect(codexReferenceContentKey(content)).toBe(key);
    box.value = ''; box.fire('input', { inputType: 'deleteByCut' });
    box.value = '새 원고'; box.fire('input', { inputType: 'insertText' });
    expect(codexReferenceContentKey(content)).not.toBe(key);
    expect(Object.keys(content)).toEqual(['title']);

    const second: Record<string, unknown> = { title: '둘째' };
    const secondKey = issueCodexReferenceKey(second);
    const empty = fakeBox('', 0, 0);
    bindManuscriptBodyWatch(empty as any, () => second);
    empty.value = '처음 본문'; empty.fire('input', { inputType: 'insertText' });
    expect(codexReferenceContentKey(second)).toBe(secondKey);
  });
});

describe('limit 2 · input over a fully selected body', () => {
  it('decision: insert types count, IME composition and deletes do not', () => {
    for (const type of ['insertText', 'insertFromPaste', 'insertFromDrop', 'insertReplacementText']) expect(isManuscriptInsertInput(type)).toBe(true);
    expect(isManuscriptInsertInput('insertCompositionText')).toBe(false);
    expect(isManuscriptInsertInput('insertText', true)).toBe(false);
    expect(isManuscriptInsertInput('deleteContentBackward')).toBe(false);
    expect(isWholeSelectionInsert({ value: 'abc', selectionStart: 0, selectionEnd: 3 }, 'insertText', false)).toBe(true);
    expect(isWholeSelectionInsert({ value: 'abc', selectionStart: 1, selectionEnd: 3 }, 'insertText', false)).toBe(false);
    expect(isWholeSelectionInsert({ value: 'abc', selectionStart: 3, selectionEnd: 3 }, 'insertFromDrop', false)).toBe(false);
  });

  it('binding: typing/drop over the whole body renews; caret typing and mid-composition updates do not; composition start renews once', () => {
    const content: Record<string, unknown> = {};
    const start = issueCodexReferenceKey(content);
    const box = fakeBox('앞 글 본문');
    bindManuscriptBodyWatch(box as any, () => content);
    box.selectionStart = 5; box.selectionEnd = 5;
    box.fire('beforeinput', { inputType: 'insertText' });
    box.selectionStart = 1; box.selectionEnd = 3;
    box.fire('beforeinput', { inputType: 'insertFromDrop' });
    box.selectionStart = 0; box.selectionEnd = 6;
    box.fire('beforeinput', { inputType: 'insertCompositionText', isComposing: true });
    expect(codexReferenceContentKey(content)).toBe(start);
    box.fire('compositionstart');
    const afterStart = codexReferenceContentKey(content);
    expect(afterStart).not.toBe(start);
    box.fire('beforeinput', { inputType: 'insertCompositionText', isComposing: true });
    expect(codexReferenceContentKey(content)).toBe(afterStart);
    box.fire('beforeinput', { inputType: 'insertText' });
    expect(codexReferenceContentKey(content)).not.toBe(afterStart);
  });
});

describe('limit 3 · identity lives outside the manuscript', () => {
  it('a key-less manuscript gets its own identity (nothing written onto it), so the previous photos are dropped; keyed ones are left alone', () => {
    const removed: string[][] = [];
    setCodexReferenceCopyRemover((paths) => removed.push(paths));
    const photo = entry('a.png');
    setCodexReferenceState({ entries: [photo], dismissedAutoPath: '', ownerKey: 'post:old' });
    const next: Record<string, unknown> = { title: '불러온 글' };
    (globalThis as any).window = { currentStructuredContent: next };
    syncCodexReferenceOwner();
    expect(Object.keys(next)).toEqual(['title']);
    expect(codexReferenceContentKey(next)).not.toBe('');
    expect(getCodexReferenceState().entries).toHaveLength(0);
    expect(removed).toEqual([[photo.path]]);
    const key = codexReferenceContentKey(next);
    syncCodexReferenceOwner();
    expect(codexReferenceContentKey(next)).toBe(key);
    const keyed: Record<string, unknown> = { _postId: 'p1' };
    (globalThis as any).window = { currentStructuredContent: keyed };
    syncCodexReferenceOwner();
    expect(codexReferenceContentKey(keyed)).toBe('post:p1');
  });

  it('photos put in before the first manuscript exists are kept by that manuscript', () => {
    setCodexReferenceState({ entries: [entry('a.png')], dismissedAutoPath: '' });
    (globalThis as any).window = { currentStructuredContent: { title: '첫 글' } };
    syncCodexReferenceOwner();
    expect(getCodexReferenceState().entries).toHaveLength(1);
  });

  it('a re-created copy of the SAME post keeps the photos only when it inherits the key', () => {
    const live: Record<string, unknown> = { title: '글' };
    (globalThis as any).window = { currentStructuredContent: live };
    syncCodexReferenceOwner();
    setCodexReferenceState({ ...getCodexReferenceState(), entries: [entry('a.png')] });
    const copy = { ...live, bodyPlain: '고친 본문' };
    expect(inheritCodexReferenceKey(live, copy)).toBe(codexReferenceContentKey(live));
    (globalThis as any).window = { currentStructuredContent: copy };
    syncCodexReferenceOwner();
    expect(getCodexReferenceState().entries).toHaveLength(1);
    const stranger = { ...copy, bodyPlain: '다른 글' };
    (globalThis as any).window = { currentStructuredContent: stranger };
    syncCodexReferenceOwner();
    expect(getCodexReferenceState().entries).toHaveLength(0); // no inherit = another post
    expect(inheritCodexReferenceKey(null, {})).toBe('');
    const same = {};
    expect(inheritCodexReferenceKey(same, same)).toBe('');
    expect(inheritCodexReferenceKey({}, null)).toBe('');
  });

  it('no identity is ever written onto a post: nothing in the app source touches _importedAt, and the re-creating paths call inherit', () => {
    for (const file of [...walk('src/renderer'), ...walk('src/main'), 'src/preload.ts']) {
      expect(read(file), file).not.toContain('_importedAt');
    }
    expect(read('src', 'renderer', 'modules', 'headingImageGen.ts')).toContain('inheritCodexReferenceKey(live, target)');
    expect(read('src', 'renderer', 'modules', 'publishingHandlers.ts')).toContain('inheritCodexReferenceKey(structuredContent, updatedStructuredContent)');
    expect(read('src', 'renderer', 'modules', 'contentGeneration.ts')).not.toMatch(/inheritCodexReferenceKey|issueCodexReferenceKey/);
  });
});

describe('limits 4 and 6 · central decision and log line', () => {
  it('a request marked noUserReference (thumbnail background preview) never gets photos', () => {
    expect(shouldAttachCodexReference({ items: [{ isThumbnail: false }] }, 'codex-image')).toBe(true);
    expect(shouldAttachCodexReference({ items: [{ isThumbnail: false }], noUserReference: true }, 'codex-image')).toBe(false);
    expect(read('src', 'renderer', 'modules', 'thumbnailPreview.ts')).toMatch(/noUserReference:\s*true/);
  });

  it('describes the photos in one short Korean line, once per request that really carries them', () => {
    const photos = [{ path: 'a', role: 'person' as const }, { path: 'b', role: 'product' as const }, { path: 'c', role: 'product' as const }];
    expect(describeCodexReferenceUse(photos)).toBe('🖼️ 참고 사진 3장(인물 1 · 제품 2)을 붙여 만듭니다');
    expect(describeCodexReferenceUse([])).toBe('');
    const lines: string[] = [];
    setCodexReferenceUseSink((line) => lines.push(line));
    setCodexReferenceState({ entries: [{ ...entry('a.png'), role: 'person' }], dismissedAutoPath: '' });
    const first = resolveCodexReferenceForCall({ items: [{ heading: 'h' }] }, 'codex-image');
    expect(first.userReferenceImages).toHaveLength(1);
    expect(lines).toEqual(['🖼️ 참고 사진 1장(인물 1 · 제품 0)을 붙여 만듭니다']);
    resolveCodexReferenceForCall({ items: [{ heading: 'h' }], userReferenceImages: first.userReferenceImages }, 'codex-image');
    resolveCodexReferenceForCall({ items: [{ heading: 'h' }] }, 'openai-image');
    expect(lines).toHaveLength(1);
  });
});

describe('limit 7 · copies left in the folder by a previous run', () => {
  const root = path.resolve('ref-test-root');
  const folder = path.join(root, REFERENCE_COPY_FOLDER);
  function makeDeps(extra: Partial<ReferenceCopyClearDeps> & { names?: string[]; kinds?: Record<string, string>; links?: Record<string, string> } = {}) {
    const unlinked: string[] = [];
    const kinds = extra.kinds ?? {};
    const links = extra.links ?? {};
    const deps: ReferenceCopyClearDeps = {
      roots: [root],
      realpath: async (target) => { if (links[target]) return links[target]; if (target === root || target === folder) return target; throw Object.assign(new Error('nope'), { code: 'ENOENT' }); },
      readdir: async () => extra.names ?? [],
      lstat: async (target) => ({ isFile: () => (kinds[path.basename(target)] ?? 'file') === 'file', isSymbolicLink: () => kinds[path.basename(target)] === 'link' }),
      unlink: async (target) => { if (path.basename(target) === 'locked.png') throw new Error('EBUSY'); unlinked.push(path.basename(target)); },
      ...extra,
    };
    return { deps, unlinked };
  }

  it('removes only regular files directly inside the folder and counts the rest', async () => {
    const { deps, unlinked } = makeDeps({ names: ['a.png', 'b.png', 'sub', 'ln.png', 'locked.png'], kinds: { sub: 'dir', 'ln.png': 'link' } });
    const result = await clearReferenceCopyFolders(deps);
    expect(unlinked).toEqual(['a.png', 'b.png']);
    expect(result).toMatchObject({ success: true, deleted: 2, skipped: 2, failed: 1 });
  });

  it('refuses a folder whose real path leaves the allowed root, and survives a missing folder', async () => {
    const escaped = makeDeps({ names: ['a.png'], links: { [folder]: path.resolve('elsewhere', REFERENCE_COPY_FOLDER) } });
    expect(await clearReferenceCopyFolders(escaped.deps)).toMatchObject({ deleted: 0 });
    expect(escaped.unlinked).toEqual([]);
    const missing = makeDeps({ names: ['a.png'] });
    missing.deps.realpath = async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
    expect(await clearReferenceCopyFolders(missing.deps)).toMatchObject({ success: true, deleted: 0 });
  });
});

describe('limit 8 · a photo whose file is gone', () => {
  const root = path.resolve('ref-test-root');
  const folder = path.join(root, REFERENCE_COPY_FOLDER);
  const here = path.join(folder, 'here.png');
  const existsDeps = (overrides: Record<string, unknown> = {}) => ({
    roots: [root],
    realpath: async (target: string) => {
      if (target === root || target === folder || target === here) return target;
      if (target in overrides) { const value = overrides[target]; if (value instanceof Error) throw value; return value as string; }
      throw Object.assign(new Error('gone'), { code: 'ENOENT' });
    },
    stat: async (target: string) => ({ isFile: () => !/dir$/.test(target) }),
  });

  it('referenceCopyExists is read-only and true only for a regular file inside the folder', async () => {
    expect(await referenceCopyExists(here, existsDeps())).toEqual({ success: true, exists: true });
    expect(await referenceCopyExists(path.join(folder, 'gone.png'), existsDeps())).toEqual({ success: true, exists: false, reason: 'missing' });
    const outside = path.resolve('elsewhere', 'x.png');
    expect(await referenceCopyExists(outside, existsDeps({ [outside]: outside }))).toEqual({ success: true, exists: false, reason: 'outside' });
    const dir = path.join(folder, 'adir');
    expect(await referenceCopyExists(dir, existsDeps({ [dir]: dir }))).toEqual({ success: true, exists: false, reason: 'not-file' });
    expect(await referenceCopyExists('relative.png', existsDeps())).toMatchObject({ success: false, exists: false });
    expect(await referenceCopyExists(42, existsDeps())).toMatchObject({ success: false });
    const denied = path.join(folder, 'denied.png');
    expect(await referenceCopyExists(denied, existsDeps({ [denied]: Object.assign(new Error('x'), { code: 'EACCES' }) }))).toMatchObject({ success: false });
  });

  it('the screen treats only a clear "gone" as gone', async () => {
    (globalThis as any).window = { api: { referenceCopyExists: async (p: string) => ({ success: true, exists: false, reason: p.includes('out') ? 'outside' : 'missing' }) } };
    expect(await codexReferenceCopyExists('C:\\x\\a.png')).toBe(false);
    expect(await codexReferenceCopyExists('C:\\x\\out.png')).toBeNull();
    (globalThis as any).window = { api: {} };
    expect(await codexReferenceCopyExists('C:\\x\\a.png')).toBeNull();
    (globalThis as any).window = { api: { referenceCopyExists: async () => { throw new Error('ipc'); } } };
    expect(await codexReferenceCopyExists('C:\\x\\a.png')).toBeNull();
  });

  it('a vanished photo stops the request, leaves the list (its remover runs), and the next press goes on with the rest', async () => {
    const removed: string[][] = [];
    setCodexReferenceCopyRemover((paths) => removed.push(paths));
    const gone = entry('사라진.png');
    const kept = entry('남은.png');
    setCodexReferenceState({ entries: [gone, kept], dismissedAutoPath: '' });
    const checked: string[] = [];
    const check = async (p: string) => { checked.push(p); return p === gone.path ? false : true; };
    const message = await checkCodexReferenceBeforeCall({ items: [{ heading: 'h' }] }, 'codex-image', check);
    expect(message).toBe("USER_REFERENCE_LOAD_FAILED: 참고 사진 '사라진.png' 을 찾을 수 없어 목록에서 뺐습니다. 다시 넣거나 그대로 다시 눌러 주세요.");
    expect(getCodexReferenceState().entries.map((e) => e.path)).toEqual([kept.path]);
    expect(removed).toEqual([[gone.path]]);
    expect(await checkCodexReferenceBeforeCall({ items: [{ heading: 'h' }] }, 'codex-image', check)).toBeNull();
    expect(getCodexReferenceState().entries).toHaveLength(1);
  });

  it('does not decide on doubt, skips the user\'s originals and requests that carry no photos', async () => {
    const original = entry('원본.png', false);
    const copy = entry('복사.png');
    setCodexReferenceState({ entries: [original, copy], dismissedAutoPath: '' });
    const checked: string[] = [];
    const doubt = async (p: string) => { checked.push(p); return null; };
    expect(await pruneMissingCodexReferenceCopies(doubt)).toEqual([]);
    expect(checked).toEqual([copy.path]);
    expect(getCodexReferenceState().entries).toHaveLength(2);
    const never = async () => { throw new Error('must not be asked'); };
    expect(await checkCodexReferenceBeforeCall({ items: [{ heading: 'h' }] }, 'openai-image', never)).toBeNull();
    expect(await checkCodexReferenceBeforeCall({ items: [{ heading: 'h' }], noUserReference: true }, 'codex-image', never)).toBeNull();
  });

  it('is wired: central check before the photos are attached, handler, preload, typings, panel prune on a main failure', () => {
    const cost = read('src', 'renderer', 'modules', 'costAndAutoGen.ts');
    const check = cost.indexOf('await checkCodexReferenceBeforeCall(options, provider)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(cost.indexOf('resolveCodexReferenceForCall(options, provider)'));
    expect(cost.slice(check, check + 260)).toContain('success: false');
    expect(read('src', 'main', 'ipc', 'imageDownloadHandlers.ts')).toContain("'image:referenceCopyExists'");
    expect(read('src', 'main', 'ipc', 'imageDownloadHandlers.ts')).toContain("'image:clearReferenceCopies'");
    expect(read('src', 'preload.ts')).toContain("ipcRenderer.invoke('image:referenceCopyExists'");
    expect(read('src', 'preload.ts')).toContain("ipcRenderer.invoke('image:clearReferenceCopies'");
    const typings = read('src', 'renderer', 'global.d.ts');
    expect(typings).toContain('referenceCopyExists:');
    expect(typings).toContain('clearReferenceCopies:');
    const panel = read('src', 'renderer', 'modules', 'codexReferenceImages.ts');
    expect(panel).toContain('pruneMissingCodexReferenceCopies()');
    expect(panel).toContain('clearReferenceCopies');
    expect(panel).toContain('setCodexReferenceUseSink');
    expect(read('src', 'renderer', 'renderer.ts')).toContain('bindManuscriptBodyWatch(semiAutoContent');
  });
});
