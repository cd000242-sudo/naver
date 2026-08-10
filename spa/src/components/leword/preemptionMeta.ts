/**
 * 선점 보드 카드가 쓰는 표시 상수.
 *
 * 화면 컴포넌트에서 떼어 둔다 — 배지 문구·정렬 순서는 판정 규칙이 바뀌면 같이 바뀌는
 * 값이라, 렌더 코드 사이에 흩어져 있으면 한쪽만 고치는 사고가 난다.
 */

/** 층 배지 — 확실한 것부터 색이 강하다. 없는 확신을 색으로 만들지 않는다. */
export const TIER_BADGE: Record<string, { text: string; cls: string }> = {
    top3: { text: '상위 3위권 빈자리', cls: 'tier-a' },
    page1: { text: '1페이지 빈자리', cls: 'tier-b' },
    'page1-weak': { text: '1페이지 빈자리', cls: 'tier-c' },
    contested: { text: '경합', cls: 'tier-d' },
};

/** 층 우선순위. 화면 정렬에만 쓴다 — 점수로 노출하지 않는다. */
export const TIER_RANK: Record<string, number> = { top3: 0, page1: 1, 'page1-weak': 2, contested: 3 };

export const EVIDENCE_ICON: Record<string, string> = {
    'open-slot': '⌖',
    contested: '△',
    'empty-field': '◎',
    'stale-top': '◷',
    fresh: '✦',
    'not-realtime': '◇',
    demand: '▲',
};

/** 블로그탭으로 바로 보낸다 — 사용자가 자리를 자기 눈으로 확인할 수 있어야 한다. */
export function naverSearchUrl(keyword: string) {
    return `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(keyword)}`;
}

/**
 * 배치 순서로 가른 "싸울 판". 배지 문구는 짧게 — 카드 머리에 다른 배지와 나란히 선다.
 * 자세한 이유는 계획 창에서 한 줄로 설명한다.
 */
export const SURFACE_TAG: Record<string, string> = {
    'naver-blog': '네이버 블로그 판',
    wordpress: '워드프레스 판',
    kin: '지식iN 판',
    shopping: '상품·제휴 판',
};
