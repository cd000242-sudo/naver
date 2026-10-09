// src/automation/imageUploadPreflight.ts
// [2026-10-09] 업로드 직전 파일 검사 — 다시 해도 같은 결과인 실패(사진이 아닌 파일, 크롬이 못 읽는 긴 경로)를
//   재시도 3회로 끌지 않고 파일 이름과 함께 바로 알린다. electron 등 무거운 의존을 import 하지 않는다.

import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { looksLikeImageBytes } from '../main/ipc/imagePayloadPolicy.js';

export const IMAGE_UPLOAD_NOT_RETRYABLE = 'IMAGE_UPLOAD_NOT_RETRYABLE';

/** 크롬은 MAX_PATH 260(끝 NUL 포함)이라 259자까지 읽는다(실측 259 OK, 260+ 0/9). 여유 10자. */
export const CHROME_SAFE_PATH_LENGTH = 250;
const CHROME_HARD_PATH_LENGTH = 260;

/** 다시 해도 같은 결과인 업로드 실패 — 재시도 루프는 오직 code 로만 알아본다(메시지 글자 판정 금지). */
export class ImageUploadNotRetryableError extends Error {
  readonly code = IMAGE_UPLOAD_NOT_RETRYABLE;
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadNotRetryableError';
  }
}

export function isImageUploadNotRetryable(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === IMAGE_UPLOAD_NOT_RETRYABLE;
}

/** 오류 메시지에 쓸 이름 — 폴더 경로(사용자 이름 포함)는 남기지 않는다. */
export function describeUploadSource(source: string): string {
  const text = String(source ?? '');
  if (/^data:/i.test(text)) return '붙여넣은 이미지';
  const withoutQuery = /^https?:\/\//i.test(text) ? text.split(/[?#]/)[0] : text;
  const name = withoutQuery.split(/[\\/]/).filter(Boolean).pop() || '(이름 없음)';
  return name.length > 40 ? name.slice(-40) : name;
}

export type ImageFileHeadVerdict = { ok: true } | { ok: false; reason: string };

/** 앞 32바이트와 파일 크기만으로 판정한다. 거부는 0바이트와 매직 바이트 불일치뿐이다. */
export function judgeImageFileHead(head: Buffer, size: number): ImageFileHeadVerdict {
  if (size === 0) return { ok: false, reason: '사진 파일이 비어 있음 (0바이트)' };
  if (!looksLikeImageBytes(head)) {
    const preview = head.toString('latin1').replace(/[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
    return { ok: false, reason: `사진 파일이 아님 (${size}바이트, 내용 "${preview}")` };
  }
  return { ok: true };
}

export interface PreparedUploadFile {
  filePath: string;
  tempCopy: boolean;
  originalLength: number;
}

export async function prepareImageFileForUpload(
  filePath: string,
  options: { displayName: string; maxPathLength?: number; tempDir?: string },
): Promise<PreparedUploadFile> {
  const { displayName } = options;
  const limit = options.maxPathLength ?? CHROME_SAFE_PATH_LENGTH;

  // 읽기 실패(EBUSY 등)는 통과 — 종전 흐름이 그대로 판단한다.
  try {
    const stat = await fsPromises.stat(filePath);
    const handle = await fsPromises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(32);
      const { bytesRead } = await handle.read(buffer, 0, 32, 0);
      const verdict = judgeImageFileHead(buffer.subarray(0, bytesRead), stat.size);
      if (!verdict.ok) throw new ImageUploadNotRetryableError(`${verdict.reason} — ${displayName}`);
    } finally {
      await handle.close().catch(() => undefined);
    }
  } catch (error) {
    if (isImageUploadNotRetryable(error)) throw error;
  }

  if (filePath.length < limit) return { filePath, tempCopy: false, originalLength: filePath.length };

  const ext = path.extname(filePath).toLowerCase();
  const copyPath = path.join(
    options.tempDir ?? os.tmpdir(),
    `naver-blog-img-longpath-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
  );
  if (copyPath.length >= CHROME_HARD_PATH_LENGTH) {
    throw new ImageUploadNotRetryableError(`사진 경로가 너무 길어 크롬이 읽지 못함 (${filePath.length}자) — ${displayName}`);
  }
  try {
    await fsPromises.copyFile(filePath, copyPath);
  } catch (copyError) {
    if (filePath.length >= CHROME_HARD_PATH_LENGTH) {
      throw new ImageUploadNotRetryableError(
        // 오류 메시지에는 사용자 이름이 든 전체 경로가 실리므로 코드만 남긴다.
        `사진 경로가 너무 길고(${filePath.length}자) 임시 사본도 만들지 못함 (${(copyError as NodeJS.ErrnoException)?.code || '복사 실패'}) — ${displayName}`,
      );
    }
    return { filePath, tempCopy: false, originalLength: filePath.length };
  }
  return { filePath: copyPath, tempCopy: true, originalLength: filePath.length };
}
