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
    '상품 정보 자세히 보기 →',
    '현재 가격과 옵션 확인하기 →',
    '실구매 후기 더 보기 →',
    '구성품 확인하기 →',
    '상세 규격 확인하기 →',
    '선택 가능한 색상 보기 →',
    '배송 조건 확인하기 →',
    '교환·반품 조건 확인하기 →',
    '상세 스펙 확인하기 →',
    '정확한 모델명 확인하기 →',
    '판매자 안내 확인하기 →',
    '재질과 크기 확인하기 →',
    '구매 전 Q&A 보기 →',
    '상품 페이지 열기 →',
    '선택 가능한 옵션 보기 →',
    '보관·관리 안내 확인하기 →',
    '호환 정보 확인하기 →',
    '현재 판매 조건 확인하기 →',
    '상품 설명 더 보기 →',
    '다른 구매자 질문 확인하기 →',
];

export const CTA_HOOK_POOL: readonly string[] = [
    '가격과 옵션은 바뀔 수 있으니 결제 전에 한 번 더 확인해보세요',
    '사이즈가 중요하다면 상세 규격부터 확인해보세요',
    '구성품이 필요한 용도와 맞는지 상품 페이지에서 확인해보세요',
    '색상과 모델 옵션을 고르기 전에 차이를 한 번 살펴보세요',
    '실구매 후기가 더 궁금하다면 상품 페이지에서 이어서 볼 수 있어요',
    '배송 일정이 중요하다면 결제 전에 도착 예정일을 확인해보세요',
    '교환과 반품 조건은 판매자 안내에서 확인하는 편이 안전해요',
    '호환이 필요한 제품이라면 모델명을 다시 대조해보세요',
    '사진과 실제 구성 차이가 없는지 상세 설명을 확인해보세요',
    '현재 판매 가격은 상품 페이지에서 다시 확인할 수 있어요',
    '옵션별 구성과 가격 차이를 상품 페이지에서 비교해보세요',
    '보관이나 관리 방법이 궁금하다면 상세 안내를 먼저 확인해보세요',
    '재질과 크기가 사용 공간에 맞는지 마지막으로 확인해보세요',
    '구매자 질문과 판매자 답변도 함께 보면 판단하기 편해요',
    '정확한 제품명과 모델 번호를 결제 전에 확인해보세요',
    '필요한 기능이 기본 구성에 포함되는지 확인해보세요',
    '추가 비용이 드는 옵션이 있는지 상품 설명에서 확인해보세요',
    '사용 조건과 주의사항은 상세 페이지에서 한 번 더 살펴보세요',
    '현재 선택 가능한 옵션을 확인한 뒤 결정해보세요',
    '제가 정리한 내용과 현재 판매 조건이 같은지 마지막으로 확인해보세요',
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
