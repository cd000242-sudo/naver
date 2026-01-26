/**
 * ✅ [2026-01-25 모듈화] 초기화 가드 및 UI 락 시스템
 * - renderer.ts에서 분리됨
 * - 이벤트 리스너 중복 등록 방지
 * - UI 액션 락 시스템
 */

// ========================
// InitializationGuard 클래스
// ========================

export class InitializationGuard {
    private static initialized = new Set<string>();

    /**
     * 한 번만 실행되도록 보장
     */
    static once(key: string, fn: () => void): void {
        if (this.initialized.has(key)) {
            console.log(`[InitGuard] "${key}" 이미 초기화됨 - 스킵`);
            return;
        }
        this.initialized.add(key);
        try {
            fn();
            console.log(`[InitGuard] "${key}" 초기화 완료`);
        } catch (error) {
            console.error(`[InitGuard] "${key}" 초기화 실패:`, error);
            this.initialized.delete(key); // 실패 시 재시도 허용
        }
    }

    /**
     * 비동기 함수 한 번만 실행
     */
    static async onceAsync(key: string, fn: () => Promise<void>): Promise<void> {
        if (this.initialized.has(key)) {
            console.log(`[InitGuard] "${key}" 이미 초기화됨 - 스킵`);
            return;
        }
        this.initialized.add(key);
        try {
            await fn();
            console.log(`[InitGuard] "${key}" 초기화 완료`);
        } catch (error) {
            console.error(`[InitGuard] "${key}" 초기화 실패:`, error);
            this.initialized.delete(key);
        }
    }

    /**
     * 초기화 상태 확인
     */
    static isInitialized(key: string): boolean {
        return this.initialized.has(key);
    }

    /**
     * 초기화 상태 초기화 (테스트용)
     */
    static reset(): void {
        this.initialized.clear();
    }
}

// 전역에 노출
(window as any).InitializationGuard = InitializationGuard;

// ========================
// UI 액션 락 시스템
// ========================

const uiActionLocks = new Map<string, number>(); // key -> lock 시작 시간
const UI_LOCK_TIMEOUT = 15 * 60 * 1000; // ✅ [2026-01-22] 15분 타임아웃 (이미지 생성 지연 대응)

// 주기적으로 만료된 락 정리
setInterval(() => {
    const now = Date.now();
    for (const [key, startTime] of uiActionLocks.entries()) {
        if (now - startTime > UI_LOCK_TIMEOUT) {
            console.warn(`[Stability] ⚠️ 락 타임아웃 해제: ${key}`);
            uiActionLocks.delete(key);
        }
    }
}, 60000); // 1분마다 체크

/**
 * 연속 발행 등에서 이미지 생성 락을 강제 해제하는 함수
 */
export function clearImageGenerationLocks(): void {
    const keysToDelete: string[] = [];
    for (const key of uiActionLocks.keys()) {
        if (key.startsWith('cost-risk-image:')) {
            keysToDelete.push(key);
        }
    }

    if (keysToDelete.length > 0) {
        keysToDelete.forEach(k => {
            uiActionLocks.delete(k);
            console.log(`[Stability] 🔓 이미지 락 강제 해제: ${k}`);
        });
    }
}

/**
 * UI 액션을 락으로 보호하여 중복 실행 방지
 */
export async function runUiActionLocked<T>(
    key: string,
    message: string,
    fn: () => Promise<T>,
    toastManager?: { warning: (msg: string) => void }
): Promise<T | null> {
    const k = String(key || '').trim();
    if (!k) return await fn();

    // ✅ [Stability] 락이 존재하면 타임아웃 체크
    const existingLockTime = uiActionLocks.get(k);
    if (existingLockTime) {
        // 타임아웃 초과된 락은 무효화
        if (Date.now() - existingLockTime > UI_LOCK_TIMEOUT) {
            console.warn(`[Stability] ⚠️ 오래된 락 무효화: ${k}`);
            uiActionLocks.delete(k);
        } else {
            try {
                if (toastManager) {
                    toastManager.warning(message || '중복사용은 금합니다');
                }
            } catch {
                // ignore
            }
            return null;
        }
    }

    uiActionLocks.set(k, Date.now());
    try {
        return await fn();
    } finally {
        uiActionLocks.delete(k);
    }
}

// 락 유틸리티 내보내기
export { uiActionLocks, UI_LOCK_TIMEOUT };

console.log('[StabilityUtils] 📦 모듈 로드됨!');
