import { gensparkNormalizeModelId } from '../genspark/gensparkModels.js';

/**
 * Engines that draw the Korean thumbnail copy themselves — the app overlays nothing on them.
 *
 *   nano-banana-2 / nano-banana-pro   Gemini 3.1 Flash / 3 Pro Image (한글 가능 / 한글 최강)
 *   flow                              Google Flow (Nano Banana based)
 *   openai-image                      GPT Image, 덕트테이프 (한글 최강)
 *   dropshot                          리더스 나노바나나 무제한
 *   genspark                          모델에 따라 다름(gensparkModels 의 drawsKorean) — 모델 인자로 판정
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

/**
 * [2026-10-10] model 은 선택 인자 — 'genspark' 일 때만 쓴다(젠스파크는 모델마다 한글 표현력이 다르다).
 *   비어 있으면 기본 모델, 목록에 없는 값은 false(그림 속 글자를 믿지 않고 앱이 입힌다).
 */
export function drawsKoreanTextItself(provider: unknown, model?: unknown): boolean {
  const key = String(provider ?? '').trim().toLowerCase();
  if (key === 'genspark') return gensparkNormalizeModelId(model)?.drawsKorean === true;
  return KOREAN_TEXT_ENGINES.has(key);
}

const SLOT_OR_PLACEHOLDER = /^(?:🖼️?\s*)?(?:썸네일|thumbnail|이미지\s*\d+)$/iu;

/**
 * [2026-10-08 사장님] "소제목 이미지에 소제목 글자 넣기" (image management tab, config.headingImageTextInclude):
 * the heading to draw verbatim on a section image, or null when the image stays text-free — the setting
 * is off, the item is the cover, the engine cannot draw Korean, or the heading is only a slot name.
 */
export function resolveHeadingImageText(
  item: { readonly heading?: unknown; readonly isThumbnail?: unknown },
  provider: unknown,
  enabled: boolean,
  model?: unknown,
): string | null {
  if (!enabled || item?.isThumbnail === true || !drawsKoreanTextItself(provider, model)) return null;
  const heading = String(item?.heading ?? '').replace(/["\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (!heading || SLOT_OR_PLACEHOLDER.test(heading)) return null;
  return heading;
}
