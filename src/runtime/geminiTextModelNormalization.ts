/**
 * Gemini text model IDs shared by the main process and renderer bundle.
 *
 * [2026-11-03] 최신 세대로 이동 (메인 세션 조사, 모델 ID 실존은 무료 모델 목록 호출로 확인 예정):
 *   gemini-3.8-flash       균형  — 구글 what's-new 문서의 "newest Flash"
 *   gemini-3.5-flash-lite  가성비 — $0.30 / $2.50 (3.1 Lite $0.25 / $1.50 보다 비싸다)
 *   gemini-3.6-flash       직전 세대 — 운영 유지 (3.8 Flash 와 같은 가격 일정)
 *
 * [2026-11-07] 최상위 칸에 gemini-4-argon 추가 (2026-10-13 GA, 무료 티어 없음). 기본(균형)은 3.8 Flash 그대로이고,
 *   저장돼 있던 3.6 Flash 는 목록에 남아 있으므로 그대로 보존한다.
 *
 * ⚠️ 저장값 충돌: 'gemini-3.6-flash' 는 옛 균형 티어 ID 이자 새 프리미엄 ID 다.
 *   상태 없는 정규화로는 둘을 구분할 수 없어 저장된 3.6 은 그대로 3.6(모델 불변)으로 둔다.
 *
 * PRO 는 뺐다. 고를 수 있는데 안 되는 모델은 조용한 실패를 만든다.
 * 아래 마이그레이션 맵이 기존에 Pro 를 저장해 둔 사용자를 안전한 모델로 옮긴다.
 */
export const GEMINI_TEXT_MODELS = {
  FLASH_LITE: 'gemini-3.5-flash-lite',
  FLASH: 'gemini-3.8-flash',
  /** 지속 추론이 필요한 긴 글용 (직전 세대). Stable 이라 티어 제한이 없다. */
  FLASH_SUSTAINED: 'gemini-3.6-flash',
  /** 최상위 (고가, 선불 필수). 화면에서 고를 때만 쓰인다 — 기본값이 아니다. */
  ARGON: 'gemini-4-argon',
} as const;

const GEMINI_TEXT_MODEL_MIGRATIONS: Readonly<Record<string, string>> = {
  // [2026-11-03] 직전 세대 -> 같은 티어의 새 ID. (gemini-3.6-flash 는 아래 지원 목록 검사로 그대로 통과)
  'gemini-3.1-flash-lite': GEMINI_TEXT_MODELS.FLASH_LITE,
  'gemini-3.5-flash': GEMINI_TEXT_MODELS.FLASH_SUSTAINED,
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
  // (여기 없는 값은 아래 지원 목록 검사에서 그대로 통과한다)
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
      || model === GEMINI_TEXT_MODELS.FLASH_SUSTAINED
      || model === GEMINI_TEXT_MODELS.ARGON) {
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
  // 프리미엄(직전 세대) Flash 도 Stable 이라 선불에서 그대로 쓸 수 있다.
  if (normalizedModel === GEMINI_TEXT_MODELS.FLASH_LITE
      || normalizedModel === GEMINI_TEXT_MODELS.FLASH
      || normalizedModel === GEMINI_TEXT_MODELS.FLASH_SUSTAINED
      || normalizedModel === GEMINI_TEXT_MODELS.ARGON) {
    return normalizedModel;
  }
  return GEMINI_TEXT_MODELS.FLASH_LITE;
}
