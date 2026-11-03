/**
 * "관련 사진 찾기" image engine: identity, label and the copyright-consent contract.
 *
 * The engine collects real news/article photos instead of generating images. The user's agreement is stored in the
 * main config as `imageCollectConsent` so unattended flows (continuous, multi-account, daily) can read it in main.
 * Raising IMAGE_COLLECT_CONSENT_VERSION makes every user agree again. The renderer keeps its own copy of the version
 * (it cannot import this file into the inline bundle); a test pins the two together.
 */
export const COLLECT_PHOTOS_ENGINE = 'collect-photos';
export const COLLECT_PHOTOS_ENGINE_LABEL = '관련 사진 찾기 (뉴스·기사 사진 · 무료)';
export const IMAGE_COLLECT_CONSENT_VERSION = 1;

export interface ImageCollectConsent {
  readonly version: number;
  readonly agreedAt: string;
}

export const COLLECT_CONSENT_REQUIRED_MESSAGE =
  '관련 사진 찾기를 쓰려면 저작권 안내에 먼저 동의해 주세요 — 이미지 설정에서 다시 고르면 안내가 뜹니다.';

export function isCollectPhotosEngine(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === COLLECT_PHOTOS_ENGINE;
}

/** True only for a record written by the current copy of the notice (same version or newer, with a date). */
export function isImageCollectConsentValid(value: unknown): value is ImageCollectConsent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.version === 'number' && Number.isFinite(record.version)
    && record.version >= IMAGE_COLLECT_CONSENT_VERSION
    && typeof record.agreedAt === 'string' && record.agreedAt.trim().length > 0;
}

export function buildImageCollectConsent(now: Date = new Date()): ImageCollectConsent {
  return { version: IMAGE_COLLECT_CONSENT_VERSION, agreedAt: now.toISOString() };
}
