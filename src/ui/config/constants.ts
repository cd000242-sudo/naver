// src/ui/config/constants.ts
// 전역 상수 및 설정값

/**
 * 애플리케이션 설정
 */
export const APP_CONFIG = {
    name: 'Naver Blog Automation',
    version: '1.0.4',
    maxRetries: 3,
    defaultTimeout: 30000
} as const;

/**
 * 지연 시간 설정 (ms)
 */
export const DELAYS = {
    SHORT: 150,
    MEDIUM: 300,
    LONG: 500,
    VERY_LONG: 1000,
    TYPING_MIN: 30,
    TYPING_MAX: 80,
    PAGE_LOAD: 3000,
    API_RETRY: 2000
} as const;

/**
 * UI 설정
 */
export const UI_CONFIG = {
    maxLogLines: 500,
    debounceWait: 300,
    throttleLimit: 1000,
    animationDuration: 200,
    toastDuration: 3000,
    modalFadeIn: 150
} as const;

/**
 * 이미지 설정
 */
export const IMAGE_CONFIG = {
    maxWidth: 1200,
    maxHeight: 800,
    thumbnailWidth: 600,
    thumbnailHeight: 400,
    quality: 0.9,
    supportedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const
} as const;

/**
 * 콘텐츠 설정
 */
export const CONTENT_CONFIG = {
    minTitleLength: 10,
    maxTitleLength: 50,
    minContentLength: 500,
    maxContentLength: 10000,
    maxHashtags: 10,
    maxCtaCount: 5
} as const;

/**
 * 에러 메시지
 */
export const ERROR_MESSAGES = {
    NETWORK_ERROR: '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.',
    API_KEY_MISSING: 'API 키가 설정되지 않았습니다.',
    LOGIN_REQUIRED: '로그인이 필요합니다.',
    CONTENT_TOO_SHORT: '콘텐츠가 너무 짧습니다.',
    IMAGE_LOAD_FAILED: '이미지 로드에 실패했습니다.',
    UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.'
} as const;

/**
 * 성공 메시지
 */
export const SUCCESS_MESSAGES = {
    CONTENT_GENERATED: '콘텐츠가 성공적으로 생성되었습니다.',
    PUBLISHED: '글이 성공적으로 발행되었습니다.',
    SAVED: '저장되었습니다.',
    COPIED: '클립보드에 복사되었습니다.'
} as const;
