/**
 * 에러 로깅 + 자동 저장/백업 시스템
 * Phase 1: renderer.ts에서 추출
 *
 * 의존성: appendLog는 콜백으로 주입받음 (renderer.ts 커플링 제거)
 */
import type { ErrorLog, AutosaveData } from '../types/index.js';
import { translateGeminiError } from './errorUtils.js';
import { safeLocalStorageSetItem } from './storageUtils.js';

// ═══════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════
const ERROR_LOG_KEY = 'naver_blog_error_logs';
const MAX_ERROR_LOGS = 20; // ✅ [2026-03-24 FIX] 50→20 축소 (localStorage 용량 절약)
const AUTOSAVE_KEY = 'naver_blog_autosave';
const AUTOSAVE_INTERVAL = 30000; // 30초
export const BACKUP_KEY_PREFIX = 'naver_blog_backup_';
const BACKUP_INTERVAL = 300000; // 5분
const MAX_BACKUPS = 5; // ✅ [2026-03-24 FIX] 10→5 축소 (각 백업 최대 2MB → 총 10MB 이하로 제한)

// ═══════════════════════════════════════════════════════════════
// 콜백 주입 (renderer.ts 커플링 제거용)
// ═══════════════════════════════════════════════════════════════
type AppendLogFn = (msg: string) => void;

let _appendLog: AppendLogFn = (msg) => console.log('[AutosaveModule]', msg);

/**
 * renderer.ts에서 appendLog 함수를 주입
 */
export function injectAppendLog(fn: AppendLogFn): void {
    _appendLog = fn;
}

// ═══════════════════════════════════════════════════════════════
// 에러 로깅
// ═══════════════════════════════════════════════════════════════
export function logError(error: Error | string, type: ErrorLog['type'] = 'error', context?: any): void {
    const errorLog: ErrorLog = {
        timestamp: new Date().toISOString(),
        type,
        message: typeof error === 'string' ? error : error.message,
        stack: typeof error === 'string' ? undefined : error.stack,
        context,
        userAgent: navigator.userAgent,
        url: window.location.href
    };

    try {
        const existingLogs = localStorage.getItem(ERROR_LOG_KEY);
        const logs: ErrorLog[] = existingLogs ? JSON.parse(existingLogs) : [];
        logs.unshift(errorLog);
        if (logs.length > MAX_ERROR_LOGS) {
            logs.splice(MAX_ERROR_LOGS);
        }
        safeLocalStorageSetItem(ERROR_LOG_KEY, JSON.stringify(logs));
        console.error(`[${type.toUpperCase()}] ${errorLog.timestamp}`, {
            message: errorLog.message,
            stack: errorLog.stack,
            context: errorLog.context
        });
    } catch (e) {
        console.error('[ErrorLog] 오류 로그 저장 실패:', e);
    }
}

export function exportErrorLogs(): void {
    try {
        const logs = localStorage.getItem(ERROR_LOG_KEY);
        if (!logs) {
            alert('저장된 오류 로그가 없습니다.');
            return;
        }
        const blob = new Blob([logs], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('오류 로그가 다운로드되었습니다.');
    } catch (e) {
        console.error('[ErrorLog] 로그 내보내기 실패:', e);
        alert('오류 로그 내보내기에 실패했습니다.');
    }
}

export function clearErrorLogs(): void {
    if (confirm('모든 오류 로그를 삭제하시겠습니까?')) {
        localStorage.removeItem(ERROR_LOG_KEY);
        alert('오류 로그가 삭제되었습니다.');
    }
}

// ═══════════════════════════════════════════════════════════════
// 크래시 복구
// ═══════════════════════════════════════════════════════════════
const MAX_CRASH_RECOVERY_ATTEMPTS = 3;
let crashRecoveryAttempts = 0;

export function handleCrash(error: any, context: string): void {
    logError(error, 'error', { context, crashRecoveryAttempts });

    // 조용한 자동 저장
    const structuredContent = (window as any).currentStructuredContent;
    if (structuredContent) {
        const mode = document.querySelector('.unified-mode-btn.selected')?.getAttribute('data-mode') as 'full-auto' | 'semi-auto' || 'full-auto';
        autosaveContent({
            timestamp: Date.now(),
            mode,
            structuredContent,
            generatedImages: (window as any).imageManagementGeneratedImages || []
        });
        console.warn('[CrashRecovery] 💾 작업 내용 자동 저장 완료');
    }

    if (crashRecoveryAttempts < MAX_CRASH_RECOVERY_ATTEMPTS) {
        crashRecoveryAttempts++;
        console.warn(`[CrashRecovery] 오류 감지 (${crashRecoveryAttempts}/${MAX_CRASH_RECOVERY_ATTEMPTS}):`, context);
        setTimeout(() => { crashRecoveryAttempts = 0; }, 3000);
    } else {
        console.error('[CrashRecovery] ❌ 크래시 복구 한도 초과');
        alert('⚠️ 심각한 오류가 발생했습니다.\n\n작업 내용은 자동 저장되었습니다.\n애플리케이션을 재시작한 후 복구하세요.');
    }
}

// ═══════════════════════════════════════════════════════════════
// 자동 저장 (Autosave)
// ═══════════════════════════════════════════════════════════════
// ✅ [v1.4.9] 세션 차단 플래그 — quota 초과 1회 발생 시 전체 세션 동안 autosave 중단
// (매 30초마다 실패 → 콘솔 도배 + cleanup 무한 루프 방지)
let _autosaveDisabledForSession = false;
export function autosaveContent(data: AutosaveData): void {
    if (_autosaveDisabledForSession) return; // 조용히 무시
    try {
        const saveData = { ...data, timestamp: Date.now() };
        let jsonString = JSON.stringify(saveData);
        const MAX_SIZE = 4 * 1024 * 1024;

        if (jsonString.length > MAX_SIZE) {
            const slimData = {
                ...saveData,
                generatedImages: (saveData.generatedImages || []).map((img: any) => ({
                    heading: img.heading,
                    filePath: img.filePath || img.savedToLocal,
                    provider: img.provider,
                }))
            };
            jsonString = JSON.stringify(slimData);
            if (jsonString.length > MAX_SIZE) {
                jsonString = JSON.stringify({ ...saveData, generatedImages: [] });
            }
        }

        const saved = safeLocalStorageSetItem(AUTOSAVE_KEY, jsonString);
        if (saved) {
            console.debug('[Autosave] 콘텐츠 임시 저장 완료:', new Date().toLocaleTimeString(), `(${Math.round(jsonString.length / 1024)}KB)`);
        } else {
            // ✅ [v1.4.9] 1차 실패 → 세션 차단 + 1회만 경고
            _autosaveDisabledForSession = true;
            console.warn('[Autosave] ⚠️ localStorage 용량 부족 — 이번 세션의 자동 저장을 중단합니다. (앱 재시작 시 재시도)');
        }
    } catch (error: any) {
        _autosaveDisabledForSession = true;
        console.error('[Autosave] 임시 저장 실패 — 세션 자동 저장 중단:', error?.message || error);
    }
}

export function loadAutosavedContent(): AutosaveData | null {
    try {
        const saved = localStorage.getItem(AUTOSAVE_KEY);
        if (!saved) return null;
        const data = JSON.parse(saved) as AutosaveData;
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
            return data;
        }
        localStorage.removeItem(AUTOSAVE_KEY);
        return null;
    } catch (error) {
        console.error('[Autosave] 임시 저장 데이터 로드 실패:', error);
        return null;
    }
}

export function clearAutosavedContent(): void {
    localStorage.removeItem(AUTOSAVE_KEY);
    console.log('[Autosave] 임시 저장 데이터 삭제');
}

// ═══════════════════════════════════════════════════════════════
// 자동 백업
// ═══════════════════════════════════════════════════════════════
function cleanupOldBackups(): void {
    try {
        const backupKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(BACKUP_KEY_PREFIX)) {
                backupKeys.push(key);
            }
        }
        backupKeys.sort((a, b) => {
            const timeA = parseInt(a.replace(BACKUP_KEY_PREFIX, ''));
            const timeB = parseInt(b.replace(BACKUP_KEY_PREFIX, ''));
            return timeB - timeA;
        });
        if (backupKeys.length > MAX_BACKUPS) {
            for (let i = MAX_BACKUPS; i < backupKeys.length; i++) {
                localStorage.removeItem(backupKeys[i]);
                console.debug('[Backup] 오래된 백업 삭제:', backupKeys[i]);
            }
        }
    } catch (error) {
        console.error('[Backup] 백업 정리 실패:', error);
    }
}

export function createBackup(): void {
    try {
        const structuredContent = (window as any).currentStructuredContent;
        const generatedImages = (window as any).imageManagementGeneratedImages;
        if (!structuredContent) return;

        const mode = document.querySelector('.unified-mode-btn.selected')?.getAttribute('data-mode') as 'full-auto' | 'semi-auto' || 'full-auto';
        const slimImages = (generatedImages || []).map((img: any) => ({
            heading: img.heading,
            filePath: img.filePath || img.savedToLocal,
            provider: img.provider,
        }));

        const backupData: AutosaveData = {
            timestamp: Date.now(),
            mode,
            structuredContent,
            generatedImages: slimImages
        };

        const backupKey = `${BACKUP_KEY_PREFIX}${Date.now()}`;
        let jsonString = JSON.stringify(backupData);
        const MAX_SIZE = 2 * 1024 * 1024;

        if (jsonString.length > MAX_SIZE) {
            console.warn('[Backup] 백업 데이터 용량 초과, 이미지 제거');
            jsonString = JSON.stringify({ ...backupData, generatedImages: [] });
        }

        // ✅ [2026-03-24 FIX] safeLocalStorageSetItem으로 교체 → 할당량 초과 시 자동 정리
        const saved = safeLocalStorageSetItem(backupKey, jsonString);
        if (saved) {
            cleanupOldBackups();
            console.debug('[Backup] 백업 생성 완료:', new Date().toLocaleTimeString(), `(${Math.round(jsonString.length / 1024)}KB)`);
        } else {
            console.warn('[Backup] localStorage 용량 부족으로 백업 건너뜀');
            cleanupOldBackups(); // 공간 확보 시도
        }
    } catch (error: any) {
        console.error('[Backup] 백업 생성 실패:', error);
        cleanupOldBackups();
    }
}

export function listBackups(): AutosaveData[] {
    const backups: AutosaveData[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(BACKUP_KEY_PREFIX)) {
                const data = localStorage.getItem(key);
                if (data) {
                    backups.push(JSON.parse(data));
                }
            }
        }
        backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('[Backup] 백업 목록 조회 실패:', error);
    }
    return backups;
}

// ═══════════════════════════════════════════════════════════════
// 타이머 관리
// ═══════════════════════════════════════════════════════════════
let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let backupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutosave(): void {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => {
        const structuredContent = (window as any).currentStructuredContent;
        const generatedImages = (window as any).imageManagementGeneratedImages;
        if (structuredContent) {
            const mode = document.querySelector('.unified-mode-btn.selected')?.getAttribute('data-mode') as 'full-auto' | 'semi-auto' || 'full-auto';
            autosaveContent({
                timestamp: Date.now(),
                mode,
                structuredContent,
                generatedImages: generatedImages || []
            });
        }
    }, AUTOSAVE_INTERVAL);
    console.log('[Autosave] 자동 저장 시작 (30초 간격)');
}

export function stopAutosave(): void {
    if (autosaveTimer) {
        clearInterval(autosaveTimer);
        autosaveTimer = null;
        console.log('[Autosave] 자동 저장 중지');
    }
}

export function startAutoBackup(): void {
    if (backupTimer) clearInterval(backupTimer);
    backupTimer = setInterval(() => { createBackup(); }, BACKUP_INTERVAL);
    console.log('[Backup] 자동 백업 시작 (5분 간격)');
}

export function stopAutoBackup(): void {
    if (backupTimer) {
        clearInterval(backupTimer);
        backupTimer = null;
        console.log('[Backup] 자동 백업 중지');
    }
}

// ═══════════════════════════════════════════════════════════════
// 전역 에러 핸들러 등록
// ═══════════════════════════════════════════════════════════════
export function registerGlobalErrorHandlers(): void {
    window.addEventListener('error', (event) => {
        // ✅ [2026-03-23 FIX] Script error 노이즈 필터링 (크로스 오리진 에러)
        if (event.message?.includes('Script error')) return;

        logError(event.error || event.message, 'error', {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
        handleCrash(event.error || event.message, 'window.error');

        // ✅ [2026-03-23 FIX] Toast 표시 통합 (appEventsHandler.ts에서 이관)
        try {
            const msg = event.error instanceof Error ? translateGeminiError(event.error) : event.message;
            if ((window as any).showToast) {
                (window as any).showToast(`⚠️ 시스템 오류: ${msg}`, 'error', 5000);
            }
        } catch { /* Toast 실패 무시 */ }

        event.preventDefault();
    });

    window.addEventListener('unhandledrejection', (event) => {
        const errorDetails = {
            reason: event.reason,
            message: event.reason?.message || 'Unknown error',
            stack: event.reason?.stack || 'No stack trace',
            timestamp: new Date().toISOString()
        };
        console.error('[UNHANDLED_REJECTION] 처리되지 않은 프로미스 오류:', errorDetails);
        _appendLog(`⚠️ 처리되지 않은 오류: ${errorDetails.message}`);
        logError(event.reason, 'unhandledRejection', {
            promise: event.promise,
            details: errorDetails
        });
        // ✅ [2026-03-23 FIX] handleCrash 호출 제거
        // unhandledrejection은 단순 .catch() 누락이지 심각한 크래시가 아님
        // handleCrash를 호출하면 3회 이상 발생 시 가짜 크래시 다이얼로그가 표시됨
        event.preventDefault();
    });
}
