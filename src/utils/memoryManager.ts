/**
 * 🧹 메모리 관리 유틸리티
 * 
 * 장시간 실행 안정성을 위한 메모리 관리 시스템
 */

// 이미지 캐시 크기 제한 (50MB)
const MAX_IMAGE_CACHE_SIZE = 50 * 1024 * 1024;

// 캐시 정리 주기 (5분)
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;

// 글로벌 참조 정리 주기 (10분)
const GLOBAL_CLEANUP_INTERVAL = 10 * 60 * 1000;

interface CacheEntry {
    data: string;
    size: number;
    lastAccessed: number;
    key: string;
}

/**
 * 이미지 캐시 관리자
 */
class ImageCacheManager {
    private cache = new Map<string, CacheEntry>();
    private totalSize = 0;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.startAutoCleanup();
    }

    /**
     * 캐시에 이미지 추가
     */
    set(key: string, data: string): void {
        const size = this.estimateSize(data);

        // 기존 항목이 있으면 먼저 제거
        if (this.cache.has(key)) {
            const existing = this.cache.get(key)!;
            this.totalSize -= existing.size;
        }

        // 용량 초과 시 오래된 항목 제거
        while (this.totalSize + size > MAX_IMAGE_CACHE_SIZE && this.cache.size > 0) {
            this.evictOldest();
        }

        const entry: CacheEntry = {
            data,
            size,
            lastAccessed: Date.now(),
            key
        };

        this.cache.set(key, entry);
        this.totalSize += size;
    }

    /**
     * 캐시에서 이미지 가져오기
     */
    get(key: string): string | null {
        const entry = this.cache.get(key);
        if (entry) {
            entry.lastAccessed = Date.now();
            return entry.data;
        }
        return null;
    }

    /**
     * 캐시 항목 존재 여부
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * 특정 항목 삭제
     */
    delete(key: string): boolean {
        const entry = this.cache.get(key);
        if (entry) {
            this.totalSize -= entry.size;
            return this.cache.delete(key);
        }
        return false;
    }

    /**
     * 가장 오래된 항목 제거
     */
    private evictOldest(): void {
        let oldest: CacheEntry | null = null;

        for (const entry of this.cache.values()) {
            if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
                oldest = entry;
            }
        }

        if (oldest) {
            this.delete(oldest.key);
            console.log(`[MemoryManager] 캐시 정리: ${oldest.key} (${this.formatSize(oldest.size)})`);
        }
    }

    /**
     * 사용되지 않는 오래된 캐시 정리 (5분 이상 미사용)
     */
    cleanupStale(): number {
        const staleThreshold = Date.now() - (5 * 60 * 1000);
        let cleanedCount = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < staleThreshold) {
                this.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`[MemoryManager] ${cleanedCount}개 오래된 캐시 항목 정리`);
        }

        return cleanedCount;
    }

    /**
     * 전체 캐시 삭제
     */
    clear(): void {
        this.cache.clear();
        this.totalSize = 0;
        console.log('[MemoryManager] 이미지 캐시 전체 삭제');
    }

    /**
     * 현재 캐시 상태
     */
    getStats(): { count: number; size: number; maxSize: number } {
        return {
            count: this.cache.size,
            size: this.totalSize,
            maxSize: MAX_IMAGE_CACHE_SIZE
        };
    }

    /**
     * 자동 정리 시작
     */
    private startAutoCleanup(): void {
        if (this.cleanupTimer) return;

        this.cleanupTimer = setInterval(() => {
            this.cleanupStale();
        }, CACHE_CLEANUP_INTERVAL);

        console.log('[MemoryManager] 이미지 캐시 자동 정리 시작');
    }

    /**
     * 자동 정리 중지
     */
    stopAutoCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            console.log('[MemoryManager] 이미지 캐시 자동 정리 중지');
        }
    }

    /**
     * 데이터 크기 추정 (바이트)
     */
    private estimateSize(data: string): number {
        // Base64 데이터의 경우 실제 크기 추정
        if (data.startsWith('data:')) {
            const base64Part = data.split(',')[1] || '';
            return Math.ceil(base64Part.length * 0.75);
        }
        // URL의 경우 작은 크기
        return data.length * 2;
    }

    /**
     * 크기 포맷팅
     */
    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
}

/**
 * 글로벌 참조 정리 관리자
 */
class GlobalCleanupManager {
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private cleanupCallbacks: Array<() => void> = [];

    constructor() {
        this.startAutoCleanup();
    }

    /**
     * 정리 콜백 등록
     */
    register(callback: () => void): void {
        this.cleanupCallbacks.push(callback);
    }

    /**
     * 모든 정리 콜백 실행
     */
    runCleanup(): void {
        console.log(`[MemoryManager] 글로벌 정리 실행 (${this.cleanupCallbacks.length}개 콜백)`);

        for (const callback of this.cleanupCallbacks) {
            try {
                callback();
            } catch (error) {
                console.error('[MemoryManager] 정리 콜백 오류:', error);
            }
        }

        // 가비지 컬렉션 힌트 (Chrome에서만 동작)
        if (typeof (globalThis as any).gc === 'function') {
            try {
                (globalThis as any).gc();
                console.log('[MemoryManager] GC 힌트 실행');
            } catch {
                // GC 함수 없음
            }
        }
    }

    /**
     * 자동 정리 시작
     */
    private startAutoCleanup(): void {
        if (this.cleanupTimer) return;

        this.cleanupTimer = setInterval(() => {
            this.runCleanup();
        }, GLOBAL_CLEANUP_INTERVAL);

        console.log('[MemoryManager] 글로벌 자동 정리 시작 (10분 주기)');
    }

    /**
     * 자동 정리 중지
     */
    stopAutoCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}

/**
 * 메모리 사용량 모니터
 */
class MemoryMonitor {
    private warningThreshold = 500 * 1024 * 1024; // 500MB
    private criticalThreshold = 800 * 1024 * 1024; // 800MB

    /**
     * 현재 메모리 사용량 확인 (사용 가능한 경우)
     */
    getUsage(): { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number } | null {
        if (typeof performance !== 'undefined' && (performance as any).memory) {
            const memory = (performance as any).memory;
            return {
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize,
                jsHeapSizeLimit: memory.jsHeapSizeLimit
            };
        }
        return null;
    }

    /**
     * 메모리 경고 수준 확인
     */
    checkLevel(): 'normal' | 'warning' | 'critical' {
        const usage = this.getUsage();
        if (!usage || !usage.usedJSHeapSize) return 'normal';

        if (usage.usedJSHeapSize >= this.criticalThreshold) return 'critical';
        if (usage.usedJSHeapSize >= this.warningThreshold) return 'warning';
        return 'normal';
    }

    /**
     * 메모리 사용량 로그
     */
    logUsage(): void {
        const usage = this.getUsage();
        if (usage && usage.usedJSHeapSize) {
            const usedMB = (usage.usedJSHeapSize / (1024 * 1024)).toFixed(1);
            const totalMB = ((usage.totalJSHeapSize || 0) / (1024 * 1024)).toFixed(1);
            console.log(`[MemoryMonitor] 메모리 사용량: ${usedMB}MB / ${totalMB}MB`);
        }
    }
}

// 싱글톤 인스턴스
export const imageCacheManager = new ImageCacheManager();
export const globalCleanupManager = new GlobalCleanupManager();
export const memoryMonitor = new MemoryMonitor();

/**
 * 앱 종료 시 정리
 */
export function cleanupAllMemoryManagers(): void {
    imageCacheManager.stopAutoCleanup();
    imageCacheManager.clear();
    globalCleanupManager.stopAutoCleanup();
    console.log('[MemoryManager] 모든 메모리 관리자 정리 완료');
}

/**
 * 기본 글로벌 정리 콜백 등록
 */
globalCleanupManager.register(() => {
    // 오래된 이미지 캐시 정리
    imageCacheManager.cleanupStale();

    // 메모리 상태 로그
    memoryMonitor.logUsage();

    // 메모리 경고 수준 확인
    const level = memoryMonitor.checkLevel();
    if (level === 'critical') {
        console.warn('[MemoryManager] ⚠️ 메모리 사용량 위험 수준! 캐시 전체 삭제');
        imageCacheManager.clear();
    } else if (level === 'warning') {
        console.warn('[MemoryManager] ⚠️ 메모리 사용량 높음');
    }
});
