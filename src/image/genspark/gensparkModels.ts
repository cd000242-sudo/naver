// src/image/genspark/gensparkModels.ts
// [2026-10-10] 젠스파크 이미지 모델 표. 렌더러 번들에 그대로 인라인되므로 다른 파일을 import 하지 않고,
//   최상위 이름은 모두 GENSPARK_ / gensparkXxx 로 전역 유일하게 둔다.

export interface GensparkModelEntry {
  /** 앱에 저장하는 값 */
  readonly id: string;
  /** 젠스파크 모델 메뉴의 글자 그대로(정확 일치로 찾는다) */
  readonly menuLabel: string;
  /** true = 'No credit cost'(무제한), false = 크레딧 차감 */
  readonly creditFree: boolean;
  /** 이미지 안에 한글을 직접 그려 주는 모델 */
  readonly drawsKorean: boolean;
  /** 젠스파크 메뉴에서 'New' 배지가 붙은 모델 */
  readonly isNew: boolean;
}

export const GENSPARK_DEFAULT_MODEL_ID = 'gpt-image-2.5';
export const GENSPARK_CREDIT_SUFFIX = ' (크레딧 차감)';

function gensparkMakeModel(
  id: string,
  menuLabel: string,
  creditFree: boolean,
  drawsKorean = false,
  isNew = false,
): GensparkModelEntry {
  return Object.freeze({ id, menuLabel, creditFree, drawsKorean, isNew });
}

const GENSPARK_MODELS: readonly GensparkModelEntry[] = Object.freeze([
  // 무료(무제한) 8개
  gensparkMakeModel('gpt-image-2.5', 'GPT Image 2.5', true, true),
  gensparkMakeModel('gpt-image-2', 'GPT Image 2', true, true),
  gensparkMakeModel('nano-banana-2-flash-lite', 'Nano Banana 2 Flash Lite', true, true),
  gensparkMakeModel('seedream-v5-lite', 'Bytedance Seedream v5 Lite', true),
  gensparkMakeModel('z-image-turbo', 'Z-Image Turbo', true),
  gensparkMakeModel('krea-2-turbo', 'Krea 2 Turbo', true),
  gensparkMakeModel('recraft-v4.1', 'Recraft V4.1', true),
  gensparkMakeModel('ideogram-v4', 'Ideogram V4', true),
  // 크레딧 차감 7개
  gensparkMakeModel('nano-banana-2.1', 'Nano Banana 2.1', false, true, true),
  gensparkMakeModel('nano-banana-pro', 'Nano Banana Pro', false, true),
  gensparkMakeModel('seedream-5.0-pro', 'Bytedance Seedream 5.0 Pro', false),
  gensparkMakeModel('qwen-image-3', 'Qwen Image 3', false),
  gensparkMakeModel('grok-imagine-image-2.0', 'Grok Imagine Image 2.0', false),
  gensparkMakeModel('flux-3-image', 'FLUX 3 Image', false, false, true),
  gensparkMakeModel('ideogram-v4.5', 'Ideogram V4.5', false, false, true),
]);

/** 모델 15개 전체(화면 순서). */
export function gensparkListModels(): readonly GensparkModelEntry[] {
  return GENSPARK_MODELS;
}

export function gensparkDefaultModel(): GensparkModelEntry {
  return GENSPARK_MODELS[0];
}

/** 저장값(id)으로 찾는다. 없으면 null. */
export function gensparkFindModelById(id: unknown): GensparkModelEntry | null {
  if (typeof id !== 'string') return null;
  return GENSPARK_MODELS.find((e) => e.id === id) || null;
}

/** 젠스파크 메뉴 글자로 찾는다(정확 일치 — 'GPT Image 2' 와 'GPT Image 2.5' 는 다른 모델). */
export function gensparkFindModelByMenuLabel(label: unknown): GensparkModelEntry | null {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  return GENSPARK_MODELS.find((e) => e.menuLabel === trimmed) || null;
}

/** 화면에 보일 이름. 크레딧 차감 모델은 ' (크레딧 차감)' 이 붙는다. */
export function gensparkModelDisplayLabel(model: GensparkModelEntry): string {
  return model.creditFree ? model.menuLabel : model.menuLabel + GENSPARK_CREDIT_SUFFIX;
}

/**
 * 저장값 정규화. 빈 값(undefined/null/공백) → 기본 모델, 목록에 없는 값 → null.
 * 모르는 값을 조용히 기본 모델로 바꾸지 않는다(호출자가 오류로 멈춘다).
 */
export function gensparkNormalizeModelId(value: unknown): GensparkModelEntry | null {
  if (value === undefined || value === null) return gensparkDefaultModel();
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return gensparkDefaultModel();
  return gensparkFindModelById(trimmed);
}
