/**
 * "Codex 구독 이미지" image engine: identity and label.
 *
 * The engine draws with the image_gen tool of the user's ChatGPT subscription (Codex CLI), so there is no API
 * billing — it spends the subscription's usage window. Pure module (no imports) so the engine catalog can use it.
 */
export const CODEX_IMAGE_ENGINE = 'codex-image';
export const CODEX_IMAGE_ENGINE_LABEL = 'Codex 구독 이미지 (GPT 이미지 · 별도 비용 없음)';

export function isCodexImageEngine(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === CODEX_IMAGE_ENGINE;
}
