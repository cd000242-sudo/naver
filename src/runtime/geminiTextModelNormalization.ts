/**
 * Gemini text model IDs shared by the main process and renderer bundle.
 *
 * [2026-08-11] 공식 문서(ai.google.dev/gemini-api/docs/pricing) 확인:
 *   gemini-3.6-flash  Stable   입력 $1.50 / 출력 $7.50   ← 최신이면서 3.5 보다 싸다
 *   gemini-3.5-flash  Stable   입력 $1.50 / 출력 $9.00
 *   gemini-3.1-pro    **Preview** — 선불 티어에서 호출이 막힌다
 *
 * PRO 는 뺐다. 고를 수 있는데 안 되는 모델은 조용한 실패를 만든다.
 * 아래 마이그레이션 맵이 기존에 Pro 를 저장해 둔 사용자를 안전한 모델로 옮긴다.
 */
export const GEMINI_TEXT_MODELS = {
  FLASH_LITE: 'gemini-3.1-flash-lite',
  FLASH: 'gemini-3.6-flash',
  /** 지속 추론이 필요한 긴 글용. Stable 이라 티어 제한이 없다. */
  FLASH_SUSTAINED: 'gemini-3.5-flash',
} as const;

const GEMINI_TEXT_MODEL_MIGRATIONS: Readonly<Record<string, string>> = {
  'gemini-2.5-flash-lite': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-2.5-flash': GEMINI_TEXT_MODELS.FLASH,
  'gemini-2.5-pro': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-2.5-pro-preview': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-3-flash-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-3.1-flash-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-3-pro-preview': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-3.1-pro-preview': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-1.5-flash': GEMINI_TEXT_MODELS.FLASH,
  'gemini-1.5-flash-8b': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-1.5-pro': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-pro': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-pro-vision': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-2.0-flash': GEMINI_TEXT_MODELS.FLASH,
  'gemini-2.0-flash-001': GEMINI_TEXT_MODELS.FLASH,
  // [2026-08-11] 3.5 를 골라둔 사용자는 그대로 둔다 — Stable 이라 문제없다.
  //   (여기 없는 값은 아래 지원 목록 검사에서 그대로 통과한다)
};

/**
 * Upgrade a saved Gemini text model to the supported prepaid/value matrix.
 * Pro selections are intentionally migrated to Flash-Lite: Pro Preview has
 * no API free tier and is not offered by this consumer-facing product.
 */
export function normalizeGeminiTextModelId(value: unknown): string {
  const model = String(value || '').trim();
  if (!model) return GEMINI_TEXT_MODELS.FLASH_LITE;
  if (model === GEMINI_TEXT_MODELS.FLASH_LITE
      || model === GEMINI_TEXT_MODELS.FLASH
      || model === GEMINI_TEXT_MODELS.FLASH_SUSTAINED) {
    return model;
  }
  return GEMINI_TEXT_MODEL_MIGRATIONS[model] || model;
}

/**
 * Consumer text generation uses one safe Gemini prepaid/default model. Keep
 * non-Gemini selections intact so callers can reject provider mismatches
 * instead of silently changing providers.
 */
export function normalizeGeminiPrepaidTextModelId(value: unknown): string {
  const rawModel = String(value || '').trim();
  if (rawModel.toLowerCase().includes('-pro')) {
    return GEMINI_TEXT_MODELS.FLASH_LITE;
  }

  const normalizedModel = normalizeGeminiTextModelId(value);
  if (!normalizedModel.startsWith('gemini-')) return normalizedModel;
  // [2026-08-11] 3.5 Flash 도 Stable 이라 선불에서 그대로 쓸 수 있다.
  if (normalizedModel === GEMINI_TEXT_MODELS.FLASH_LITE
      || normalizedModel === GEMINI_TEXT_MODELS.FLASH
      || normalizedModel === GEMINI_TEXT_MODELS.FLASH_SUSTAINED) {
    return normalizedModel;
  }
  return GEMINI_TEXT_MODELS.FLASH_LITE;
}
