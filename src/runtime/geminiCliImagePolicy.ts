/**
 * "Gemini 구독 이미지" image engine: identity and label.
 *
 * The engine draws with the image-generator sub-agent of the user's Antigravity (agy / Gemini CLI) subscription, so
 * there is no API billing — it spends the subscription's usage window. Pure module (no imports) so the engine
 * catalog can use it.
 */
export const GEMINI_CLI_IMAGE_ENGINE = 'gemini-cli-image';
export const GEMINI_CLI_IMAGE_ENGINE_LABEL = 'Gemini 구독 이미지 (Gemini CLI · 별도 비용 없음)';

export function isGeminiCliImageEngine(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === GEMINI_CLI_IMAGE_ENGINE;
}
