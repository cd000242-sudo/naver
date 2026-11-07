import {
  GEMINI_TEXT_MODELS,
  normalizeGeminiTextModelId,
} from './runtime/modelRegistry.js';

export type GeminiTextModelId =
  | typeof GEMINI_TEXT_MODELS.FLASH_LITE
  | typeof GEMINI_TEXT_MODELS.FLASH
  | typeof GEMINI_TEXT_MODELS.FLASH_SUSTAINED
  | typeof GEMINI_TEXT_MODELS.ARGON;

export interface GeminiFreeTierLimit {
  rpm: number | null;
  tpm: number | null;
  rpd: number | null;
  freeTierAvailable: boolean;
  label: string;
  recommendation: string;
}

// Google now exposes active limits per project in AI Studio instead of one
// universal static RPM/TPM/RPD table. Null means "read the active project limit"
// and prevents the app from displaying a made-up quota.
export const GEMINI_TEXT_FREE_TIER_LIMITS: Record<GeminiTextModelId, GeminiFreeTierLimit> = Object.freeze({
  [GEMINI_TEXT_MODELS.FLASH_LITE]: Object.freeze({
    rpm: null,
    tpm: null,
    rpd: null,
    freeTierAvailable: true,
    label: 'Gemini 3.5 Flash-Lite',
    recommendation: '가성비 및 대량 처리용. 현재 한도는 AI Studio에서 확인합니다.',
  }),
  [GEMINI_TEXT_MODELS.FLASH]: Object.freeze({
    rpm: null,
    tpm: null,
    rpd: null,
    freeTierAvailable: false,
    label: 'Gemini 3.8 Flash',
    recommendation: '선불 유료 고품질 모델(최신). 무료 사용은 Flash-Lite를 선택하세요.',
  }),
  /**
   * [2026-11-03] 3.6 Flash — 3.8 도입 후에도 직전 세대로 남긴다.
   *   공식 문서상 "지속 추론(sustained frontier performance)" 강점이 있어 긴 글에 유리하고,
   *   Stable 이라 티어 제한이 없다. 가격 일정은 3.8 Flash 와 같다(apiUsageTracker.resolveGeminiTextPricing).
   */
  [GEMINI_TEXT_MODELS.FLASH_SUSTAINED]: Object.freeze({
    rpm: null,
    tpm: null,
    rpd: null,
    freeTierAvailable: false,
    label: 'Gemini 3.6 Flash',
    recommendation: '선불 유료. 긴 글·복잡한 주제에서 지속 추론이 필요할 때 쓰세요.',
  }),
  /** [2026-11-07] 최상위. 무료 티어가 없고 단가가 높다 — 화면에서 직접 고른 경우에만 쓰인다. */
  [GEMINI_TEXT_MODELS.ARGON]: Object.freeze({
    rpm: null,
    tpm: null,
    rpd: null,
    freeTierAvailable: false,
    label: 'Gemini 4 Argon',
    recommendation: '선불 유료 최상위 모델. 비용이 크니 중요한 글에만 쓰세요.',
  }),
});

export const GEMINI_FREE_TIER_DOC_URL = 'https://ai.google.dev/gemini-api/docs/rate-limits';
export const GEMINI_FREE_TIER_DOC_DATE = '2026-07-03';

export function getGeminiFreeTierLimit(modelName: string): GeminiFreeTierLimit | undefined {
  const normalized = normalizeGeminiTextModelId(modelName) as GeminiTextModelId;
  return GEMINI_TEXT_FREE_TIER_LIMITS[normalized];
}

export function getGeminiFreeTierDailyLimit(modelName: string): number | null {
  return getGeminiFreeTierLimit(modelName)?.rpd ?? null;
}

export function formatGeminiFreeTierSummary(): string {
  return [
    'Flash-Lite의 활성 RPM·TPM·RPD는 Google AI Studio 프로젝트 화면에서 확인하세요.',
    'Gemini 3.8 Flash·3.6 Flash·4 Argon은 선불 유료 모델이며 앱은 Pro Preview를 제공하지 않습니다.',
    '한도는 API 키가 아니라 프로젝트 단위이며 RPD는 태평양 시간 자정에 초기화됩니다.',
  ].join(' · ');
}
