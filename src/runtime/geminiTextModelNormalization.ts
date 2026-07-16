/** Gemini text model IDs shared by the main process and renderer bundle. */
export const GEMINI_TEXT_MODELS = {
  FLASH_LITE: 'gemini-3.1-flash-lite',
  FLASH: 'gemini-3.5-flash',
  PRO: 'gemini-3.1-pro-preview',
} as const;

const GEMINI_TEXT_MODEL_MIGRATIONS: Readonly<Record<string, string>> = {
  'gemini-2.5-flash-lite': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-2.5-flash': GEMINI_TEXT_MODELS.FLASH,
  'gemini-2.5-pro': GEMINI_TEXT_MODELS.FLASH,
  'gemini-2.5-pro-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-3-flash-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-3.1-flash-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-3-pro-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-3.1-pro-preview': GEMINI_TEXT_MODELS.FLASH,
  'gemini-1.5-flash': GEMINI_TEXT_MODELS.FLASH,
  'gemini-1.5-flash-8b': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-1.5-pro': GEMINI_TEXT_MODELS.FLASH,
  'gemini-pro': GEMINI_TEXT_MODELS.FLASH,
  'gemini-pro-vision': GEMINI_TEXT_MODELS.FLASH,
  'gemini-2.0-flash': GEMINI_TEXT_MODELS.FLASH,
  'gemini-2.0-flash-001': GEMINI_TEXT_MODELS.FLASH,
};

/**
 * Upgrade a saved Gemini text model to the supported prepaid/value matrix.
 * Pro selections are intentionally migrated to stable Flash: Pro Preview has
 * no API free tier and is not offered by this consumer-facing product.
 */
export function normalizeGeminiTextModelId(value: unknown): string {
  const model = String(value || '').trim();
  if (!model) return GEMINI_TEXT_MODELS.FLASH_LITE;
  if (model === GEMINI_TEXT_MODELS.FLASH_LITE
      || model === GEMINI_TEXT_MODELS.FLASH) {
    return model;
  }
  return GEMINI_TEXT_MODEL_MIGRATIONS[model] || model;
}
