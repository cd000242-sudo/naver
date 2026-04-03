// src/main/services/AutomationService.ts
// 자동화 서비스 싱글톤 - 브라우저 인스턴스 및 자동화 상태 관리

// ✅ [Phase 4B] 순환 의존성 방지를 위한 인터페이스 import
import type { IAutomationInstance } from '../../types/automation.js';

/**
 * 자동화 서비스 싱글톤
 * main.ts의 automationMap, automation 변수를 캡슐화
 */
class AutomationServiceImpl {
    private static instance: AutomationServiceImpl | null = null;

    // 실행 중인 자동화 인스턴스 맵 (accountId -> IAutomationInstance)
    private automationMap: Map<string, IAutomationInstance> = new Map();

    // 현재 활성 자동화 인스턴스
    private currentInstance: IAutomationInstance | null = null;

    // 자동화 실행 중 플래그
    private running = false;

    // 취소 요청 플래그
    private cancelRequested = false;

    // 다중계정 발행 중지 플래그
    private multiAccountAbortFlag = false;

    // ✅ [2026-03-11] 즉시 취소용 AbortController
    private multiAccountAbortController: AbortController | null = null;

    // ✅ [2026-04-03] 일반 자동화(콘텐츠 생성/이미지 생성) 즉시 취소용 AbortController
    private generalAbortController: AbortController | null = null;

    // 다중계정 활성 자동화 목록
    private activeMultiAccountAutomations: IAutomationInstance[] = [];

    // 마지막 실행 시간 (중복 실행 체크용)
    private lastRunTime: number = 0;

    private constructor() { }

    /**
     * 싱글톤 인스턴스 가져오기
     */
    static getInstance(): AutomationServiceImpl {
        if (!AutomationServiceImpl.instance) {
            AutomationServiceImpl.instance = new AutomationServiceImpl();
        }
        return AutomationServiceImpl.instance;
    }

    // ============================================
    // 자동화 맵 관리
    // ============================================

    /**
     * 전체 자동화 맵 가져오기
     */
    getMap(): Map<string, IAutomationInstance> {
        return this.automationMap;
    }

    /**
     * 특정 계정의 자동화 인스턴스 가져오기
     */
    get(accountId: string): IAutomationInstance | undefined {
        return this.automationMap.get(accountId);
    }

    /**
     * 자동화 인스턴스 저장
     */
    set(accountId: string, instance: IAutomationInstance): void {
        this.automationMap.set(accountId, instance);
    }

    /**
     * 특정 계정의 자동화 인스턴스 삭제
     */
    delete(accountId: string): boolean {
        return this.automationMap.delete(accountId);
    }

    /**
     * 자동화 인스턴스 존재 여부
     */
    has(accountId: string): boolean {
        return this.automationMap.has(accountId);
    }

    // ============================================
    // 현재 인스턴스 관리
    // ============================================

    /**
     * 현재 활성 자동화 인스턴스 가져오기
     */
    getCurrentInstance(): IAutomationInstance | null {
        return this.currentInstance;
    }

    /**
     * 현재 활성 자동화 인스턴스 설정
     */
    setCurrentInstance(instance: IAutomationInstance | null): void {
        this.currentInstance = instance;
    }

    // ============================================
    // 실행 상태 관리
    // ============================================

    /**
     * 자동화 실행 중인지 확인
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * 자동화 시작
     */
    startRunning(): void {
        this.running = true;
        this.cancelRequested = false;
        // ✅ [2026-04-03] 새 작업 시작 시 AbortController 생성
        // 단, 이미 활성 controller가 있으면 유지 (콘텐츠 생성 IPC에서 생성한 것)
        if (!this.generalAbortController || this.generalAbortController.signal.aborted) {
            this.generalAbortController = new AbortController();
        }
    }

    /**
     * 자동화 종료
     */
    stopRunning(): void {
        this.running = false;
    }

    /**
     * 취소 요청
     */
    requestCancel(): void {
        this.cancelRequested = true;
        // 현재 인스턴스에도 취소 요청 전달
        if (this.currentInstance) {
            this.currentInstance.cancel().catch(() => { });
        }
        // ✅ [2026-04-03] 진행 중인 AI API 호출 즉시 중단
        this.abortGeneralOperation();
    }

    /**
     * 취소 여부 확인
     */
    isCancelRequested(): boolean {
        return this.cancelRequested;
    }

    /**
     * 취소 플래그 리셋
     */
    resetCancelFlag(): void {
        this.cancelRequested = false;
    }

    /**
     * 마지막 실행 시간 가져오기
     */
    getLastRunTime(): number {
        return this.lastRunTime;
    }

    /**
     * 마지막 실행 시간 업데이트
     */
    updateLastRunTime(): void {
        this.lastRunTime = Date.now();
    }

    // ============================================
    // 다중 계정 관리
    // ============================================

    /**
     * 다중계정 중지 플래그 설정
     */
    setMultiAccountAbort(abort: boolean): void {
        this.multiAccountAbortFlag = abort;
    }

    /**
     * 다중계정 중지 여부
     */
    isMultiAccountAborted(): boolean {
        return this.multiAccountAbortFlag;
    }

    /**
     * ✅ [2026-03-11] 즉시 취소용 AbortController 생성
     * multiAccount:publish 시작 시 호출
     */
    createAbortController(): AbortController {
        this.multiAccountAbortController = new AbortController();
        return this.multiAccountAbortController;
    }

    /**
     * ✅ [2026-03-11] 진행 중인 API 호출 즉시 중단
     * multiAccount:cancel 시 호출 → 대기 중인 Promise 즉시 reject
     */
    abortCurrentOperation(): void {
        if (this.multiAccountAbortController) {
            this.multiAccountAbortController.abort();
            this.multiAccountAbortController = null;
        }
    }

    /**
     * ✅ [2026-03-11] 현재 AbortSignal 가져오기 (다중계정)
     */
    getAbortSignal(): AbortSignal | null {
        return this.multiAccountAbortController?.signal || null;
    }

    /**
     * ✅ [2026-04-03] 일반 자동화용 AbortSignal 가져오기
     * generateStructuredContent, generateImages 등에서 사용
     */
    getGeneralAbortSignal(): AbortSignal | null {
        return this.generalAbortController?.signal || null;
    }

    /**
     * ✅ [2026-04-03] 일반 자동화 진행 중인 API 호출 즉시 중단
     */
    abortGeneralOperation(): void {
        if (this.generalAbortController) {
            this.generalAbortController.abort();
            this.generalAbortController = null;
        }
    }

    /**
     * ✅ [2026-04-03] 일반 자동화용 AbortController 생성/리셋
     * 콘텐츠 생성 IPC 핸들러에서 호출
     */
    createGeneralAbortController(): AbortController {
        this.generalAbortController = new AbortController();
        return this.generalAbortController;
    }

    /**
     * 다중계정 활성 자동화 추가
     */
    addMultiAccountAutomation(auto: IAutomationInstance): void {
        this.activeMultiAccountAutomations.push(auto);
    }

    /**
     * 다중계정 활성 자동화 목록 가져오기
     */
    getMultiAccountAutomations(): IAutomationInstance[] {
        return this.activeMultiAccountAutomations;
    }

    /**
     * 다중계정 활성 자동화 목록 초기화
     */
    clearMultiAccountAutomations(): void {
        this.activeMultiAccountAutomations = [];
    }

    // ============================================
    // 세션 정리
    // ============================================

    /**
     * 특정 계정의 브라우저 닫기
     */
    async closeSession(accountId: string): Promise<void> {
        const auto = this.automationMap.get(accountId);
        if (auto) {
            try {
                await auto.closeBrowser();
                console.log(`[AutomationService] Session closed for ${accountId}`);
            } catch (e) {
                console.warn(`[AutomationService] Failed to close session for ${accountId}:`, e);
            } finally {
                this.automationMap.delete(accountId);
            }
        }
    }

    /**
     * 모든 브라우저 세션 닫기
     */
    async closeAllSessions(): Promise<void> {
        console.log(`[AutomationService] Closing all sessions (${this.automationMap.size} active)...`);

        const promises = Array.from(this.automationMap.keys()).map(id => this.closeSession(id));
        await Promise.allSettled(promises);

        // 현재 인스턴스도 정리
        if (this.currentInstance) {
            try {
                await this.currentInstance.closeBrowser();
            } catch (e) {
                console.warn('[AutomationService] Failed to close current instance:', e);
            }
            this.currentInstance = null;
        }

        // 다중계정 자동화도 정리
        for (const auto of this.activeMultiAccountAutomations) {
            try {
                await auto.closeBrowser();
            } catch (e) {
                console.warn('[AutomationService] Failed to close multi-account automation:', e);
            }
        }
        this.activeMultiAccountAutomations = [];

        this.running = false;
        this.cancelRequested = false;
        this.multiAccountAbortFlag = false;

        console.log('[AutomationService] All sessions closed');
    }

    /**
     * 모든 상태 리셋
     */
    reset(): void {
        this.automationMap.clear();
        this.currentInstance = null;
        this.running = false;
        this.cancelRequested = false;
        this.multiAccountAbortFlag = false;
        this.activeMultiAccountAutomations = [];
    }

    // ============================================
    // 🫀 One Engine: executePostCycle
    // 풀오토, 반자동, 예약발행을 통합하는 단일 발행 엔진
    // ============================================

    /**
     * 단일 게시물 발행 사이클 실행
     * 
     * 이 메서드가 모든 발행 로직의 심장입니다.
     * - 풀오토 발행
     * - 반자동 발행 (콘텐츠만 생성)
     * - 예약 발행
     * - 연속 발행 (루프에서 호출)
     * - 다중계정 발행 (루프에서 호출)
     * 
     * 실제 로직은 BlogExecutor.runFullPostCycle()에 구현되어 있습니다.
     * 
     * @param payload - 발행 요청 데이터
     * @param context - 실행 컨텍스트 (계정ID, 로거 등)
     * @returns PostCycleResult - 발행 결과
     */
    async executePostCycle(
        payload: PostCyclePayload,
        context: PostCycleContext = {}
    ): Promise<PostCycleResult> {
        // BlogExecutor로 위임 (실제 비즈니스 로직)
        const { runFullPostCycle } = await import('./BlogExecutor.js');
        return runFullPostCycle(payload, context);
    }

    /**
     * 계정 자격증명 해결
     * payload에서 직접 제공하거나, 계정 매니저에서 가져옴
     */
    private async resolveAccountCredentials(
        payload: PostCyclePayload,
        context: PostCycleContext
    ): Promise<{ naverId: string; naverPassword: string; accountId?: string }> {
        // context에서 이미 해결된 경우
        if (context.accountId && context.naverId && context.naverPassword) {
            return {
                naverId: context.naverId,
                naverPassword: context.naverPassword,
                accountId: context.accountId,
            };
        }

        // payload에서 직접 제공된 경우
        if (payload.naverId && payload.naverPassword) {
            return {
                naverId: payload.naverId,
                naverPassword: payload.naverPassword,
            };
        }

        // 빈 값 반환 (호출자가 처리)
        return { naverId: '', naverPassword: '' };
    }

    /**
     * 자동화 인스턴스 가져오기 또는 생성
     */
    private async getOrCreateAutomation(
        account: { naverId: string; naverPassword: string }
    ): Promise<IAutomationInstance | null> {
        const normalizedId = account.naverId.trim().toLowerCase();

        // 기존 인스턴스 확인
        let automation = this.automationMap.get(normalizedId);

        if (automation) {
            console.log(`[AutomationService] ♻️ 기존 세션 재사용: ${normalizedId}`);
            return automation;
        }

        // 새 인스턴스는 호출자가 생성해서 set()으로 등록
        return null;
    }
}

// ============================================
// 타입 정의
// ============================================

/**
 * 발행 사이클 페이로드
 */
export interface PostCyclePayload {
    // 계정 정보
    naverId?: string;
    naverPassword?: string;

    // 콘텐츠
    title?: string;
    content?: string;
    structuredContent?: any;
    lines?: string[];
    selectedHeadings?: string[];
    hashtags?: string[];

    // 이미지
    images?: any[];
    generatedImages?: any[];
    collectedImages?: any[];
    skipImages?: boolean;
    thumbnailPath?: string;
    imageMode?: string;
    useAiImage?: boolean;
    createProductThumbnail?: boolean;
    includeThumbnailText?: boolean;
    // ✅ [2026-01-28] 이미지 설정 전역 적용
    scSubImageSource?: 'ai' | 'collected';  // 수집 이미지 직접 사용 여부
    thumbnailImageRatio?: string;  // 썸네일 비율
    subheadingImageRatio?: string;  // 소제목 비율
    scAutoThumbnailSetting?: boolean;  // 쇼핑커넥트 자동 썸네일

    // 발행 설정
    publishMode?: 'draft' | 'publish' | 'schedule';
    scheduleDate?: string;
    scheduleTime?: string; // ✅ [2026-03-19 FIX] 예약 시간 (HH:mm) — scheduleDate와 별도 전달 시 사용
    scheduleType?: 'app-schedule' | 'naver-server';

    // CTA/제휴
    ctaLink?: string;
    ctaText?: string;
    ctas?: any[];
    ctaPosition?: 'bottom' | string; // 'bottom' | 'heading-1' ~ 'heading-10'
    skipCta?: boolean;
    affiliateLink?: string;
    contentMode?: 'seo' | 'affiliate';

    // 기타 옵션
    toneStyle?: string;
    categoryName?: string;
    keepBrowserOpen?: boolean;
    isFullAuto?: boolean;
    previousPostTitle?: string;
    previousPostUrl?: string;
    generator?: string;
    geminiModel?: string;
    postId?: string;
    useIntelligentImagePlacement?: boolean;
    onlyImagePlacement?: boolean;
}

/**
 * 실행 컨텍스트
 */
export interface PostCycleContext {
    // 계정 정보 (다중계정 발행 시 사용)
    accountId?: string;
    naverId?: string;
    naverPassword?: string;

    // 로거
    logger?: {
        log: (...args: any[]) => void;
        error: (...args: any[]) => void;
        warn: (...args: any[]) => void;
    };

    // 진행 콜백
    onProgress?: (step: string, percent: number) => void;

    // 취소 토큰
    cancellationToken?: { cancelled: boolean };
}

/**
 * 발행 결과
 */
export interface PostCycleResult {
    success: boolean;
    message?: string;
    url?: string;
    cancelled?: boolean;
    structuredContent?: any;
}

// 싱글톤 인스턴스 export
export const AutomationService = AutomationServiceImpl.getInstance();
export type { AutomationServiceImpl };
