export const LEGACY_FREE_GEMINI_IMAGE_MODEL_KEY = 'gemini-2.0-flash-exp';

export const IMAGE_MODEL_SELECTION_REQUIRED_CODE = 'IMAGE_MODEL_SELECTION_REQUIRED';

export interface ValidatedGeminiImageModelConfiguration {
  readonly mainModel: string;
  readonly subModel: string;
}

export function isImageModelSelectionRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(`[${IMAGE_MODEL_SELECTION_REQUIRED_CODE}]`);
}

export function assertCurrentGeminiImageModelSelection(value: unknown): string {
  const modelKey = String(value ?? '').trim();

  if (modelKey === LEGACY_FREE_GEMINI_IMAGE_MODEL_KEY) {
    throw new Error(
      `[${IMAGE_MODEL_SELECTION_REQUIRED_CODE}] 이전 무료 실험 이미지 모델은 종료되었습니다. `
      + '환경설정에서 현재 이미지 모델과 비용을 확인한 뒤 다시 선택해주세요.',
    );
  }

  return modelKey;
}

export function assertCurrentGeminiImageModelConfiguration(
  mainModel: unknown,
  subModel: unknown,
): ValidatedGeminiImageModelConfiguration {
  return Object.freeze({
    mainModel: assertCurrentGeminiImageModelSelection(mainModel),
    subModel: assertCurrentGeminiImageModelSelection(subModel),
  });
}
