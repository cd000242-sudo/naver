import {
  GEMINI_TEXT_MODELS,
  normalizeGeminiTextModelId,
} from './runtime/modelRegistry.js';

export type GeminiTextModelId =
  | typeof GEMINI_TEXT_MODELS.FLASH_LITE
  | typeof GEMINI_TEXT_MODELS.FLASH
  | typeof GEMINI_TEXT_MODELS.PRO;

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
    label: 'Gemini 3.1 Flash-Lite',
    recommendation: '가성비 및 대량 처리용. 현재 한도는 AI Studio에서 확인합니다.',
  }),
  [GEMINI_TEXT_MODELS.FLASH]: Object.freeze({
    rpm: null,
    tpm: null,
    rpd: null,
    freeTierAvailable: true,
    label: 'Gemini 3.5 Flash',
    recommendation: '품질·속도 균형 기본 모델. 현재 한도는 AI Studio에서 확인합니다.',
  }),
  [GEMINI_TEXT_MODELS.PRO]: Object.freeze({
    rpm: null,
    tpm: null,
    rpd: null,
    freeTierAvailable: false,
    label: 'Gemini 3.1 Pro Preview',
    recommendation: 'API 무료 티어가 없는 프리미엄 Preview 모델입니다.',
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
    'Flash 및 Flash-Lite의 활성 RPM·TPM·RPD는 Google AI Studio 프로젝트 화면에서 확인하세요.',
    'Gemini 3.1 Pro Preview는 Gemini API 무료 티어가 없습니다.',
    '한도는 API 키가 아니라 프로젝트 단위이며 RPD는 태평양 시간 자정에 초기화됩니다.',
  ].join(' · ');
}
