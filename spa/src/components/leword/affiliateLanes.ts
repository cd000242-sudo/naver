/**
 * 제휴 레인 정의와 줄 세우기.
 *
 * 무엇을 파는가: "지금 글을 쓰면 성과가 날 자리에 있는 상품".
 * 그 판단은 전부 선점 보드가 실측한 값에서 나온다 —
 *   ① 쇼핑 구획이 실제로 떴는가(팔리는 물건이 있는 검색어인가)
 *   ② 상품명·가격이 화면에서 읽혔는가
 *   ③ 검색량 ÷ 문서수 (황금지수)
 *   ④ 상위에 자리가 있는가
 *
 * **솔직하게 짚고 갈 것:** 세 플랫폼의 캠페인·상품 목록을 우리가 직접 가져오지
 * 못한다. 실측(2026-08-10, Web Unlocker)에서 토스 쉐어링크·브랜드커넥트는 둘 다
 * 로그인 뒤에 있었고, 봇 탐지를 뚫는 것과 인증은 다른 문제다. 쿠팡은 파트너스
 * API 로 가능한데 키가 서버에 들어가야 켜진다.
 * 그래서 **없는 목록을 지어내지 않고**, 실측된 상품 자리를 세 레인에 공통으로
 * 싣되 각 레인이 무엇을 확인해야 하는지 명확히 적는다.
 */

export type LaneId = 'coupang' | 'toss' | 'brandconnect';

export interface AffiliateLane {
    id: LaneId;
    label: string;
    /** 이 레인에서 무엇을 하는지 한 줄. */
    desc: string;
    /** 지금 상태를 솔직하게. 연동 전이면 그렇게 적는다. */
    status: string;
    /** 사용자가 실제로 붙이러 갈 곳. */
    consoleUrl: string;
    /** 키워드로 바로 검색해 볼 수 있는 곳. 없으면 null. */
    search: ((keyword: string) => string) | null;
}

export const AFFILIATE_LANES: readonly AffiliateLane[] = [
    {
        id: 'coupang',
        label: '쿠팡 파트너스',
        desc: '상품명이 실제로 읽힌 자리만. 무슨 물건인지 확인된 것들입니다.',
        status: '파트너스 키를 서버에 넣으면 실제 상품·이미지·베스트 순위가 채워집니다',
        consoleUrl: 'https://partners.coupang.com/',
        search: (keyword: string) => `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}`,
    },
    {
        id: 'toss',
        label: '토스쇼핑 쉐어링크',
        desc: '상품 카드는 떴는데 브랜드가 특정되지 않은 자리입니다.',
        status: '캠페인 목록이 로그인 뒤에 있어 자동으로 못 가져옵니다 — 콘솔에서 확인하세요',
        consoleUrl: 'https://sharelink.toss.im/home',
        search: null,
    },
    {
        id: 'brandconnect',
        label: '네이버 브랜드커넥트',
        desc: '검색어가 브랜드를 콕 집은 자리. 협찬이 붙는 지점입니다.',
        status: '캠페인 목록이 로그인 뒤에 있어 자동으로 못 가져옵니다 — 콘솔에서 확인하세요',
        consoleUrl: 'https://brandconnect.naver.com/',
        search: null,
    },
];

export interface AffiliateRow {
    keyword: string;
    topic: string;
    tierLabel?: string;
    openSlot?: number | null;
    searchVolume: number | null;
    documentCount: number | null;
    serpSections?: string[];
    meaning?: {
        productNames?: string[];
        priceMedian?: number | null;
        priceSamples?: number;
        questions?: string[];
    } | null;
}

const ratio = (row: AffiliateRow) => {
    if (!row.searchVolume || !row.documentCount) return 0;
    return row.searchVolume / row.documentCount;
};

const productName = (row: AffiliateRow) => (row.meaning?.productNames || [])[0] || '';

/**
 * 검색어가 특정 브랜드를 가리키는가.
 *
 * 쇼핑 카드 상품명의 첫 어절이 브랜드다('에이블미 전문가용 애견…' → 에이블미).
 * 그 말이 검색어 안에 있으면 사람들이 **그 브랜드를 콕 집어** 찾는 것이다.
 * 브랜드 협찬(브랜드커넥트)이 붙을 수 있는 자리는 여기다.
 */
export function brandToken(row: AffiliateRow): string {
    const first = productName(row).trim().split(/\s+/)[0] || '';
    if (first.length < 2) return '';
    return row.keyword.replace(/\s+/g, '').includes(first) ? first : '';
}

/**
 * 제휴로 쓸 만한 행만 남긴다.
 *
 * 기준은 하나 — **쇼핑 구획이 실제로 떴을 것.** 네이버가 그 검색어에 상품 카드를
 * 내놨다는 건 파는 물건이 있다는 뜻이고, 그게 제휴가 성립하는 최소 조건이다.
 */
export function affiliateRows(rows: readonly AffiliateRow[]): AffiliateRow[] {
    return rows
        .filter((row) => (row.serpSections || []).includes('쇼핑'))
        .sort((a, b) => ratio(b) - ratio(a));
}

/**
 * 레인마다 다른 몫을 준다.
 *
 * 세 플랫폼의 상품 목록을 우리가 못 가져오므로(로그인 뒤에 있다), 대신
 * **실측으로 갈리는 성질**로 나눈다:
 *   쿠팡        — 상품명이 실제로 읽힌 자리. 실물 상품이 확인된 것만.
 *   브랜드커넥트 — 검색어가 브랜드를 콕 집은 자리. 협찬이 붙는 지점이다.
 *   토스         — 상품 카드는 떴는데 브랜드가 특정되지 않은 자리.
 *                  무슨 물건인지부터 콘솔에서 확인해야 한다.
 */
export function rowsForLane(lane: LaneId, rows: readonly AffiliateRow[]): AffiliateRow[] {
    if (lane === 'coupang') return rows.filter((row) => productName(row) !== '');
    if (lane === 'brandconnect') return rows.filter((row) => brandToken(row) !== '');
    return rows.filter((row) => productName(row) === '');
}
