/**
 * 이미지 캐시 (LRU)
 * @module crawler/shopping/utils/ImageCache
 * 
 * 동일 URL 반복 수집 방지
 * 대규모 발행 시 I/O 절약
 */

import { CollectionResult } from '../types.js';

interface CacheEntry {
    result: CollectionResult;
    timestamp: number;
}

export class ImageCache {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly maxSize: number;
    private readonly ttlMs: number;

    constructor(maxSize = 1000, ttlHours = 24) {
        this.maxSize = maxSize;
        this.ttlMs = ttlHours * 60 * 60 * 1000;
    }

    /**
     * URL 정규화 (캐시 키 생성)
     */
    private normalizeUrl(url: string): string {
        try {
            const parsed = new URL(url);
            // 쿼리 파라미터 중 추적 관련 제거
            ['NaPm', 'utm_source', 'utm_medium', 'utm_campaign', 'originChannelInfo'].forEach(param => {
                parsed.searchParams.delete(param);
            });
            return parsed.toString();
        } catch {
            return url;
        }
    }

    /**
     * 캐시에서 조회
     */
    get(url: string): CollectionResult | null {
        const key = this.normalizeUrl(url);
        const entry = this.cache.get(key);

        if (!entry) return null;

        // TTL 만료 체크
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            console.log(`[ImageCache] 🕐 TTL 만료: ${key.substring(0, 50)}...`);
            return null;
        }

        console.log(`[ImageCache] ✅ 캐시 히트: ${key.substring(0, 50)}...`);
        return entry.result;
    }

    /**
     * 캐시에 저장
     */
    set(url: string, result: CollectionResult): void {
        const key = this.normalizeUrl(url);

        // LRU: 가장 오래된 항목 제거
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
                console.log(`[ImageCache] 🗑️ LRU 제거: ${oldestKey.substring(0, 50)}...`);
            }
        }

        this.cache.set(key, {
            result,
            timestamp: Date.now(),
        });

        console.log(`[ImageCache] 💾 캐시 저장: ${key.substring(0, 50)}... (총 ${this.cache.size}개)`);
    }

    /**
     * 캐시 존재 여부
     */
    has(url: string): boolean {
        const key = this.normalizeUrl(url);
        const entry = this.cache.get(key);

        if (!entry) return false;

        // TTL 만료 체크
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 캐시 삭제
     */
    delete(url: string): boolean {
        const key = this.normalizeUrl(url);
        return this.cache.delete(key);
    }

    /**
     * 전체 캐시 클리어
     */
    clear(): void {
        this.cache.clear();
        console.log('[ImageCache] 🧹 캐시 전체 클리어');
    }

    /**
     * 캐시 통계
     */
    getStats(): { size: number; maxSize: number; ttlHours: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ttlHours: this.ttlMs / (60 * 60 * 1000),
        };
    }
}

// 싱글톤 인스턴스
export const imageCache = new ImageCache();
