// ✅ [2026-02-11] DALL-E 3, Pexels, Imagen4 제거 (미사용 엔진 정리)
export type ImageProvider = 'pollinations' | 'stability' | 'naver' | 'loremflickr' | 'picsum' | 'placeholder' | 'nano-banana-pro' | 'nano-banana-pro-fallback' | 'prodia' | 'falai' | 'deepinfra' | 'collected-image' | 'collected-image-with-text';

export interface ImageRequestItem {
  heading: string;
  prompt: string;
  englishPrompt?: string; // 영어 프롬프트 (선택사항)
  isThumbnail?: boolean; // ✅ 썸네일 여부 (첫 번째 소제목만 true)
  allowText?: boolean; // ✅ 상세페이지/인포그래픽 등 텍스트 포함 허용
  category?: string; // ✅ 카테고리 (이미지 스타일 결정용)
  referenceImagePath?: string; // 로컬 참조 이미지 경로
  referenceImageUrl?: string; // 원격 참조 이미지 URL
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
}

export interface GeneratedImage {
  heading: string;
  filePath: string;
  previewDataUrl: string;
  provider: ImageProvider;
  savedToLocal?: string;
  url?: string; // ✅ 이미지 URL (수집만 할 때 사용)
  sourceUrl?: string; // ✅ 원본 출처 URL (alt 태그에 출처 표시용)
  originalIndex?: number; // ✅ [2026-01-24] 원래 items 배열의 인덱스 (필터링 후에도 위치 추적)
}

export const ALLOWED_PROVIDER: ImageProvider[] = ['pollinations', 'stability', 'naver', 'loremflickr', 'picsum', 'placeholder', 'nano-banana-pro', 'nano-banana-pro-fallback', 'prodia', 'falai', 'deepinfra', 'collected-image', 'collected-image-with-text'];

export function assertProvider(provider: string): asserts provider is ImageProvider {
  if (!ALLOWED_PROVIDER.includes(provider as ImageProvider)) {
    throw new Error(`지원하지 않는 이미지 제공자입니다: ${provider}`);
  }
}



























