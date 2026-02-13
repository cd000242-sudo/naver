/**
 * ✅ [2026-01-25 모듈화] 향상된 API 클라이언트
 * 
 * 재시도, 캐싱, 타임아웃 처리가 포함된 API 클라이언트
 */

import { toastManager } from './uiManagers.js';

// appendLog는 renderer.ts에서 정의되어 window에 노출됨
declare const appendLog: (message: string, logId?: string) => void;

export interface ApiRequestOptions {
    retryCount?: number;
    retryDelay?: number;
    timeout?: number;
    cache?: boolean;
    cacheTime?: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    cached?: boolean;
    retryCount?: number;
}

export class EnhancedApiClient {
    private static instance: EnhancedApiClient;
    private cache: Map<string, { data: any; timestamp: number }> = new Map();
    private pendingRequests: Map<string, Promise<any>> = new Map();

    // ✅ [2026-01-29] Circuit Breaker 통합 (연속 실패 시 일시 중단)
    private circuitBreaker = {
        state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 30000
    };

    static getInstance(): EnhancedApiClient {
        if (!EnhancedApiClient.instance) {
            EnhancedApiClient.instance = new EnhancedApiClient();
        }
        return EnhancedApiClient.instance;
    }

    // ✅ [2026-01-29] Circuit Breaker 상태 확인
    private checkCircuitBreaker(): boolean {
        if (this.circuitBreaker.state === 'OPEN') {
            const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
            if (elapsed >= this.circuitBreaker.timeout) {
                this.circuitBreaker.state = 'HALF_OPEN';
                console.log('[API] 🔄 Circuit Breaker: HALF_OPEN 전환 (테스트 재시도)');
            } else {
                const remaining = Math.ceil((this.circuitBreaker.timeout - elapsed) / 1000);
                console.warn(`[API] 🚫 Circuit Breaker OPEN - ${remaining}초 후 재시도 가능`);
                return false;
            }
        }
        return true;
    }

    // ✅ [2026-01-29] 성공 기록
    private recordSuccess(): void {
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.successCount++;
            if (this.circuitBreaker.successCount >= this.circuitBreaker.successThreshold) {
                this.circuitBreaker.state = 'CLOSED';
                this.circuitBreaker.failureCount = 0;
                this.circuitBreaker.successCount = 0;
                console.log('[API] 🟢 Circuit Breaker: CLOSED 복구 (정상 운영)');
            }
        } else {
            this.circuitBreaker.failureCount = 0;
        }
    }

    // ✅ [2026-01-29] 실패 기록
    private recordFailure(): void {
        this.circuitBreaker.failureCount++;
        this.circuitBreaker.lastFailureTime = Date.now();

        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.state = 'OPEN';
            this.circuitBreaker.successCount = 0;
            console.warn('[API] 🔴 Circuit Breaker: OPEN 전환 (HALF_OPEN 중 실패)');
        } else if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
            this.circuitBreaker.state = 'OPEN';
            console.warn(`[API] 🔴 Circuit Breaker: OPEN 전환 (연속 ${this.circuitBreaker.failureCount}회 실패)`);
        }
    }

    // ✅ [2026-01-29] Circuit Breaker 리셋
    resetCircuitBreaker(): void {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.successCount = 0;
        console.log('[API] 🔄 Circuit Breaker 수동 리셋');
    }

    // ✅ [2026-01-29] 상태 조회
    getCircuitBreakerStatus(): { state: string; failureCount: number } {
        return {
            state: this.circuitBreaker.state,
            failureCount: this.circuitBreaker.failureCount
        };
    }

    // 향상된 API 호출
    async call<T = any>(
        apiMethod: string,
        args: any[] = [],
        options: ApiRequestOptions = {}
    ): Promise<ApiResponse<T>> {
        // ✅ [2026-01-29] Circuit Breaker 체크 (연속 실패 시 일시 중단)
        if (!this.checkCircuitBreaker()) {
            toastManager.error('🚫 API 일시 중단 중 - 30초 후 자동 복구됩니다', 3000);
            return {
                success: false,
                error: 'Circuit Breaker OPEN: API가 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.'
            };
        }

        const {
            retryCount = 3, // ✅ 3회 재시도 (타임아웃이 길어져서 줄임)
            retryDelay = 3000, // ✅ 3초 간격
            timeout = 480000, // ✅ 8분 타임아웃 (배포 환경 네트워크 다양성 고려)
            cache = false,
            cacheTime = 300000 // 5분
        } = options;

        const cacheKey = `${apiMethod}:${JSON.stringify(args)}`;

        // 캐시 확인
        if (cache && this.checkCache(cacheKey, cacheTime)) {
            const cachedData = this.cache.get(cacheKey);
            return {
                success: true,
                data: cachedData?.data,
                cached: true
            };
        }

        // 중복 요청 방지
        if (this.pendingRequests.has(cacheKey)) {
            return await this.pendingRequests.get(cacheKey);
        }

        const requestPromise = this.executeWithRetry<T>(
            apiMethod,
            args,
            retryCount,
            retryDelay,
            timeout,
            cacheKey,
            cache
        );

        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }

    // 재시도 로직 실행
    private async executeWithRetry<T>(
        apiMethod: string,
        args: any[],
        retryCount: number,
        retryDelay: number,
        timeout: number,
        cacheKey: string,
        cache: boolean
    ): Promise<ApiResponse<T>> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                console.log(`[API] ${apiMethod} 호출 시도 ${attempt + 1}/${retryCount + 1}`);

                // 타임아웃 설정
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('API 호출 타임아웃 - 네트워크 속도가 느리거나 서버 응답이 없습니다.')), timeout);
                });

                // 실제 API 호출
                const apiCallPromise = (window.api as any)[apiMethod](...args);
                const result = await Promise.race([apiCallPromise, timeoutPromise]);

                // 성공 시 캐시 저장
                if (cache && result) {
                    this.setCache(cacheKey, result);
                }

                console.log(`[API] ${apiMethod} 성공 (시도 ${attempt + 1}회)`);

                // ✅ [2026-01-29] Circuit Breaker 성공 기록
                this.recordSuccess();

                // 성공 후 잠시 대기 (연속 요청 방지)
                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                return {
                    success: true,
                    data: result,
                    retryCount: attempt
                };

            } catch (error) {
                lastError = error as Error;
                const errorMsg = lastError.message || '알 수 없는 오류';
                console.warn(`[API] ${apiMethod} 시도 ${attempt + 1} 실패:`, errorMsg);

                // 타임아웃 오류인 경우 - 실제로는 자동화가 진행 중일 수 있음
                const isTimeoutError = errorMsg.includes('타임아웃') || errorMsg.includes('timeout');

                // "이미 자동화가 실행 중" 오류인 경우 - 실제로 진행 중이므로 재시도하지 않음
                const isAlreadyRunningError = errorMsg.includes('이미 자동화가 실행 중');

                if (isAlreadyRunningError) {
                    // 실제로 자동화가 진행 중이므로 성공으로 간주하고 대기
                    console.log(`[API] ${apiMethod} - 자동화가 이미 실행 중입니다. 진행 상황을 기다립니다...`);
                    if (typeof appendLog === 'function') {
                        appendLog('ℹ️ 자동화가 이미 실행 중입니다. 완료를 기다립니다...');
                    }

                    // 자동화 완료를 기다림 (최대 10분)
                    let waitCount = 0;
                    const maxWait = 120; // 10분 (5초 * 120)

                    while (waitCount < maxWait) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        waitCount++;

                        // 주기적으로 상태 확인 (간단한 체크)
                        try {
                            // 자동화가 완료되었는지 확인하는 로직은 main.ts에서 처리됨
                            // 여기서는 단순히 대기만 함
                            if (waitCount % 12 === 0) { // 1분마다
                                if (typeof appendLog === 'function') {
                                    appendLog(`⏳ 자동화 진행 중... (${Math.floor(waitCount / 12)}분 경과)`);
                                }
                            }
                        } catch (e) {
                            // 무시하고 계속 대기
                        }
                    }

                    // 대기 시간 초과 시 타임아웃으로 처리
                    return {
                        success: false,
                        error: '자동화 완료 대기 시간 초과',
                        retryCount: attempt
                    };
                }

                // 네트워크 오류인 경우 추가 대기
                const isNetworkError = errorMsg.includes('network') ||
                    errorMsg.includes('연결') ||
                    errorMsg.includes('fetch');

                // ✅ 타임아웃 오류 - 네트워크 환경에 따라 재시도
                if (isTimeoutError) {
                    console.log(`[API] ${apiMethod} - 응답 대기 중... (네트워크 환경에 따라 시간이 걸릴 수 있습니다)`);

                    // 마지막 시도가 아니면 계속 재시도
                    if (attempt < retryCount) {
                        const waitMsg = attempt === 0
                            ? '⏳ AI가 콘텐츠를 생성하고 있습니다... 네트워크 환경에 따라 2~5분 정도 소요될 수 있습니다.'
                            : `⏳ 계속 대기 중... (${attempt + 1}/${retryCount + 1}) 네트워크가 느린 경우 더 오래 걸릴 수 있습니다.`;
                        if (typeof appendLog === 'function') {
                            appendLog(waitMsg);
                        }
                        await new Promise(resolve => setTimeout(resolve, retryDelay * 2)); // 타임아웃 시 더 긴 대기
                        continue; // 재시도
                    }

                    // 모든 재시도 실패 시
                    return {
                        success: false,
                        error: '서버 응답 시간 초과\n\n💡 해결 방법:\n1. 네트워크 상태 확인 (Wi-Fi/유선)\n2. 방화벽/백신 프로그램 일시 중지\n3. VPN 사용 시 끄고 다시 시도\n4. 잠시 후 다시 시도',
                        retryCount: attempt
                    } as any;
                }

                // 마지막 시도가 아니면 재시도
                if (attempt < retryCount) {
                    // 지수 백오프 (네트워크 오류 시 더 긴 대기)
                    const baseDelay = isNetworkError ? retryDelay * 2 : retryDelay;
                    const delay = baseDelay * Math.pow(2, attempt);

                    console.log(`[API] ${delay}ms 후 재시도... (${isNetworkError ? '네트워크 오류' : '일반 오류'})`);
                    toastManager.warning(`⚠️ 연결 재시도 중... (${attempt + 1}/${retryCount})`, 2000);

                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // 모든 재시도 실패
        const errorMessage = lastError?.message || '알 수 없는 API 오류';
        console.error(`[API] ${apiMethod} 모든 재시도 실패 (${retryCount + 1}회):`, errorMessage);
        toastManager.error(`❌ 연결 실패: ${apiMethod} - ${errorMessage}`, 5000);

        // ✅ [2026-01-29] Circuit Breaker 실패 기록
        this.recordFailure();

        return {
            success: false,
            error: errorMessage,
            retryCount: retryCount
        };
    }

    // 캐시 확인
    private checkCache(key: string, cacheTime: number): boolean {
        const cached = this.cache.get(key);
        if (!cached) return false;

        const now = Date.now();
        if (now - cached.timestamp > cacheTime) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    // 캐시 저장
    private setCache(key: string, data: any): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // 캐시 클리어
    clearCache(): void {
        this.cache.clear();
    }

    // 캐시 통계
    getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    // API 상태 모니터링
    async getApiHealth(): Promise<{
        cacheSize: number;
        pendingRequests: number;
        cacheHitRate?: number;
    }> {
        return {
            cacheSize: this.cache.size,
            pendingRequests: this.pendingRequests.size
        };
    }
}

// 글로벌 API 클라이언트 인스턴스
export const apiClient = EnhancedApiClient.getInstance();
