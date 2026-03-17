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
            } catch (e) {
                console.warn('[stabilityUtils] catch ignored:', e);
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

// ========================
// ✅ [2026-01-29 NEW] 대규모 발행 안정성 강화
// ========================

/**
 * ✅ Exponential Backoff - API 실패 시 지수 증가 딜레이
 * 1초 → 2초 → 4초 → 8초 → 16초 (최대)
 */
export class ExponentialBackoff {
    private baseDelay: number;
    private maxDelay: number;
    private maxRetries: number;
    private currentRetry: number = 0;
    private lastError: Error | null = null;

    constructor(options: {
        baseDelay?: number;  // 기본 1000ms
        maxDelay?: number;   // 기본 16000ms
        maxRetries?: number; // 기본 5회
    } = {}) {
        this.baseDelay = options.baseDelay ?? 1000;
        this.maxDelay = options.maxDelay ?? 16000;
        this.maxRetries = options.maxRetries ?? 5;
    }

    /**
     * 현재 딜레이 계산 (지수 증가 + 지터)
     */
    getDelay(): number {
        const exponentialDelay = this.baseDelay * Math.pow(2, this.currentRetry);
        const jitter = Math.random() * 500; // 0-500ms 랜덤 추가
        return Math.min(exponentialDelay + jitter, this.maxDelay);
    }

    /**
     * 재시도 가능 여부
     */
    canRetry(): boolean {
        return this.currentRetry < this.maxRetries;
    }

    /**
     * 재시도 실행
     */
    async retry<T>(fn: () => Promise<T>): Promise<T> {
        while (true) {
            try {
                const result = await fn();
                this.reset(); // 성공 시 리셋
                return result;
            } catch (error) {
                this.lastError = error as Error;
                this.currentRetry++;

                if (!this.canRetry()) {
                    console.error(`[ExponentialBackoff] ❌ 최대 재시도 횟수(${this.maxRetries}) 초과`);
                    throw error;
                }

                const delay = this.getDelay();
                console.log(`[ExponentialBackoff] ⏳ ${this.currentRetry}/${this.maxRetries} 재시도, ${Math.round(delay)}ms 후...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * 상태 리셋
     */
    reset(): void {
        this.currentRetry = 0;
        this.lastError = null;
    }

    /**
     * 현재 재시도 횟수
     */
    getRetryCount(): number {
        return this.currentRetry;
    }
}

/**
 * ✅ Circuit Breaker - 연속 실패 시 일시 중단
 * 상태: CLOSED (정상) → OPEN (차단) → HALF_OPEN (테스트)
 */
export class CircuitBreaker {
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private failureCount: number = 0;
    private successCount: number = 0;
    private lastFailureTime: number = 0;
    private failureThreshold: number;
    private successThreshold: number;
    private timeout: number;

    constructor(options: {
        failureThreshold?: number; // 연속 실패 횟수 (기본 5)
        successThreshold?: number; // 복구에 필요한 성공 횟수 (기본 2)
        timeout?: number;          // 차단 시간 (기본 30초)
    } = {}) {
        this.failureThreshold = options.failureThreshold ?? 5;
        this.successThreshold = options.successThreshold ?? 2;
        this.timeout = options.timeout ?? 30000;
    }

    /**
     * 현재 상태 확인
     */
    getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
        // OPEN 상태에서 타임아웃 경과 시 HALF_OPEN으로 전환
        if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.timeout) {
            this.state = 'HALF_OPEN';
            console.log('[CircuitBreaker] 🔄 HALF_OPEN 상태로 전환 (테스트 재시도)');
        }
        return this.state;
    }

    /**
     * 요청 허용 여부
     */
    isAllowed(): boolean {
        const state = this.getState();
        if (state === 'OPEN') {
            console.warn(`[CircuitBreaker] 🚫 차단 중 - ${Math.ceil((this.timeout - (Date.now() - this.lastFailureTime)) / 1000)}초 후 재시도`);
            return false;
        }
        return true;
    }

    /**
     * 성공 기록
     */
    recordSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            console.log(`[CircuitBreaker] ✅ HALF_OPEN 성공 ${this.successCount}/${this.successThreshold}`);

            if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                this.successCount = 0;
                console.log('[CircuitBreaker] 🟢 CLOSED 상태로 복구 (정상 운영)');
            }
        } else {
            this.failureCount = 0; // 성공 시 실패 카운트 리셋
        }
    }

    /**
     * 실패 기록
     */
    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            this.state = 'OPEN';
            this.successCount = 0;
            console.warn('[CircuitBreaker] 🔴 OPEN 상태로 전환 (HALF_OPEN 중 실패)');
        } else if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            console.warn(`[CircuitBreaker] 🔴 OPEN 상태로 전환 (연속 ${this.failureCount}회 실패)`);
        }
    }

    /**
     * Circuit Breaker로 함수 실행
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.isAllowed()) {
            throw new Error('CircuitBreaker OPEN: 일시적으로 요청이 차단되었습니다.');
        }

        try {
            const result = await fn();
            this.recordSuccess();
            return result;
        } catch (error) {
            this.recordFailure();
            throw error;
        }
    }

    /**
     * 수동 리셋
     */
    reset(): void {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        console.log('[CircuitBreaker] 🔄 수동 리셋 완료');
    }
}

/**
 * ✅ Publish Cooldown - 발행 간 강제 쿨다운
 * 대규모 발행 시 API 부하 방지
 */
export class PublishCooldown {
    private lastPublishTime: number = 0;
    private minCooldown: number;
    private maxCooldown: number;
    private publishCount: number = 0;
    private adaptiveMultiplier: number = 1;

    constructor(options: {
        minCooldown?: number; // 최소 쿨다운 (기본 1000ms)
        maxCooldown?: number; // 최대 쿨다운 (기본 5000ms)
    } = {}) {
        this.minCooldown = options.minCooldown ?? 1000;
        this.maxCooldown = options.maxCooldown ?? 5000;
    }

    /**
     * 랜덤 쿨다운 시간 계산
     */
    private getRandomCooldown(): number {
        const base = this.minCooldown + Math.random() * (this.maxCooldown - this.minCooldown);
        return Math.min(base * this.adaptiveMultiplier, this.maxCooldown * 2);
    }

    /**
     * 쿨다운 대기
     */
    async waitCooldown(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastPublishTime;
        const cooldown = this.getRandomCooldown();

        if (elapsed < cooldown) {
            const waitTime = cooldown - elapsed;
            console.log(`[PublishCooldown] ⏳ ${Math.round(waitTime)}ms 대기 중...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastPublishTime = Date.now();
        this.publishCount++;

        // 100개마다 적응형 쿨다운 증가 (API 보호)
        if (this.publishCount % 100 === 0) {
            this.adaptiveMultiplier = Math.min(this.adaptiveMultiplier + 0.5, 3);
            console.log(`[PublishCooldown] 📈 ${this.publishCount}개 발행 - 쿨다운 배율 ${this.adaptiveMultiplier}x`);
        }
    }

    /**
     * 발행 수 조회
     */
    getPublishCount(): number {
        return this.publishCount;
    }

    /**
     * 리셋
     */
    reset(): void {
        this.publishCount = 0;
        this.adaptiveMultiplier = 1;
        this.lastPublishTime = 0;
        console.log('[PublishCooldown] 🔄 리셋 완료');
    }
}

/**
 * ✅ 통합 안정성 관리자 - 모든 안정성 기능 통합
 */
export class StabilityManager {
    public backoff: ExponentialBackoff;
    public circuitBreaker: CircuitBreaker;
    public cooldown: PublishCooldown;
    private memoryCheckInterval: any = null;
    private lastMemoryCleanup: number = 0;

    constructor() {
        this.backoff = new ExponentialBackoff();
        this.circuitBreaker = new CircuitBreaker();
        this.cooldown = new PublishCooldown();
    }

    /**
     * ✅ [2026-02-01] 메모리 정리 (무한 발행 안정성)
     */
    cleanupMemory(): void {
        const now = Date.now();
        // 30초마다만 정리 (과도한 호출 방지)
        if (now - this.lastMemoryCleanup < 30000) return;

        this.lastMemoryCleanup = now;

        // 가비지 컬렉션 힌트 (Electron에서는 효과 있음)
        try {
            if (typeof (window as any).gc === 'function') {
                (window as any).gc();
                console.log('[StabilityManager] 🧹 가비지 컬렉션 실행');
            }
        } catch { }

        // 대용량 배열/객체 정리 힌트
        console.log(`[StabilityManager] 📊 메모리 정리 완료 (발행: ${this.cooldown.getPublishCount()}개)`);
    }

    /**
     * ✅ 주기적 메모리 모니터링 시작
     */
    startMemoryMonitoring(intervalMs: number = 60000): void {
        if (this.memoryCheckInterval) return;

        this.memoryCheckInterval = setInterval(() => {
            this.cleanupMemory();
        }, intervalMs);

        console.log(`[StabilityManager] 🔍 메모리 모니터링 시작 (${intervalMs / 1000}초 간격)`);
    }

    /**
     * ✅ 메모리 모니터링 중지
     */
    stopMemoryMonitoring(): void {
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
            this.memoryCheckInterval = null;
            console.log('[StabilityManager] 🛑 메모리 모니터링 중지');
        }
    }

    /**
     * 안정적인 API 호출 실행
     */
    async safeExecute<T>(fn: () => Promise<T>): Promise<T> {
        // 1. 쿨다운 대기
        await this.cooldown.waitCooldown();

        // 2. Circuit Breaker 체크 + Exponential Backoff 재시도
        return this.circuitBreaker.execute(async () => {
            return this.backoff.retry(fn);
        });
    }

    /**
     * 전체 리셋
     */
    reset(): void {
        this.backoff.reset();
        this.circuitBreaker.reset();
        this.cooldown.reset();
        this.cleanupMemory();
        console.log('[StabilityManager] ✅ 전체 안정성 상태 리셋');
    }

    /**
     * 상태 요약
     */
    getStatus(): {
        circuitState: string;
        retryCount: number;
        publishCount: number;
    } {
        return {
            circuitState: this.circuitBreaker.getState(),
            retryCount: this.backoff.getRetryCount(),
            publishCount: this.cooldown.getPublishCount()
        };
    }
}

// 싱글톤 인스턴스
export const stabilityManager = new StabilityManager();

// 전역 노출
(window as any).StabilityManager = StabilityManager;
(window as any).ExponentialBackoff = ExponentialBackoff;
(window as any).CircuitBreaker = CircuitBreaker;
(window as any).PublishCooldown = PublishCooldown;
(window as any).stabilityManager = stabilityManager;

console.log('[StabilityUtils] 📦 모듈 로드됨 (대규모 발행 안정성 강화 버전)!');

