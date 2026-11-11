// src/image/codex/codexUserReferences.ts
// [2026-11-11] The user's own reference photos for the Codex subscription image engine (max 3, each marked person or
// product): input validation and the choice between them and the shopping representative photo.
//   1. user photos present -> only they are used (never mixed with the shopping representative photo)
//   2. none, shopping post  -> the representative product photo, exactly as before
//   3. none, not shopping   -> no reference at all
// A photo that cannot be read stops the call (USER_REFERENCE_LOAD_FAILED) — no reference-free drawing, no other engine.
import { CODEX_MAX_REFERENCES, type CodexReferenceRole } from './codexImageInstruction.js';
import {
  prepareCodexReferenceImage,
  prepareCodexReferenceImages,
  type CodexReferenceImage,
  type CodexRoledReference,
} from './codexReferenceImage.js';

export interface UserReferenceImage {
  path: string;
  role: CodexReferenceRole;
}

const ROLES: ReadonlySet<string> = new Set(['person', 'product']);

function invalid(detail: string): Error {
  return new Error(`USER_REFERENCE_INVALID: ${detail}`);
}

/** Validates the option as it arrives (renderer data): returns a fresh array, never touches the input. */
export function parseUserReferenceImages(raw: unknown): UserReferenceImage[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw invalid('참고 사진 목록 형식이 올바르지 않습니다.');
  if (raw.length > CODEX_MAX_REFERENCES) throw invalid(`참고 사진은 최대 ${CODEX_MAX_REFERENCES}장까지입니다. (${raw.length}장)`);
  return raw.map((entry, index) => {
    const record: Record<string, unknown> = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const path = typeof record.path === 'string' ? record.path.trim() : '';
    if (!path) throw invalid(`${index + 1}번 참고 사진 경로가 비어 있습니다.`);
    // Only files inside an app-managed folder are allowed (the loader's root check); URLs are not accepted here.
    if (/^(https?|data|file):/i.test(path)) throw invalid(`${index + 1}번 참고 사진은 앱 폴더 안의 파일이어야 합니다.`);
    if (typeof record.role !== 'string' || !ROLES.has(record.role)) throw invalid(`${index + 1}번 참고 사진의 역할은 인물 또는 제품이어야 합니다.`);
    return { path, role: record.role as CodexReferenceRole };
  });
}

/** Short cause for the log (never the full path): refused path / missing file / bad format / unreadable. */
export function describeReferenceLoadFailure(error: unknown): string {
  if (error === null || error === undefined) return '읽을 수 없음';
  const code = (error as { code?: unknown }).code;
  const text = `${typeof code === 'string' ? code : ''} ${error instanceof Error ? error.message : String(error)}`;
  if (/ENOENT|no such file|not found|없/i.test(text)) return '파일 없음';
  if (/allowed|outside|denied|EACCES|EPERM|허용|권한|root/i.test(text)) return '경로 거부';
  if (/format|unsupported|decode|corrupt|invalid|형식|손상/i.test(text)) return '형식 오류';
  return '읽지 못함';
}

function logLoadFailure(index: number, path: string, reason: string): void {
  const name = path.replace(/\\/g, '/').split('/').pop() || '(이름 없음)';
  console.warn(`[CodexUserReference] ${index + 1}번 참고 사진(${name}) 불러오기 실패: ${reason}`);
}

export interface CodexReferenceInputs {
  /** The shopping representative product photo (one, as before). */
  referenceImage?: CodexReferenceImage;
  /** The user's photos with their roles, in the order the user gave them. */
  userReferences?: CodexRoledReference[];
}

export interface CodexReferenceInputRequest {
  userReferenceImages: unknown;
  isShoppingConnect: boolean;
  hasItems: boolean;
  shoppingBuffer: Buffer | null | undefined;
  /** Loads one user photo through the managed-root check; throws or returns null when it cannot. */
  loadUserReference(path: string): Promise<{ buffer: Buffer } | null>;
}

export async function resolveCodexReferenceInputs(request: CodexReferenceInputRequest): Promise<CodexReferenceInputs> {
  const wanted = parseUserReferenceImages(request.userReferenceImages);
  if (!request.hasItems) return {};
  if (wanted.length > 0) {
    const buffers: Array<Buffer | null> = [];
    for (const [index, entry] of wanted.entries()) {
      // The cleaning step turns a missing photo into the numbered stop message; the cause goes to the log here.
      try {
        const loaded = await request.loadUserReference(entry.path);
        if (!loaded) logLoadFailure(index, entry.path, describeReferenceLoadFailure(null));
        buffers.push(loaded?.buffer ?? null);
      } catch (error) {
        logLoadFailure(index, entry.path, describeReferenceLoadFailure(error));
        buffers.push(null);
      }
    }
    const images = await prepareCodexReferenceImages(buffers);
    return { userReferences: images.map((image, index) => ({ image, role: wanted[index].role })) };
  }
  if (request.isShoppingConnect) return { referenceImage: await prepareCodexReferenceImage(request.shoppingBuffer) };
  return {};
}
