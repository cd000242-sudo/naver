// src/image/codex/codexReferenceImage.ts
// [2026-11-05] The shopping product photo that goes into a Codex image session as the reference (image_gen's
// `referenced_image_paths`). The photo is cleaned once per call and the same bytes are written into every session's
// work folder: EXIF rotation applied first, longest side capped at 1536, re-encoded as PNG, all metadata dropped.
// A photo that cannot be cleaned stops the call — no reference-free drawing, no other engine.
import { createHash } from 'crypto';
import sharp from 'sharp';

export const CODEX_REFERENCE_FILE_NAME = 'reference-01.png';
export const CODEX_REFERENCE_MAX_SIDE = 1536;
export const CODEX_REFERENCE_LOAD_FAILED_MESSAGE =
  'SHOPPING_REFERENCE_LOAD_FAILED: Codex 구독 이미지가 대표 상품 사진을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.';

export interface CodexReferenceImage {
  /** Cleaned PNG bytes — exactly what a session writes to its work folder. */
  buffer: Buffer;
  fileName: string;
  /** sha256 (hex) of `buffer`, used to spot a result that is only a copy of the reference. */
  sha256: string;
  width: number;
  height: number;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Cleans the loaded representative photo. Throws CODEX_REFERENCE_LOAD_FAILED_MESSAGE when there is nothing usable. */
export async function prepareCodexReferenceImage(source: Buffer | null | undefined): Promise<CodexReferenceImage> {
  if (!source || source.length === 0) throw new Error(CODEX_REFERENCE_LOAD_FAILED_MESSAGE);
  try {
    // rotate() with no argument applies the EXIF orientation; sharp drops metadata unless withMetadata() is called.
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width: CODEX_REFERENCE_MAX_SIDE, height: CODEX_REFERENCE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      fileName: CODEX_REFERENCE_FILE_NAME,
      sha256: sha256Hex(data),
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new Error(CODEX_REFERENCE_LOAD_FAILED_MESSAGE);
  }
}

/** True when a generated file is byte-identical to the cleaned reference photo. */
export function isCodexReferenceCopy(candidate: Buffer, reference: Pick<CodexReferenceImage, 'sha256'>): boolean {
  return candidate.length > 0 && sha256Hex(candidate) === reference.sha256;
}
