/**
 * THUMBNAIL_HINT block parser.
 *
 * The homefeed prompt (src/prompts/homefeed/base.prompt SECTION 7) instructs
 * the LLM to append a hint block at the end of its output:
 *
 *   ===THUMBNAIL_HINT===
 *   구도: 인물 1명 클로즈업, 얼굴 중심
 *   톤: 따뜻한 자연광, 포인트 컬러 노랑
 *   텍스트 오버레이: "3주 써보니"
 *   위치: 하단
 *   ===END_THUMBNAIL_HINT===
 *
 * This module extracts the block, parses its fields, and converts it into
 * an ImageRequestItem the existing generators (nano-banana-pro, etc.) can
 * consume. It never calls any generator — pure data transformation only.
 */

import type { ImageRequestItem } from './types.js';

export interface ThumbnailHint {
  composition: string;
  tone: string;
  overlayText: string;
  overlayPosition: '상단' | '하단' | '중앙' | string;
  /** Raw block text in case callers want to forward it verbatim. */
  raw: string;
}

const BLOCK_PATTERN = /===THUMBNAIL_HINT===([\s\S]*?)===END_THUMBNAIL_HINT===/;

const FIELD_ALIASES: Record<keyof Omit<ThumbnailHint, 'raw'>, RegExp[]> = {
  composition: [/^\s*구도\s*[:：]\s*(.+?)\s*$/m],
  tone: [/^\s*톤\s*[:：]\s*(.+?)\s*$/m, /^\s*컬러\s*[:：]\s*(.+?)\s*$/m],
  overlayText: [
    /^\s*텍스트\s*오버레이\s*[:：]\s*(.+?)\s*$/m,
    /^\s*오버레이\s*[:：]\s*(.+?)\s*$/m,
  ],
  overlayPosition: [/^\s*위치\s*[:：]\s*(.+?)\s*$/m],
};

/** Strip surrounding quotes (straight, curly, or Korean) if they wrap the entire value. */
function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(["'“”‘’「『])(.+)(["'“”‘’」』])$/.exec(trimmed);
  return quoted ? quoted[2].trim() : trimmed;
}

function firstMatch(block: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = block.match(p);
    if (m && m[1]) return unquote(m[1]);
  }
  return null;
}

/**
 * Extract and parse the first THUMBNAIL_HINT block.
 * Returns null when the block is absent or required fields are missing.
 * Missing non-critical fields fall back to defaults.
 */
export function extractThumbnailHint(llmOutput: string): ThumbnailHint | null {
  if (!llmOutput) return null;
  const blockMatch = llmOutput.match(BLOCK_PATTERN);
  if (!blockMatch) return null;

  const block = blockMatch[1];

  const composition = firstMatch(block, FIELD_ALIASES.composition);
  const overlayText = firstMatch(block, FIELD_ALIASES.overlayText);

  // Critical fields: without composition and overlayText we cannot produce a
  // meaningful thumbnail. Caller should fall back to the first body image.
  if (!composition || !overlayText) return null;

  const tone = firstMatch(block, FIELD_ALIASES.tone) ?? '밝고 선명한 자연광';
  const overlayPosition = firstMatch(block, FIELD_ALIASES.overlayPosition) ?? '하단';

  return {
    composition,
    tone,
    overlayText,
    overlayPosition,
    raw: blockMatch[0],
  };
}

/**
 * Remove the hint block from the LLM output so it is never published.
 * Idempotent: returns the input unchanged when no block is present.
 */
export function stripThumbnailHint(llmOutput: string): string {
  return llmOutput.replace(BLOCK_PATTERN, '').trimEnd();
}

/**
 * Convert a parsed hint into an ImageRequestItem the generators accept.
 * Sets isThumbnail=true and allowText=true so the generator knows it may
 * render the overlay text on the image.
 */
export function buildThumbnailRequest(
  hint: ThumbnailHint,
  postTitle: string,
  category?: string,
): ImageRequestItem {
  const prompt = [
    `${hint.composition}.`,
    `톤: ${hint.tone}.`,
    `텍스트 오버레이: "${hint.overlayText}" (위치: ${hint.overlayPosition}).`,
    `모바일 홈피드 썸네일 16:9 또는 1:1. 밝고 선명. 고해상도.`,
    postTitle ? `글 주제: ${postTitle}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    heading: '썸네일',
    prompt,
    isThumbnail: true,
    allowText: true,
    category,
  };
}

/**
 * Category-tone presets from SECTION 7 of the homefeed prompt. Callers may
 * merge these with a parsed hint to enforce category conventions even if the
 * LLM omitted the tone field.
 */
export const CATEGORY_TONE_PRESETS: Record<string, string> = {
  entertainment: '인물 얼굴 클로즈업, 감정 표현 강조',
  sports: '인물 얼굴 클로즈업, 감정 표현 강조',
  health: '따뜻한 조명, 자연스러운 장면, 신뢰 강조',
  parenting: '따뜻한 조명, 자연스러운 장면, 신뢰 강조',
  it: '제품 단독컷, 미니멀 배경',
  living: '제품 단독컷, 미니멀 배경',
  travel: '광각 풍경, 선명한 색감',
  food: '음식 클로즈업, 윤기 강조',
  life: '일상 장면, 손글씨 느낌 폰트',
  tips: '일상 장면, 손글씨 느낌 폰트',
};
