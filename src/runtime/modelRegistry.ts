// v2.7.45 — Model Registry SSOT (Single Source of Truth)
//
// debugger 진단(docs/diagnosis-2026-04-29/regression-summary.md):
//   "AI 모델 ID 분산 16회 fix" — Gemini/OpenAI/Claude/Imagen 모델 ID가 코드 곳곳 분산.
//   Anthropic/Google/OpenAI가 모델 deprecate 시 매번 여러 곳을 동시 수정해야 함.
//
// 본 모듈은 모든 검증된 모델 ID를 단일 지점에서 관리한다. 변경 시 여기서만 갱신.
// 호출자는 이 모듈에서 가져와 사용 (직접 문자열 리터럴 금지).

/**
 * Anthropic Claude (2026-04 기준 검증)
 *   Source: docs.claude.com / console.anthropic.com models
 */
export const CLAUDE_MODELS = {
  /** 최고 성능 — Opus 4.7 */
  OPUS: 'claude-opus-4-7',
  /** 균형 — Sonnet 4.6 */
  SONNET: 'claude-sonnet-4-6',
  /** 가성비 — Haiku 4.5 (정식 ID, 날짜 suffix 포함) */
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

/**
 * Google Gemini Text (2026-04 기준 검증)
 *   Source: ai.google.dev/gemini-api/docs/models
 */
export const GEMINI_TEXT_MODELS = {
  /** Flash — 빠르고 저렴 (기본) */
  FLASH: 'gemini-2.5-flash',
  /** Pro — 고품질 */
  PRO: 'gemini-2.5-pro',
} as const;

/**
 * Google Gemini Image (2026-04 기준 검증)
 *   gemini-3-pro-image-preview / gemini-3.1-flash-image-preview 는 미존재 ID로 확인됨 (v2.7.24)
 *   따라서 정식 GA gemini-2.5-flash-image 단일 매핑.
 */
export const GEMINI_IMAGE_MODELS = {
  /** 정식 GA — 모든 사용자 작동 */
  STANDARD: 'gemini-2.5-flash-image',
  /** 무료 실험 (preview suffix 형태) */
  FREE_EXP: 'gemini-2.0-flash-preview-image-generation',
} as const;

/**
 * Google Imagen (2026-04 기준 검증)
 */
export const IMAGEN_MODELS = {
  /** Imagen 4 (Tier 1+ 작동 확인) */
  V4: 'imagen-4.0-generate-001',
  /** Imagen 3.5 (ImageFX 내부) */
  V35_FX: 'imagen-3.5-imagefx',
} as const;

/**
 * OpenAI Image
 *   gpt-image-2: 최신 (덕트테이프). 사용자 메뉴 기본값.
 *   dall-e-3: 2026-05-12 deprecation 예정 — 폴백 또는 비상용으로만.
 *   gpt-image-1: 호환용
 */
export const OPENAI_IMAGE_MODELS = {
  /** gpt-image-2 (덕트테이프, 기본) */
  GPT_IMAGE_2: 'gpt-image-2',
  /** gpt-image-1 (호환) */
  GPT_IMAGE_1: 'gpt-image-1',
  /** DALL-E 3 (2026-05-12 sunset 예정 — 폴백 전용) */
  DALL_E_3: 'dall-e-3',
} as const;

/**
 * OpenAI Text (gpt-4o/gpt-4o-mini는 2026-03-31 sunset → gpt-4.1 계열로 교체됨)
 */
export const OPENAI_TEXT_MODELS = {
  /** GPT-4.1 — 메인 */
  GPT_41: 'gpt-4.1',
  /** GPT-4.1 mini — 번역·이미지 분석 (1/5 가격) */
  GPT_41_MINI: 'gpt-4.1-mini',
} as const;

/**
 * ✅ [v2.7.62] Vision-capable 모델 (이미지 분석/관련성 평가용)
 *   reviewer 권고에 따라 SSOT에 추가 — 직접 문자열 리터럴 금지
 */
export const VISION_MODELS = {
  GEMINI_FLASH: 'gemini-2.5-flash',
  GEMINI_PRO: 'gemini-2.5-pro',
  CLAUDE_SONNET: 'claude-sonnet-4-6',
  OPENAI_41: 'gpt-4.1',
  OPENAI_41_MINI: 'gpt-4.1-mini',
} as const;

/**
 * ✅ [v2.7.62] 글 생성 AI 키 → vision provider 라우팅
 *   사용자가 글 생성에 고른 AI와 동일 vendor로 이미지 추론 (사용자 요청)
 *   Perplexity는 vision 미지원 → Gemini Flash 폴백 (사용자 동의 필요)
 */
export type TextGeneratorKey =
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'perplexity-sonar'
  | 'openai-gpt4o-mini'  // 레거시 키 — gpt-4.1-mini로 매핑
  | 'openai-gpt41'
  | 'claude-sonnet';

export type VisionProviderKey =
  | 'gemini-flash'
  | 'gemini-pro'
  | 'claude-sonnet'
  | 'openai-41'
  | 'openai-41-mini';

export interface VisionRouting {
  provider: VisionProviderKey;
  model: string;
  vendor: 'gemini' | 'claude' | 'openai';
  /** vision 미지원이라 폴백된 경우 */
  fellBack: boolean;
  reason?: string;
}

export function routeTextToVision(textKey: string): VisionRouting {
  switch (textKey) {
    case 'gemini-2.5-flash-lite':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: true, reason: 'Lite는 vision 없음 → Flash로 자동' };
    case 'gemini-2.5-flash':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: false };
    case 'gemini-2.5-pro':
      return { provider: 'gemini-pro', model: VISION_MODELS.GEMINI_PRO, vendor: 'gemini', fellBack: false };
    case 'claude-sonnet':
      return { provider: 'claude-sonnet', model: VISION_MODELS.CLAUDE_SONNET, vendor: 'claude', fellBack: false };
    case 'openai-gpt41':
      return { provider: 'openai-41', model: VISION_MODELS.OPENAI_41, vendor: 'openai', fellBack: false };
    case 'openai-gpt4o-mini':
      return { provider: 'openai-41-mini', model: VISION_MODELS.OPENAI_41_MINI, vendor: 'openai', fellBack: false };
    case 'perplexity-sonar':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: true, reason: 'Perplexity vision 미지원 → Gemini Flash 폴백' };
    default:
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: true, reason: `미지원 키(${textKey}) → Gemini Flash 기본` };
  }
}

/**
 * Gemini 사용자 UI 키 → 실제 API ID 매핑
 *   '나노바나나' UI 라벨이 어떤 키로 저장되든 정식 GA로 통합.
 */
export const NANO_BANANA_USER_KEY_TO_MODEL: Record<string, { model: string; resolution: string }> = {
  'gemini-3-pro-4k': { model: GEMINI_IMAGE_MODELS.STANDARD, resolution: '1K' },
  'gemini-3-pro': { model: GEMINI_IMAGE_MODELS.STANDARD, resolution: '1K' },
  'gemini-3-1-flash': { model: GEMINI_IMAGE_MODELS.STANDARD, resolution: '1K' },
  'gemini-2.5-flash': { model: GEMINI_IMAGE_MODELS.STANDARD, resolution: '1K' },
  'gemini-2.0-flash-exp': { model: GEMINI_IMAGE_MODELS.FREE_EXP, resolution: '1K' },
  'imagen-4': { model: IMAGEN_MODELS.V4, resolution: '1K' },
};

/**
 * 가짜/미존재 모델 ID 카탈로그 (코드에 잔존하면 회귀)
 *   회귀 가드 테스트가 이 배열을 사용해 코드에서 발견 시 fail.
 */
export const FAKE_MODEL_IDS_BANNED = [
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
  'gemini-3-flash',
  // gpt-4o*는 2026-03-31 deprecate
  'gpt-4o',
  'gpt-4o-mini',
] as const;

/**
 * 사용자 UI provider value → 백엔드 정규화
 *   'nano-banana-2'와 'nano-banana-pro' 둘 다 동일한 백엔드 라벨로 통합.
 */
export function normalizeImageProvider(provider: string): string {
  if (provider === 'nano-banana-2') return 'nano-banana-pro';
  if (provider === 'deepinfra-flux' || provider === 'deepinfra-flux-2') return 'deepinfra';
  return provider;
}

/**
 * 모델 ID가 가짜/deprecate 목록에 포함되는지 검사 (회귀 가드용)
 */
export function isBannedModelId(id: string): boolean {
  return (FAKE_MODEL_IDS_BANNED as readonly string[]).includes(id);
}
