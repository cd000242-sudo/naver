/**
 * bannerPhrasePool 헬퍼 단위 테스트
 *
 * 회귀 방지: 풀이 충분히 크고, 최근 N개 회피 로직이 같은 문구를 연달아
 * 반환하지 않는다는 점을 검증한다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    BANNER_HOOK_POOL,
    CTA_HOOK_POOL,
    pickBannerHook,
    pickCtaHook,
    __resetBannerPhraseHistory,
} from '../automation/bannerPhrasePool';

beforeEach(() => {
    __resetBannerPhraseHistory();
});

describe('bannerPhrasePool', () => {
    it('banner pool has at least 15 distinct phrases', () => {
        expect(BANNER_HOOK_POOL.length).toBeGreaterThanOrEqual(15);
        expect(new Set(BANNER_HOOK_POOL).size).toBe(BANNER_HOOK_POOL.length);
    });

    it('cta pool has at least 15 distinct phrases', () => {
        expect(CTA_HOOK_POOL.length).toBeGreaterThanOrEqual(15);
        expect(new Set(CTA_HOOK_POOL).size).toBe(CTA_HOOK_POOL.length);
    });

    it('pickBannerHook never repeats within last 3 calls', () => {
        const picks: string[] = [];
        for (let i = 0; i < 30; i++) {
            picks.push(pickBannerHook());
        }
        // 어느 위치에서도 직전 3개 안에 동일 문구가 들어 있으면 회피 로직 실패.
        for (let i = 3; i < picks.length; i++) {
            const window3 = picks.slice(i - 3, i);
            expect(window3).not.toContain(picks[i]);
        }
    });

    it('pickCtaHook never repeats within last 3 calls', () => {
        const picks: string[] = [];
        for (let i = 0; i < 30; i++) {
            picks.push(pickCtaHook());
        }
        for (let i = 3; i < picks.length; i++) {
            const window3 = picks.slice(i - 3, i);
            expect(window3).not.toContain(picks[i]);
        }
    });

    it('picked phrases always belong to the published pool', () => {
        for (let i = 0; i < 10; i++) {
            expect(BANNER_HOOK_POOL).toContain(pickBannerHook());
            expect(CTA_HOOK_POOL).toContain(pickCtaHook());
        }
    });

    it('produces high diversity in 50 picks (>= 10 unique)', () => {
        const banners = new Set<string>();
        const ctas = new Set<string>();
        for (let i = 0; i < 50; i++) {
            banners.add(pickBannerHook());
            ctas.add(pickCtaHook());
        }
        expect(banners.size).toBeGreaterThanOrEqual(10);
        expect(ctas.size).toBeGreaterThanOrEqual(10);
    });
});
