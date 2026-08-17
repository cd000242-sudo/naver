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
    /*
     * 황금 비율 — 검색량 > 문서수. 사장님 최종 기준(2026-08-12): 이건 자리 판정과
     * 무관하게 전부 통과한다. 경쟁 글이 있어도 수요가 공급을 넘는 밭이다.
     */
    'golden-ratio': { text: '황금 비율', cls: 'tier-a' },
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

/**
 * 어느 판에 쓸 글인가 — 화면 위쪽 선택기.
 *
 * 사장님이 그린 쓰임새: "오늘 네이버 블로그 홈판에는 뭘 적을까, 워드프레스·
 * 티스토리엔 뭘 적을까." 그 고민을 없애는 것이 이 선택기다.
 *
 * 가르는 근거는 **검색결과 배치 순서 실측**이다(serp-layout-advice).
 * 인기글이 위면 네이버 판, 웹사이트가 위면 SEO 판이다.
 */
export const WRITE_LANES: ReadonlyArray<{ id: string; label: string; hint: string }> = [
    { id: 'all', label: '전체', hint: '' },
    { id: 'naver-blog', label: '네이버 홈판', hint: '인기글이 검색결과 위에 뜹니다 — 네이버 블로그로 붙는 자리' },
    /*
     * 애드센스 레인(사장님 지시 2026-08-17: "구글 애드센스용/네이버 블로그용
     * 나눠서 보고 싶다"). 근거는 배치 순서가 아니라 **의도·CPC 실측**(platform-lane
     * 판정, adsenseFit)이다 — 거래형(광고 클릭이 안 나오는 검색)은 여기 안 든다.
     */
    { id: 'adsense', label: '애드센스 (티스토리·구글)', hint: '정보형 검색 실측 — 광고 게재·클릭이 나오는 수익형 자리' },
    { id: 'wordpress', label: 'SEO (워드프레스·티스토리)', hint: '웹사이트가 블로그보다 위에 뜹니다 — 자체 사이트가 유리한 자리' },
    { id: 'kin', label: '지식iN', hint: '지식iN 이 위에 뜹니다 — 답변으로 유입을 끌어오는 편이 빠른 자리' },
    { id: 'shopping', label: '상품·제휴', hint: '쇼핑이 맨 위를 먹습니다 — 글보다 상품이 붙는 자리' },
];

/**
 * 행이 이 레인에 속하는가 — 레인마다 판정 근거가 다르므로 여기 한 곳에 둔다.
 * 애드센스만 실측 의도 판정(adsenseFit)이고 나머지는 배치 순서(layoutBestFor)다.
 */
export function rowMatchesWriteLane(
    row: { layoutBestFor?: string | null; adsenseFit?: boolean | null },
    laneId: string,
): boolean {
    if (laneId === 'all') return true;
    if (laneId === 'adsense') return row.adsenseFit === true;
    return row.layoutBestFor === laneId;
}

/**
 * 시기 그룹 배지 — "언제 쓸 것"(데이터랩 24개월 실측의 산술, preemption-timing-group).
 * 시기 그룹이 있으면 트렌드 배지 대신 이걸 단다 — 같은 사실의 더 행동적인 표현이라
 * 배지 수(사장님 지시: 셋만)를 늘리지 않는다. 빈 문자열 = 미측정 = 배지 없음.
 */
export const TIMING_BADGE: Record<string, { cls: string }> = {
    '지금 적기': { cls: 'timing-now' },
    '준비 시기': { cls: 'timing-prep' },
    '지금 뜨는 중': { cls: 'timing-rising' },
    '연중 상시': { cls: 'timing-evergreen' },
};
