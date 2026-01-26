// src/ui/services/ApiBridge.ts
// 타입 안전한 IPC API 브릿지 (window.api 래핑)

import { AutomationOptions, SavedPost, AccountInfo, StructuredContent, GeneratedImage } from '../types';

/**
 * 안전한 API 호출 래퍼
 * (window as any).api 호출을 타입 안전하게 래핑
 */
class ApiBridgeImpl {
    private api: any;

    constructor() {
        this.api = (window as any).api;
    }

    /**
     * API 사용 가능 여부 확인
     */
    isAvailable(): boolean {
        return !!this.api;
    }

    // ============================================
    // 자동화 관련 API
    // ============================================

    /**
     * 자동화 실행
     */
    async runAutomation(payload: any): Promise<any> {
        if (!this.api?.runAutomation) {
            throw new Error('runAutomation API not available');
        }
        return this.api.runAutomation(payload);
    }

    /**
     * 자동화 취소
     */
    async cancelAutomation(): Promise<void> {
        if (this.api?.cancelAutomation) {
            return this.api.cancelAutomation();
        }
    }

    /**
     * 브라우저 닫기
     */
    async closeBrowser(): Promise<void> {
        if (this.api?.closeBrowser) {
            return this.api.closeBrowser();
        }
    }

    // ============================================
    // 콘텐츠 생성 API
    // ============================================

    /**
     * AI 콘텐츠 생성
     */
    async generateContent(options: {
        keyword?: string;
        url?: string;
        category?: string;
        tone?: string;
        mode?: string;
    }): Promise<StructuredContent | null> {
        if (!this.api?.generateContent) {
            throw new Error('generateContent API not available');
        }
        return this.api.generateContent(options);
    }

    /**
     * 이미지 생성
     */
    async generateImages(options: {
        prompts: string[];
        source: string;
        headings?: string[];
    }): Promise<GeneratedImage[]> {
        if (!this.api?.generateImages) {
            throw new Error('generateImages API not available');
        }
        return this.api.generateImages(options);
    }

    // ============================================
    // 저장/로드 API
    // ============================================

    /**
     * 글 저장
     */
    async savePost(post: SavedPost): Promise<{ success: boolean; id?: string }> {
        if (!this.api?.savePost) {
            throw new Error('savePost API not available');
        }
        return this.api.savePost(post);
    }

    /**
     * 글 목록 로드
     */
    async loadPosts(): Promise<SavedPost[]> {
        if (!this.api?.loadPosts) {
            return [];
        }
        return this.api.loadPosts() || [];
    }

    /**
     * 글 삭제
     */
    async deletePost(id: string): Promise<{ success: boolean }> {
        if (!this.api?.deletePost) {
            throw new Error('deletePost API not available');
        }
        return this.api.deletePost(id);
    }

    // ============================================
    // 계정 관련 API
    // ============================================

    /**
     * 계정 목록 로드
     */
    async loadAccounts(): Promise<AccountInfo[]> {
        if (!this.api?.loadAccounts) {
            return [];
        }
        return this.api.loadAccounts() || [];
    }

    /**
     * 블로그 카테고리 분석
     */
    async analyzeBlogCategories(): Promise<{ name: string; value: string }[]> {
        if (!this.api?.analyzeBlogCategories) {
            throw new Error('analyzeBlogCategories API not available');
        }
        return this.api.analyzeBlogCategories();
    }

    // ============================================
    // 설정 API
    // ============================================

    /**
     * 설정 로드
     */
    async loadConfig(): Promise<Record<string, any>> {
        if (!this.api?.loadConfig) {
            return {};
        }
        return this.api.loadConfig() || {};
    }

    /**
     * 설정 저장
     */
    async saveConfig(config: Record<string, any>): Promise<void> {
        if (this.api?.saveConfig) {
            return this.api.saveConfig(config);
        }
    }

    // ============================================
    // 파일 API
    // ============================================

    /**
     * 파일 선택 다이얼로그
     */
    async selectFile(options?: { filters?: { name: string; extensions: string[] }[] }): Promise<string | null> {
        if (!this.api?.selectFile) {
            return null;
        }
        return this.api.selectFile(options);
    }

    /**
     * 폴더 선택 다이얼로그
     */
    async selectFolder(): Promise<string | null> {
        if (!this.api?.selectFolder) {
            return null;
        }
        return this.api.selectFolder();
    }

    /**
     * 클립보드에 복사
     */
    async copyToClipboard(text: string): Promise<void> {
        if (this.api?.copyToClipboard) {
            return this.api.copyToClipboard(text);
        }
        // 폴백: 브라우저 API 사용
        await navigator.clipboard.writeText(text);
    }

    // ============================================
    // 이벤트 리스너
    // ============================================

    /**
     * IPC 이벤트 리스너 등록
     */
    on(channel: string, callback: (...args: any[]) => void): void {
        if (this.api?.on) {
            this.api.on(channel, callback);
        }
    }

    /**
     * IPC 이벤트 리스너 제거
     */
    off(channel: string, callback: (...args: any[]) => void): void {
        if (this.api?.off) {
            this.api.off(channel, callback);
        }
    }

    /**
     * 일회성 IPC 이벤트 리스너
     */
    once(channel: string, callback: (...args: any[]) => void): void {
        if (this.api?.once) {
            this.api.once(channel, callback);
        }
    }
}

// 싱글톤 인스턴스
export const ApiBridge = new ApiBridgeImpl();

// 타입 export
export type { ApiBridgeImpl };
