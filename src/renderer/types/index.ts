/**
 * renderer.ts 공유 타입 정의
 * Phase 0 Step 0-1: 모든 타입을 한 곳에서 관리
 *
 * ⚠️ 현재는 추가만 합니다. renderer.ts의 기존 타입은 아직 삭제하지 않습니다.
 * Step 0-2에서 import 전환 후 기존 중복을 제거합니다.
 */

// ── Generator 유니온 타입 (한 곳에서만 관리) ──
export type GeneratorType = 'gemini' | 'openai' | 'claude' | 'perplexity';

// ── 자동화 이미지 ──
export type RendererAutomationImage = {
    heading: string;
    filePath: string;
    provider: string;
    alt?: string;
    caption?: string;
};

// ── 자동화 결과 상태 ──
export type RendererStatus =
    | { success: true }
    | { success: false; cancelled?: boolean; message?: string };

// ── 자동화 페이로드 (renderer.ts + global.d.ts 통합본) ──
// StructuredContent, RendererAutomationImage는 global.d.ts에서 ambient 선언됨
export type RendererAutomationPayload = {
    naverId: string;
    naverPassword: string;
    title?: string;
    content?: string;
    lines?: string[];
    selectedHeadings?: string[];
    structuredContent?: any; // StructuredContent (global.d.ts ambient)
    generatedImages?: RendererAutomationImage[];
    hashtags?: string[];
    generator?: GeneratorType;
    keywords?: string[];
    draft?: string;
    rssUrl?: string;
    autoGenerate?: boolean;
    publishMode?: 'draft' | 'publish' | 'schedule';
    scheduleDate?: string;
    scheduleType?: 'app-schedule' | 'naver-server';
    scheduleMethod?: 'datetime-local' | 'individual-inputs';
    ctaLink?: string;
    ctaText?: string;
    ctas?: Array<{ text: string; link?: string }>;
    ctaPosition?: 'top' | 'middle' | 'bottom';
    skipCta?: boolean;
    skipImages?: boolean;
    targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
    toneStyle?: 'professional' | 'friendly' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info';
    keepBrowserOpen?: boolean;
    thumbnailPath?: string;
    skipDailyLimitWarning?: boolean;
    imageMode?: 'full-auto' | 'semi-auto' | 'manual' | 'skip';
    collectedImages?: Array<{ id: string; url: string; thumbnailUrl: string; title: string; source: string; tags?: string[] }>;
    postId?: string;
    categoryName?: string;
    stabilityModel?: string;
    convertToGif?: boolean;
    videoProvider?: string;
    useIntelligentImagePlacement?: boolean;
    onlyImagePlacement?: boolean;
    useAiImage?: boolean;
    createProductThumbnail?: boolean;
    affiliateLink?: string;
    contentMode?: string;
    useAffiliateVideo?: boolean;
    includeThumbnailText?: boolean;
    customBannerPath?: string;
    useAiTableImage?: boolean;
    useAiBanner?: boolean;
    autoBannerGenerate?: boolean;
    previousPostTitle?: string;
    previousPostUrl?: string;
};

// ── 연속발행 큐 아이템 ──
export interface ContinuousQueueItem {
    id: string;
    type: 'url' | 'keyword';
    value: string;
    additionalUrls?: string[];
    customTitle?: string;
    customKeyword?: string;
    imageSource: string;
    interval: number;
    publishMode: 'publish' | 'draft' | 'schedule';
    scheduleDate?: string;
    scheduleTime?: string;
    scheduleType?: 'app-schedule' | 'naver-server';
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    ctaType?: string;
    ctaUrl?: string;
    ctaText?: string;
    category?: string;
    contentMode?: 'seo' | 'homefeed' | 'affiliate' | 'custom';
    toneStyle?: string;
    realCategory?: string;
    realCategoryName?: string;
    includeThumbnailText?: boolean;
    useAiImage?: boolean;
    createProductThumbnail?: boolean;
    affiliateLink?: string;
    videoOption?: boolean;
    previousPostUrl?: string;
    previousPostTitle?: string;
    keywordAsTitle?: boolean;
    keywordTitlePrefix?: boolean;
    scheduleUserModified?: boolean;   // ✅ [2026-03-17] 사용자 수동 예약 설정 보호 플래그
}

// ── 생성된 글 ──
export interface GeneratedPost {
    id: string;
    title: string;
    content: string;
    hashtags: string[];
    headings: any[];
    structuredContent?: any; // StructuredContent (global.d.ts ambient)
    createdAt: string;
    updatedAt?: string;
    images?: Array<{ heading?: string; filePath?: string; previewDataUrl?: string; provider?: string; savedToLocal?: boolean; url?: string; thumbnail?: string }>;
    imageCount?: number;
    isFavorite?: boolean;
    category?: string;
    publishedUrl?: string;
    publishedAt?: string;
    isPublished?: boolean;
    publishMode?: 'draft' | 'publish' | 'schedule'; // ✅ [2026-03-05] 발행 상태 구분
    toneStyle?: string;
    ctaText?: string;
    ctaLink?: string;
    ctas?: Array<{ text: string; link?: string }>;
    articleType?: string;
    naverId?: string;
    affiliateLink?: string;
    contentMode?: string;
}

// ── 이미지 히스토리 ──
export type ImageHistoryEntry = { heading: string; images: any[] };
export type ImageHistorySnapshot = ImageHistoryEntry[];

// ── 페이월 응답 ──
export type PaywallResponse = {
    success: false;
    code: 'PAYWALL';
    message?: string;
    quota?: any;
};

// ── 에러 로그 ──
export interface ErrorLog {
    timestamp: string;
    type: 'error' | 'unhandledRejection' | 'api' | 'automation';
    message: string;
    stack?: string;
    context?: any;
    userAgent: string;
    url: string;
}

// ── 자동 저장 데이터 ──
export interface AutosaveData {
    timestamp: number;
    mode: 'full-auto' | 'semi-auto';
    structuredContent?: any;
    formData?: any;
    generatedImages?: any[];
}

// ── 튜토리얼 비디오 ──
export interface TutorialVideo {
    id: string;
    title: string;
    description: string;
    filePath: string;
    uploadedAt: string;
}
