// src/image/codex/codexReferenceImage.ts
// [2026-11-05] The shopping product photo that goes into a Codex image session as the reference (image_gen's
// `referenced_image_paths`). The photo is cleaned once per call and the same bytes are written into every session's
// work folder: EXIF rotation applied first, longest side capped at 1536, re-encoded as PNG, all metadata dropped.
// A photo that cannot be cleaned stops the call — no reference-free drawing, no other engine.
// [2026-11-11] The same cleaning serves the user's own reference photos (up to 3, reference-01.png ... reference-03.png).
import { createHash } from 'crypto';
import sharp from 'sharp';
import { CODEX_MAX_REFERENCES, type CodexReferenceRole } from './codexImageInstruction.js';

export const CODEX_REFERENCE_FILE_NAME = 'reference-01.png';
export const CODEX_REFERENCE_MAX_SIDE = 1536;
export const CODEX_REFERENCE_LOAD_FAILED_MESSAGE =
  'SHOPPING_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 대표 상품 사진을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.';

/** Stop message for a user reference photo that cannot be read or cleaned (`number` is 1-based). */
export function codexUserReferenceLoadFailedMessage(number: number): string {
  return `USER_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 참고 사진 ${number}번을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.`;
}

/** Name of the n-th reference file inside a session work folder (index is 0-based). */
export function codexReferenceFileName(index: number): string {
  return `reference-${String(index + 1).padStart(2, '0')}.png`;
}

export interface CodexReferenceImage {
  /** Cleaned PNG bytes — exactly what a session writes to its work folder. */
  buffer: Buffer;
  fileName: string;
  /** sha256 (hex) of `buffer`, used to spot a result that is only a copy of the reference. */
  sha256: string;
  width: number;
  height: number;
}

/** A cleaned user reference photo and what it shows. */
export interface CodexRoledReference {
  image: CodexReferenceImage;
  role: CodexReferenceRole;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Cleans one loaded photo. Throws `failedMessage` when there is nothing usable. */
export async function prepareCodexReferenceImage(
  source: Buffer | null | undefined,
  fileName: string = CODEX_REFERENCE_FILE_NAME,
  failedMessage: string = CODEX_REFERENCE_LOAD_FAILED_MESSAGE,
): Promise<CodexReferenceImage> {
  if (!source || source.length === 0) throw new Error(failedMessage);
  try {
    // rotate() with no argument applies the EXIF orientation; sharp drops metadata unless withMetadata() is called.
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width: CODEX_REFERENCE_MAX_SIDE, height: CODEX_REFERENCE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      fileName,
      sha256: sha256Hex(data),
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new Error(failedMessage);
  }
}

/** Cleans the user's reference photos in order (one at a time, sharp memory). One unusable photo stops them all. */
export async function prepareCodexReferenceImages(sources: readonly (Buffer | null | undefined)[]): Promise<CodexReferenceImage[]> {
  if (sources.length > CODEX_MAX_REFERENCES) throw new Error(`Codex 구독 이미지: 참고 사진은 최대 ${CODEX_MAX_REFERENCES}장까지 붙일 수 있습니다.`);
  const cleaned: CodexReferenceImage[] = [];
  for (let index = 0; index < sources.length; index++) {
    cleaned.push(await prepareCodexReferenceImage(sources[index], codexReferenceFileName(index), codexUserReferenceLoadFailedMessage(index + 1)));
  }
  return cleaned;
}

/** True when a generated file is byte-identical to ANY of the cleaned reference photos. */
export function isCodexReferenceCopy(
  candidate: Buffer,
  reference: Pick<CodexReferenceImage, 'sha256'> | readonly Pick<CodexReferenceImage, 'sha256'>[],
): boolean {
  if (candidate.length === 0) return false;
  const hash = sha256Hex(candidate);
  const references: readonly Pick<CodexReferenceImage, 'sha256'>[] = Array.isArray(reference) ? reference : [reference as Pick<CodexReferenceImage, 'sha256'>];
  return references.some((entry) => entry.sha256 === hash);
}
