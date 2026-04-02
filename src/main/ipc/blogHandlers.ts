// src/main/ipc/blogHandlers.ts
// 블로그 자동화 관련 IPC 핸들러 로직
// 
// ⚠️ 중요: 이 파일은 핸들러 로직만 제공합니다.
// 실제 ipcMain.handle 등록은 main.ts에서 수행합니다.
// 점진적으로 main.ts의 로직을 이 파일로 이동합니다.

import type { BrowserWindow } from 'electron';
import { AutomationService } from '../services/AutomationService.js';
import { Logger } from '../utils/logger.js';
import { ensureLicenseValid, enforceFreeTier, isFreeTierUser } from '../utils/authUtils.js';
import { sendLog, sendStatus, setMainWindowRef } from '../utils/ipcHelpers.js';

// ✅ [FIX-6] 자동화 실행 뮤텍스 — 동시 실행 절대 방지
let executionLock: Promise<any> | null = null;

export function getExecutionLock(): Promise<any> | null {
    return executionLock;
}

export function setExecutionLock(lock: Promise<any> | null): void {
    executionLock = lock;
}

// ============================================
// Types
// ============================================

export interface AutomationRequest {
    naverId?: string;
    naverPassword?: string;
    title?: string;
    content?: string;
    lines?: string[];
    selectedHeadings?: string[];
    structuredContent?: any;
    hashtags?: string[];
    images?: any[];
    generatedImages?: any[];
    publishMode?: 'draft' | 'publish' | 'schedule';
    scheduleDate?: string;
    scheduleType?: 'app-schedule' | 'naver-server';
    ctaLink?: string;
    ctaText?: string;
    ctas?: any[];
    ctaPosition?: 'bottom' | string; // 'bottom' | 'heading-1' ~ 'heading-10'
    skipCta?: boolean;
    skipImages?: boolean;
    thumbnailPath?: string;
    imageMode?: string;
    collectedImages?: any[];
    toneStyle?: string;
    categoryName?: string;
    keepBrowserOpen?: boolean;
    useAiImage?: boolean;
    createProductThumbnail?: boolean;
    includeThumbnailText?: boolean;
    affiliateLink?: string;
    contentMode?: 'seo' | 'affiliate';
    isFullAuto?: boolean;
    previousPostTitle?: string;
    previousPostUrl?: string;
    generator?: string;
    geminiModel?: string;
    postId?: string;
    useIntelligentImagePlacement?: boolean;
    onlyImagePlacement?: boolean;
}

export interface AutomationResponse {
    success: boolean;
    message?: string;
    url?: string;
    structuredContent?: any;
}

// ============================================
// automation:run 핸들러 로직
// ============================================

/**
 * automation:run의 사전 검증 로직
 * - 라이선스 체크
 * - 무료 티어 쿼타 체크
 * - 중복 실행 체크
 */
export async function validateAutomationRun(): Promise<{ valid: true } | { valid: false; response: AutomationResponse }> {
    // 라이선스 체크
    if (!(await ensureLicenseValid())) {
        return {
            valid: false,
            response: { success: false, message: '라이선스 인증이 필요합니다. 라이선스를 인증해주세요.' }
        };
    }

    // 무료 티어 paywall 체크
    const publishCheck = await enforceFreeTier('publish', 1);
    if (!publishCheck.allowed) {
        return { valid: false, response: publishCheck.response as AutomationResponse };
    }

    // 중복 실행 체크 (AutomationService 사용)
    if (AutomationService.isRunning()) {
        const lastRunTime = AutomationService.getLastRunTime();
        const now = Date.now();
        const timeSinceLastRun = now - lastRunTime;

        // ✅ [FIX-3] 15분 이상 실행 중이면 강제 리셋 (heartbeat 덕분에 진짜 stale만 감지)
        if (timeSinceLastRun > 900000) {
            Logger.warn('[automation:run] 자동화가 15분 이상 응답 없으므로 강제로 리셋합니다.');
            await AutomationService.closeAllSessions();
        } else {
            const message = '이미 자동화가 실행 중입니다.';
            sendStatus({ success: false, message });
            return { valid: false, response: { success: false, message } };
        }
    }

    // ✅ [FIX-6] 이전 실행이 아직 진행 중이면 대기 (경쟁 방지)
    if (executionLock) {
        Logger.warn('[automation:run] 이전 실행 완료 대기 중...');
        await executionLock.catch(() => { });
    }

    return { valid: true };
}

/**
 * 계정 정보 해결 (다계정 순환 로직)
 */
export interface ResolvedAccountInfo {
    naverId: string;
    naverPassword: string;
    usedAccountId: string | null;
}

/**
 * automation:run 시작 시 상태 업데이트
 */
export function startAutomationRun(payload: AutomationRequest): void {
    AutomationService.startRunning();
    AutomationService.updateLastRunTime();

    if (payload.generator) {
        sendLog(`🧠 선택된 생성 엔진: ${payload.generator}`);
    }

    Logger.info('[automation:run] 자동화 시작');
}

/**
 * automation:run 종료 시 정리
 */
export function endAutomationRun(payload: AutomationRequest): void {
    AutomationService.stopRunning();

    if (!payload.keepBrowserOpen) {
        const normalizedId = String(payload.naverId || '').trim().toLowerCase();
        if (normalizedId) {
            AutomationService.delete(normalizedId);
        }
        AutomationService.setCurrentInstance(null);
    }

    Logger.info('[automation:run] 자동화 종료');
}

// ============================================
// automation:cancel 핸들러 로직
// ============================================

/**
 * 자동화 취소 처리
 */
export async function handleAutomationCancel(): Promise<AutomationResponse> {
    if (!(await ensureLicenseValid())) {
        return { success: false, message: '라이선스 인증이 필요합니다.' };
    }

    // ✅ [2026-03-11 FIX] isRunning 체크 제거 — 렌더러에서 취소 요청 시
    // 메인 프로세스의 isRunning이 이미 false일 수 있으므로 항상 취소 처리
    if (!AutomationService.isRunning()) {
        Logger.info('[automation:cancel] 실행 중인 자동화 없음 — 안전하게 취소 처리');
    }

    AutomationService.requestCancel();

    // 현재 인스턴스에 취소 요청
    const current = AutomationService.getCurrentInstance();
    if (current && typeof (current as any).cancel === 'function') {
        await (current as any).cancel().catch(() => undefined);
    }

    sendStatus({ success: false, cancelled: true, message: '사용자가 자동화를 취소했습니다.' });
    AutomationService.stopRunning();
    AutomationService.setCurrentInstance(null);

    Logger.info('[automation:cancel] 자동화 취소됨');
    return { success: true };
}

// ============================================
// automation:closeBrowser 핸들러 로직
// ============================================

/**
 * 특정 계정의 브라우저 세션 닫기
 */
export async function handleCloseBrowser(naverId?: string): Promise<AutomationResponse> {
    if (naverId) {
        const normalizedId = naverId.trim().toLowerCase();
        await AutomationService.closeSession(normalizedId);
        Logger.info(`[automation:closeBrowser] 브라우저 닫힘: ${normalizedId}`);
        return { success: true, message: '브라우저가 닫혔습니다.' };
    } else {
        await AutomationService.closeAllSessions();
        Logger.info('[automation:closeBrowser] 모든 브라우저 닫힘');
        return { success: true, message: '모든 브라우저가 닫혔습니다.' };
    }
}

// ============================================
// 유틸리티 내보내기
// ============================================

export {
    ensureLicenseValid,
    enforceFreeTier,
    isFreeTierUser,
    sendLog,
    sendStatus,
    setMainWindowRef,
};
