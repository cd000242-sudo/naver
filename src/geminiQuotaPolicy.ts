export type GeminiTextModelId =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-pro';

export interface GeminiFreeTierLimit {
  rpm: number;
  tpm: number;
  rpd: number;
  label: string;
  recommendation: string;
}

export const GEMINI_TEXT_FREE_TIER_LIMITS: Record<GeminiTextModelId, GeminiFreeTierLimit> = Object.freeze({
  'gemini-2.5-flash': Object.freeze({
    rpm: 10,
    tpm: 250_000,
    rpd: 250,
    label: 'Gemini 2.5 Flash',
    recommendation: '기본 추천. 품질과 속도 균형이 가장 무난합니다.',
  }),
  'gemini-2.5-flash-lite': Object.freeze({
    rpm: 15,
    tpm: 250_000,
    rpd: 1_000,
    label: 'Gemini 2.5 Flash-Lite',
    recommendation: '무료 티어에서 가장 많이 생성할 수 있습니다.',
  }),
  'gemini-2.5-pro': Object.freeze({
    rpm: 5,
    tpm: 250_000,
    rpd: 100,
    label: 'Gemini 2.5 Pro',
    recommendation: '품질은 높지만 무료 한도가 작아 대량 발행에는 맞지 않습니다.',
  }),
});

export const GEMINI_FREE_TIER_DOC_URL = 'https://ai.google.dev/gemini-api/docs/rate-limits';
export const GEMINI_FREE_TIER_DOC_DATE = '2026-05-28';

export function getGeminiFreeTierLimit(modelName: string): GeminiFreeTierLimit | undefined {
  return GEMINI_TEXT_FREE_TIER_LIMITS[modelName as GeminiTextModelId];
}

export function getGeminiFreeTierDailyLimit(modelName: string): number {
  return getGeminiFreeTierLimit(modelName)?.rpd ?? GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-flash'].rpd;
}

export function formatGeminiFreeTierSummary(): string {
  const flash = GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-flash'];
  const lite = GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-flash-lite'];
  const pro = GEMINI_TEXT_FREE_TIER_LIMITS['gemini-2.5-pro'];
  return [
    `Flash: ${flash.rpd.toLocaleString()}회/일, ${flash.rpm}회/분`,
    `Flash-Lite: ${lite.rpd.toLocaleString()}회/일, ${lite.rpm}회/분`,
    `Pro: ${pro.rpd.toLocaleString()}회/일, ${pro.rpm}회/분`,
    '한도는 API 키가 아니라 Google AI Studio 프로젝트 단위입니다.',
    'RPD는 태평양 시간 자정에 초기화됩니다.',
  ].join(' · ');
}
