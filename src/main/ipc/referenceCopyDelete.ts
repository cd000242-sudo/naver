// src/main/ipc/referenceCopyDelete.ts
// [2026-11-11] Deletes the copy the app made for a Codex reference photo (image tab "참고 사진").
// The renderer only sends a path; this side decides. A file is removed only when its REAL path (symlinks resolved)
// is a regular file inside the app image folder's "참고_사진" sub-folder. Anything else is refused and left alone.
// The user's original photo is never a candidate: copies live only in that folder.
import * as path from 'path';

/** Folder name the renderer's downloadAndSaveImage call produces for the title "참고 사진" (spaces become "_"). */
export const REFERENCE_COPY_FOLDER = '참고_사진'.normalize('NFC');

export interface ReferenceCopyDeps {
  /** Image base folders (configured save folder and the Downloads fallback). */
  roots: readonly string[];
  realpath(target: string): Promise<string>;
  stat(target: string): Promise<{ isFile(): boolean }>;
  unlink(target: string): Promise<void>;
}

export interface ReferenceCopyResult { success: boolean; deleted?: boolean; message?: string }

const refuse = (message: string): ReferenceCopyResult => ({ success: false, message });
const fold = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);

function isInside(folder: string, target: string): boolean {
  const relative = path.relative(fold(folder), fold(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function deleteReferenceCopy(rawPath: unknown, deps: ReferenceCopyDeps): Promise<ReferenceCopyResult> {
  const requested = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!requested || requested.includes('\0') || !path.isAbsolute(requested)) return refuse('참고 사진 사본 경로가 올바르지 않습니다.');
  let real: string;
  try { real = await deps.realpath(path.normalize(requested)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { success: true, deleted: false };
    return refuse('참고 사진 사본을 확인하지 못했습니다.');
  }
  const folders: string[] = [];
  for (const root of deps.roots) {
    try { folders.push(await deps.realpath(path.join(root, REFERENCE_COPY_FOLDER))); } catch { /* this root has no such folder */ }
  }
  if (!folders.some((folder) => isInside(folder, real))) return refuse('참고 사진 폴더 밖의 파일은 지우지 않습니다.');
  try {
    if (!(await deps.stat(real)).isFile()) return refuse('일반 파일이 아니어서 지우지 않습니다.');
    await deps.unlink(real);
    return { success: true, deleted: true };
  } catch (error) {
    return refuse(`사본을 지우지 못했습니다: ${(error as Error)?.message || '알 수 없는 오류'}`);
  }
}

// ── Start-up cleanup: copies left by a previous run ───────────────────────────
// The list lives in memory only, so right after the app starts every file in a "참고_사진" folder is a stale copy.
// Only regular files DIRECTLY inside the folder are removed (no sub-folders, no links); the folder's real path must be the
// "참고_사진" folder inside an allowed root; the folder itself is kept. Failures are counted, never thrown.
export interface ReferenceCopyClearDeps {
  roots: readonly string[];
  realpath(target: string): Promise<string>;
  readdir(target: string): Promise<string[]>;
  lstat(target: string): Promise<{ isFile(): boolean; isSymbolicLink(): boolean }>;
  unlink(target: string): Promise<void>;
}

export interface ReferenceCopyClearResult { success: boolean; deleted: number; skipped: number; failed: number }

export async function clearReferenceCopyFolders(deps: ReferenceCopyClearDeps): Promise<ReferenceCopyClearResult> {
  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  const done = new Set<string>();
  for (const root of deps.roots) {
    let rootReal: string;
    let folderReal: string;
    try {
      rootReal = await deps.realpath(root);
      folderReal = await deps.realpath(path.join(root, REFERENCE_COPY_FOLDER));
    } catch { continue; } // this root has no such folder
    if (done.has(fold(folderReal))) continue;
    done.add(fold(folderReal));
    if (!isInside(rootReal, folderReal) || fold(path.basename(folderReal).normalize('NFC')) !== fold(REFERENCE_COPY_FOLDER)) { skipped += 1; continue; }
    let names: string[];
    try { names = await deps.readdir(folderReal); } catch { failed += 1; continue; }
    for (const name of names) {
      const target = path.join(folderReal, name);
      try {
        const info = await deps.lstat(target);
        if (info.isSymbolicLink() || !info.isFile()) { skipped += 1; continue; }
        await deps.unlink(target);
        deleted += 1;
      } catch { failed += 1; }
    }
  }
  return { success: true, deleted, skipped, failed };
}

/** The image base folders: the configured save folder (if any) and the Downloads fallback. */
async function resolveReferenceCopyRoots(): Promise<string[]> {
  const os = await import('os');
  const roots = [path.join(os.homedir(), 'Downloads', 'naver-blog-images')];
  try {
    const { loadConfig } = await import('../../configManager.js');
    const configured = String(((await loadConfig()) as { customImageSavePath?: unknown }).customImageSavePath || '').trim();
    if (configured) roots.unshift(configured);
  } catch { /* only the default folder is checked */ }
  return roots;
}

/** Handler body: resolves the real folders from the app settings and uses the real file system. */
export async function deleteReferenceCopyFromDisk(rawPath: unknown): Promise<ReferenceCopyResult> {
  const [fsp, roots] = await Promise.all([import('fs/promises'), resolveReferenceCopyRoots()]);
  return deleteReferenceCopy(rawPath, { roots, realpath: (target) => fsp.realpath(target), stat: (target) => fsp.stat(target), unlink: (target) => fsp.unlink(target) });
}

// ── Existence check (read-only) ───────────────────────────────────────────────
// Lets the screen find a photo whose copy file was removed by hand, so it can stop before a request is sent.
export interface ReferenceCopyExistsResult { success: boolean; exists: boolean; reason?: 'missing' | 'outside' | 'not-file' | 'invalid' }

/** exists=true only for a regular file whose REAL path is inside a "참고_사진" folder; nothing is ever touched. */
export async function referenceCopyExists(rawPath: unknown, deps: Pick<ReferenceCopyDeps, 'roots' | 'realpath' | 'stat'>): Promise<ReferenceCopyExistsResult> {
  const requested = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!requested || requested.includes('\0') || !path.isAbsolute(requested)) return { success: false, exists: false, reason: 'invalid' };
  let real: string;
  try { real = await deps.realpath(path.normalize(requested)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { success: true, exists: false, reason: 'missing' };
    return { success: false, exists: false };
  }
  const folders: string[] = [];
  for (const root of deps.roots) {
    try { folders.push(await deps.realpath(path.join(root, REFERENCE_COPY_FOLDER))); } catch { /* this root has no such folder */ }
  }
  if (!folders.some((folder) => isInside(folder, real))) return { success: true, exists: false, reason: 'outside' };
  try { return (await deps.stat(real)).isFile() ? { success: true, exists: true } : { success: true, exists: false, reason: 'not-file' }; }
  catch { return { success: false, exists: false }; }
}

export async function referenceCopyExistsFromDisk(rawPath: unknown): Promise<ReferenceCopyExistsResult> {
  const [fsp, roots] = await Promise.all([import('fs/promises'), resolveReferenceCopyRoots()]);
  return referenceCopyExists(rawPath, { roots, realpath: (target) => fsp.realpath(target), stat: (target) => fsp.stat(target) });
}

/** Start-up cleanup handler body. */
export async function clearReferenceCopiesFromDisk(): Promise<ReferenceCopyClearResult> {
  const [fsp, roots] = await Promise.all([import('fs/promises'), resolveReferenceCopyRoots()]);
  return clearReferenceCopyFolders({
    roots,
    realpath: (target) => fsp.realpath(target),
    readdir: (target) => fsp.readdir(target),
    lstat: (target) => fsp.lstat(target),
    unlink: (target) => fsp.unlink(target),
  });
}
