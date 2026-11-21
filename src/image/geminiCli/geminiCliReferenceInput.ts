// src/image/geminiCli/geminiCliReferenceInput.ts
// [2026-11-21] The shopping product photo for the Gemini subscription image engine: which reference goes into the call.
//   1. shopping post          -> the representative product photo, cleaned once (EXIF rotation, longest side 1536, PNG, no metadata)
//   2. not a shopping post    -> no reference at all
// The user's own reference photos (Codex only) are not supported by this engine.
// A photo that cannot be cleaned stops the call (SHOPPING_REFERENCE_LOAD_FAILED) — no reference-free drawing, no other engine.
// The cleaning itself is the Codex one (prepareCodexReferenceImage), reused unchanged.
import { CODEX_REFERENCE_FILE_NAME, prepareCodexReferenceImage, type CodexReferenceImage } from '../codex/codexReferenceImage.js';

export const GEMINI_CLI_REFERENCE_LOAD_FAILED_MESSAGE =
  'SHOPPING_REFERENCE_LOAD_FAILED: Gemini 구독 이미지가 대표 상품 사진을 불러오지 못해 멈췄습니다. 참고 사진 없이 만들거나 다른 엔진으로 바꾸지 않았습니다.';

export interface GeminiCliReferenceInputs {
  /** The shopping representative product photo (one). */
  referenceImage?: CodexReferenceImage;
}

export interface GeminiCliReferenceInputRequest {
  isShoppingConnect: boolean;
  hasItems: boolean;
  shoppingBuffer: Buffer | null | undefined;
}

export async function resolveGeminiCliReferenceInputs(request: GeminiCliReferenceInputRequest): Promise<GeminiCliReferenceInputs> {
  if (!request.hasItems || !request.isShoppingConnect) return {};
  return {
    referenceImage: await prepareCodexReferenceImage(request.shoppingBuffer, CODEX_REFERENCE_FILE_NAME, GEMINI_CLI_REFERENCE_LOAD_FAILED_MESSAGE),
  };
}
