// src/ui/types/index.ts
// UI 관련 타입 정의

/**
 * 구조화된 콘텐츠 타입
 */
export interface StructuredContent {
    selectedTitle: string;
    titleCandidates?: string[];
    content: string;
    bodyPlain?: string;
    headings?: HeadingInfo[];
    hashtags?: string[];
    category?: string;
    tone?: string;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * 소제목 정보
 */
export interface HeadingInfo {
    title: string;
    summary?: string;
    imagePrompt?: string;
    content?: string;
}

/**
 * 생성된 이미지 타입
 */
export interface GeneratedImage {
    heading: string;
    url?: string;
    filePath?: string;
    prompt?: string;
    source?: 'gemini' | 'naver' | 'pollinations' | 'prodia' | 'falai' | 'local';
    isVideo?: boolean;
    videoUrl?: string;
}

/**
 * CTA (Call-To-Action) 타입
 */
export interface CtaItem {
    text: string;
    link?: string;
}

/**
 * 저장된 글 타입
 */
export interface SavedPost {
    id: string;
    title: string;
    content: string;
    hashtags?: string[];
    category?: string;
    images?: GeneratedImage[];
    ctas?: CtaItem[];
    publishedUrl?: string;
    publishedAt?: string;
    createdAt: string;
    updatedAt?: string;
    isFavorite?: boolean;
}

/**
 * 계정 정보 타입
 */
export interface AccountInfo {
    id: string;
    username: string;
    blogId?: string;
    profileImage?: string;
    lastLoginAt?: string;
}

/**
 * 자동화 옵션 타입
 */
export interface AutomationOptions {
    mode: 'full-auto' | 'semi-auto';
    publishMode: 'publish' | 'draft' | 'schedule';
    scheduleDate?: string;
    imageSource: string;
    skipImages?: boolean;
    skipCta?: boolean;
    ctas?: CtaItem[];
    ctaPosition?: 'top' | 'middle' | 'bottom';
    affiliateLink?: string;
    category?: string;
}

/**
 * 진행 상태 타입
 */
export interface ProgressState {
    step: string;
    progress: number;
    message?: string;
    subMessage?: string;
}
