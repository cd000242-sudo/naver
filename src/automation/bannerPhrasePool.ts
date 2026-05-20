/**
 * Banner / CTA hook phrase pool with recency avoidance.
 *
 * 문제: 기존 hard-coded 풀이 ctaHelpers.ts / editorHelpers.ts / naverBlogAutomation.ts
 * 세 곳에 각각 5~8개로 작게 흩어져 있어 연속발행 시 같은 문구가 자주 반복됐다.
 *
 * 해결: 단일 풀(각 20개)로 통합하고, 모듈 스코프 ring buffer 로 최근 N개를
 * 회피하여 같은 문구가 연달아 등장하지 않게 한다. main 프로세스 단일 worker
 * 수명 동안 상태가 유지된다.
 */

export const BANNER_HOOK_POOL: readonly string[] = [
    '✓ 할인가 확인하기 →',
    '[공식] 최저가 보러가기 →',
    '지금 바로 구매하기 →',
    '▶ 상품 자세히 보기',
    '할인 혜택 확인 →',
    '🔥 오늘만 특가 →',
    '✨ 신상품 살펴보기 →',
    '🎁 쿠폰 받고 구매하기 →',
    '⚡ 빠른배송 상품 보기 →',
    '💎 베스트 리뷰 확인 →',
    '👉 가격 비교하기 →',
    '🛒 장바구니 담기 →',
    '📦 무료배송 확인 →',
    '💰 추가 할인 받기 →',
    '🏆 인기 상품 보러가기 →',
    '🆕 신상 출시 기념가 →',
    '🎯 한정 수량 구매하기 →',
    '🔍 상세 스펙 확인 →',
    '⭐ 리뷰 4.8점 제품 →',
    '🚀 품절 임박 상품 →',
];

export const CTA_HOOK_POOL: readonly string[] = [
    '🔥 지금 안사면 내일은 품절! 장바구니 담기',
    '💸 이 가격에 이 퀄리티? 리뷰 4.8점 인증 제품',
    '⚡ 오늘만 이 가격! 무료배송에 추가 할인까지',
    '🛒 수만 명이 선택한 인기템, 고민 말고 바로 구매',
    '💥 이번 달 가장 잘 팔린 베스트셀러, 놓치면 후회',
    '✨ 가성비 최고! 다른 제품과 비교 불가',
    '🎁 지금 구매하면 사은품 증정 이벤트 중',
    '🏃 남은 재고 얼마 없어요! 서두르세요',
    '💎 후기 좋은 베스트 상품, 지금 바로 확인',
    '🏆 카테고리 1위 제품, 한 번 써보세요',
    '🆕 따끈따끈 신상품, 출시 기념 할인 진행 중',
    '🎯 망설일 시간이 없습니다 — 한정 수량 특가',
    '⏰ 24시간 한정 타임 세일, 놓치면 정가 복귀',
    '📦 오늘 주문 → 내일 도착, 빠른배송 가능',
    '💰 카드사 즉시 할인까지, 진짜 최저가 도전',
    '🚚 무료배송 + 무료반품, 부담 없이 시작',
    '🔔 알림 받은 분만 누리는 추가 할인 혜택',
    '👀 비슷한 제품 둘러봤다면 이건 꼭 비교해보세요',
    '🎉 이벤트가, 정가보다 3만원 저렴!',
    '🥇 작년 한 해 가장 많이 팔린 베스트셀러',
];

const RECENT_AVOID_COUNT = 3;
const recentBannerPicks: string[] = [];
const recentCtaPicks: string[] = [];

function pickAvoidingRecent(pool: readonly string[], recent: string[]): string {
    // 풀에서 최근 사용 N개를 제외한 후보군 구성. 전부 회피되면 풀 그대로 fallback.
    const candidates = pool.filter(p => !recent.includes(p));
    const effectivePool = candidates.length > 0 ? candidates : pool;
    const picked = effectivePool[Math.floor(Math.random() * effectivePool.length)];

    recent.push(picked);
    while (recent.length > RECENT_AVOID_COUNT) {
        recent.shift();
    }
    return picked;
}

export function pickBannerHook(): string {
    return pickAvoidingRecent(BANNER_HOOK_POOL, recentBannerPicks);
}

export function pickCtaHook(): string {
    return pickAvoidingRecent(CTA_HOOK_POOL, recentCtaPicks);
}

/** Test helper: clear recency history so tests are deterministic. */
export function __resetBannerPhraseHistory(): void {
    recentBannerPicks.length = 0;
    recentCtaPicks.length = 0;
}
