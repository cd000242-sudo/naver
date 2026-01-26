// src/main/types.ts
// 메인 프로세스 공통 타입 정의

import { BrowserWindow } from 'electron';

/**
 * IPC 핸들러 컨텍스트 - 핸들러가 필요로 하는 의존성
 */
export interface IpcContext {
    getMainWindow: () => BrowserWindow | null;
    getAutomationMap: () => Map<string, any>;
    notify: (title: string, body: string) => void;
    sendToRenderer: (channel: string, ...args: any[]) => void;
}

/**
 * 핸들러 등록 함수 타입
 */
export type RegisterHandlersFn = (ctx: IpcContext) => void;

/**
 * 자동화 요청 페이로드
 */
export interface AutomationRequest {
    mode?: string;
    publishMode?: string;
    keyword?: string;
    url?: string;
    category?: string;
    title?: string;
    content?: string;
    hashtags?: string[];
    images?: any[];
    ctas?: Array<{ text: string; link?: string }>;
    affiliateLink?: string;
    skipCta?: boolean;
    skipImages?: boolean;
    imageSource?: string;
    scheduleDate?: string;
    naverScheduleMethod?: string;
    scheduleType?: string;
    quotationStyle?: string;
    tone?: string;
    isFullAuto?: boolean;
    closeOnComplete?: boolean;
    keepBrowserOpen?: boolean;
    useIntelligentImagePlacement?: boolean;
    onlyImagePlacement?: boolean;
    includeThumbnailText?: boolean;
    isShoppingConnectMode?: boolean;
    createProductThumbnail?: boolean;
    useAiImage?: boolean;
    structuredContent?: any;
    headings?: any[];
}

/**
 * 소제목 비디오 레코드
 */
export interface HeadingVideoRecord {
    url: string;
    filePath?: string;
    heading?: string;
    title?: string;
    createdAt?: string;
}

/**
 * 파일 정보
 */
export interface FileInfo {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    mtime?: Date;
}
