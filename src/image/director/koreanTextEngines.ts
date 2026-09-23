/**
 * Engines that draw the Korean thumbnail copy themselves — the app overlays nothing on them.
 *
 *   nano-banana-2 / nano-banana-pro   Gemini 3.1 Flash / 3 Pro Image (한글 가능 / 한글 최강)
 *   flow                              Google Flow (Nano Banana based)
 *   openai-image                      GPT Image, 덕트테이프 (한글 최강)
 *   dropshot                          리더스 나노바나나 무제한
 *
 * Not listed: 'nano-banana' (Gemini 2.5 Flash Image) — the engine picker itself says "한글 텍스트 깨짐",
 * so it keeps a text-free image plus the app overlay, like every other engine.
 *
 * [2026-09-23 사장님] "나노바나나랑 지피티 이미지는 한글을 따로 안입혀도됩니다 한글표현력이 좋기 때문에"
 * Shared by imageGenerator and the thumbnail director (which must not import imageGenerator).
 */
export const KOREAN_TEXT_ENGINES: ReadonlySet<string> = new Set([
  'nano-banana-2',
  'nano-banana-pro',
  'flow',
  'openai-image',
  'dropshot',
]);

export function drawsKoreanTextItself(provider: unknown): boolean {
  return KOREAN_TEXT_ENGINES.has(String(provider ?? '').trim().toLowerCase());
}
