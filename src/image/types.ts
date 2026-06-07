// ✅ [2026-02-22] 이미지 프로바이더 정리: Fal.ai, Pollinations, Prodia, Stability AI 제거 → DALL-E, Leonardo AI 추가
// ✅ [2026-03-15] ImageFX 프로바이더 추가 (메인 무료 이미지 생성)
// ✅ [v1.4.80] 'flow' 추가 — Google Labs Flow (Nano Banana Pro 무료 쿼터 엔진)
// ✅ [v2.10.335] 나노바나나 3종 분리 — 'nano-banana'(2.5)/'nano-banana-2'(3.1)/'nano-banana-pro'(3-pro)
//   각각 별개 모델로 라우팅. v2.7.28의 통합 정규화는 제거됨.
// ✅ [v2.11.7] 'dropshot' 추가 — 리더스 나노바나나 무제한 (UI 자동화 엔진)
export type ImageProvider = 'naver' | 'loremflickr' | 'picsum' | 'placeholder' | 'nano-banana' | 'nano-banana-2' | 'nano-banana-pro' | 'nano-banana-pro-fallback' | 'imagen-4-fallback' | 'gemini-2.5-flash-fallback' | 'gemini-3.1-flash-image-preview-fallback' | 'gemini-3-pro-image-preview-fallback' | 'imagen-4.0-generate-001-fallback' | 'gemini-2.5-flash-image-fallback' | 'deepinfra' | 'openai-image' | 'dall-e-3' | 'leonardoai' | 'collected-image' | 'collected-image-with-text' | 'imagefx' | 'flow' | 'dropshot' | 'local-folder';

export type ImageFallbackPolicy = 'engine-only' | 'ask' | 'guarantee';

export const IMAGE_FALLBACK_POLICIES: ImageFallbackPolicy[] = ['engine-only', 'ask', 'guarantee'];

export function normalizeImageFallbackPolicy(value: unknown): ImageFallbackPolicy {
  return IMAGE_FALLBACK_POLICIES.includes(value as ImageFallbackPolicy)
    ? value as ImageFallbackPolicy
    : 'engine-only';
}

export interface ImageRequestItem {
  heading: string;
  prompt: string;
  englishPrompt?: string; // 영어 프롬프트 (선택사항)
  isThumbnail?: boolean; // ✅ 썸네일 여부 (첫 번째 소제목만 true)
  allowText?: boolean; // ✅ 상세페이지/인포그래픽 등 텍스트 포함 허용
  category?: string; // ✅ 카테고리 (이미지 스타일 결정용)
  referenceImagePath?: string; // 로컬 참조 이미지 경로
  referenceImageUrl?: string; // 원격 참조 이미지 URL
  referenceImageList?: string[]; // URL reference list for UI-based img2img engines
  visualQueries?: string[]; // ✅ AI가 생성한 시각적 검색 키워드 (사람 같은 수집용)
}

export interface GenerateImagesOptions {
  provider: ImageProvider;
  items: ImageRequestItem[];
  styleHint?: string;
  postTitle?: string;
  postId?: string; // ✅ 글 ID (폴더 구조용)
  regenerate?: boolean; // ✅ 재생성 모드 (다른 이미지 선택)
  sourceUrl?: string; // ✅ 크롤링한 원본 URL (이미지 수집용)
  articleUrl?: string; // ✅ 뉴스 기사 URL (이미지 수집용)
  isFullAuto?: boolean; // ✅ 풀오토 모드 (100% 성공률 보장)
  referenceImagePath?: string; // ✅ 전역 참조 이미지 경로 (모든 이미지에 공통 적용)
  isShoppingConnect?: boolean; // ✅ 쇼핑커넥트 모드 여부
  collectedImages?: string[]; // ✅ 수집된 이미지 URL 목록
  crawledImages?: string[]; // ✅ [2026-01-28] 크롤링에서 수집된 이미지 URL (img2img 참조용)
  stopCheck?: () => boolean; // ✅ [100점 수정] 중지 여부 확인 콜백
  thumbnailTextInclude?: boolean; // ✅ [2026-01-28] 1번 이미지에 텍스트 포함 여부
  category?: string; // ✅ [2026-02-12] 전체 배치의 카테고리 (items에 개별 category 없을 때 폴백)
  isContinuousMode?: boolean;
  isMultiAccount?: boolean;
  forceSequential?: boolean;
  /**
   * 선택 엔진 실패/부적합 시 동작.
   * - engine-only: 선택 엔진만 사용, 자동 대체 금지
   * - ask: 선택 엔진 우선, 대체가 필요하면 renderer에서 사용자 확인
   * - guarantee: 결과 보장 우선, 허용된 대체 경로 자동 사용
   */
  imageFallbackPolicy?: ImageFallbackPolicy;
}

export interface GeneratedImage {
  // ---- new fields (SPEC-IMAGE-MODEL-001 Phase 2) ----
  // NOTE: optional now for safe backward compat with legacy in-memory objects
  // that did not go through writeImageFile in Phase 2+.
  // These will become required after Phase 6 migration completes (Phase 7 upgrade).
  /** ULID — primary key for blob store lookup. Non-optional after Phase 6 migration. */
  blobId?: string;
  /** MIME type: image/png | image/jpeg | image/webp. Non-optional after Phase 6 migration. */
  mimeType?: string;
  /** Image width in pixels. Non-optional after Phase 6 migration. */
  width?: number;
  /** Image height in pixels. Non-optional after Phase 6 migration. */
  height?: number;
  /** Byte size for integrity check. Non-optional after Phase 6 migration. */
  byteSize?: number;
  /** SHA-256 hex digest — dedup key for migration. Non-optional after Phase 6 migration. */
  sha256?: string;
  /** Creation timestamp (epoch ms). Non-optional after Phase 6 migration. */
  createdAt?: number;

  // ---- existing (legacy, deprecated by SPEC-IMAGE-MODEL-001 Phase 7) ----
  heading: string;
  /**
   * @deprecated SPEC-IMAGE-MODEL-001 Phase 7. Use `blobId` for new code.
   * Absolute fs path — superseded by blob store. Will be removed after migration usage stabilizes.
   */
  filePath: string;
  /**
   * @deprecated SPEC-IMAGE-MODEL-001 Phase 7. Use `blobId` + blob.read() for new code.
   * Base64 data URL — superseded by blob store. Will be removed after migration usage stabilizes.
   */
  previewDataUrl: string;
  provider: ImageProvider;
  /**
   * @deprecated SPEC-IMAGE-MODEL-001 Phase 7. Use `blobId` for new code.
   * Documents mirror path — superseded by blob store. Will be removed after migration usage stabilizes.
   */
  savedToLocal?: string;
  /**
   * @deprecated SPEC-IMAGE-MODEL-001 Phase 7. Use `blobId` for new code.
   * http(s)/blob display URL — superseded by blob store. Will be removed after migration usage stabilizes.
   */
  url?: string;
  sourceUrl?: string; // ✅ 원본 출처 URL (alt 태그에 출처 표시용)
  originalIndex?: number; // ✅ [2026-01-24] 원래 items 배열의 인덱스 (필터링 후에도 위치 추적)
  isThumbnail?: boolean; // ✅ [2026-03-18 FIX] 썸네일 여부 (서론 위 이미지 배치에 사용)
  requestedProvider?: string; // 사용자가 선택/요청한 엔진
  actualProvider?: string; // 실제 산출물을 만든 엔진 또는 대체 출처
  fallbackUsed?: boolean;
  fallbackReason?: string;
  imageFallbackPolicy?: ImageFallbackPolicy;
}

// ✅ [v1.4.80] 'flow' 추가 — assertProvider 통과 허용 (Google Labs Flow 엔진 활성화)
// ✅ [v2.8.2] 'dall-e-3' 추가 — UI 옵션은 v2.7.15부터 있었지만 ALLOWED_PROVIDER에서 누락되어 assertProvider 실패 후 폴백되던 회귀 차단
// ✅ [v2.10.335] 'nano-banana'·'nano-banana-2' 추가 — 나노바나나 3종 분리 (각각 별개 모델 라우팅)
// ✅ [v2.11.7] 'dropshot' 추가 — assertProvider 통과 허용 (리더스 나노바나나 무제한 엔진)
export const ALLOWED_PROVIDER: ImageProvider[] = ['naver', 'loremflickr', 'picsum', 'placeholder', 'nano-banana', 'nano-banana-2', 'nano-banana-pro', 'nano-banana-pro-fallback', 'imagen-4-fallback', 'gemini-2.5-flash-fallback', 'gemini-3.1-flash-image-preview-fallback', 'gemini-3-pro-image-preview-fallback', 'imagen-4.0-generate-001-fallback', 'gemini-2.5-flash-image-fallback', 'deepinfra', 'openai-image', 'dall-e-3', 'leonardoai', 'collected-image', 'collected-image-with-text', 'imagefx', 'flow', 'dropshot', 'local-folder'];

export function assertProvider(provider: string): asserts provider is ImageProvider {
  if (!ALLOWED_PROVIDER.includes(provider as ImageProvider)) {
    throw new Error(`지원하지 않는 이미지 제공자입니다: ${provider}`);
  }
}



























