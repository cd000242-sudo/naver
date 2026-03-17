/**
 * 레이트 리미터
 * @module crawler/shopping/utils/RateLimiter
 * 
 * API 차단 방지를 위한 요청 속도 제한
 */

import { ShoppingPlatform, RATE_LIMITS } from '../types.js';

interface RateLimitState {
    tokens: number;
    lastRefill: number;
}

export class RateLimiter {
    private states: Map<ShoppingPlatform, RateLimitState> = new Map();

    /**
     * 요청 전 토큰 획득 대기
     */
    async acquire(platform: ShoppingPlatform): Promise<void> {
        const limit = RATE_LIMITS[platform];
        let state = this.states.get(platform);

        if (!state) {
            state = { tokens: limit.requests, lastRefill: Date.now() };
            this.states.set(platform, state);
        }

        // 토큰 리필 (시간 경과에 따라)
        const now = Date.now();
        const elapsed = (now - state.lastRefill) / 1000;
        const refillRate = limit.requests / limit.perSeconds;
        const toRefill = Math.floor(elapsed * refillRate);

        if (toRefill > 0) {
            state.tokens = Math.min(limit.requests, state.tokens + toRefill);
            state.lastRefill = now;
        }

        // 토큰이 없으면 대기
        if (state.tokens <= 0) {
            const waitTime = Math.ceil((1 / refillRate) * 1000);
            console.log(`[RateLimiter] ⏳ ${platform} 대기 중: ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            state.tokens = 1;
        }

        state.tokens--;
        console.log(`[RateLimiter] ✅ ${platform} 토큰 사용 (남은 토큰: ${state.tokens})`);
    }

    /**
     * 현재 상태 조회
     */
    getStatus(platform: ShoppingPlatform): { tokens: number; limit: number } {
        const state = this.states.get(platform);
        const limit = RATE_LIMITS[platform];
        return {
            tokens: state?.tokens ?? limit.requests,
            limit: limit.requests,
        };
    }

    /**
     * 리셋
     */
    reset(platform?: ShoppingPlatform): void {
        if (platform) {
            this.states.delete(platform);
        } else {
            this.states.clear();
        }
        console.log(`[RateLimiter] 🔄 리셋: ${platform || '전체'}`);
    }
}

// 싱글톤 인스턴스
export const rateLimiter = new RateLimiter();
