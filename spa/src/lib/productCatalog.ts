/**
 * 제품 목록 — 상점이 그리는 것의 단일 출처.
 *
 * 화면에 제품을 적어 두지 않는다. 여기 행을 하나 더하면 상점에 카드가 하나
 * 생기고, status 를 'off' 로 바꾸면 사라진다. 나중에 어드민이 이 모양 그대로
 * 내려 주면 코드를 고칠 일도 없어진다(사장님 요구: "계속 제품을 추가할 수 있게").
 *
 * 값 규칙 하나만 지킨다 — **개별 합계가 올인원보다 비싸야** 한다.
 * 그래야 하나만 필요한 사람은 개별로 사고, 둘 이상 필요한 사람이 스스로
 * 올인원을 고른다. 강요가 아니라 산수다.
 *
 * 10월 1일 0시 정각에 모든 값이 두 배가 된다 — pricingSchedule 이 그 시각을 쥐고
 * 있고, 여기서는 이벤트가만 적는다. 정가는 두 배로 계산된다.
 */

export type TermId = 'monthly' | 'yearly' | 'lifetime';

export type Term = { id: TermId; label: string; note?: string; months: number | null };

/**
 * 기간 셋. 3개월은 뺐다 — 1개월과 1년 사이에서 아무 일도 하지 않고
 * 고민만 하나 늘렸다(사장님 결정 2026-08-20).
 */
export const TERMS: Term[] = [
    { id: 'monthly', label: '1개월', months: 1 },
    { id: 'yearly', label: '1년', note: '가장 많이 삽니다', months: 12 },
    { id: 'lifetime', label: '영구제', months: null },
];

export type Product = {
    id: string;
    name: string;
    /** 이름 밑에 작게 붙는 한 줄. */
    tagline: string;
    /** 기능 나열이 아니라 결과 한 문장. */
    summary: string;
    /** 라이선스 발급 때 박히는 값. 백엔드 PLATFORMS 와 같은 이름이어야 한다. */
    licensePlatform: string;
    /** 카드 그림. 기존 사이트에 이미 있는 파일만 쓴다 — 없는 이미지를 지어내지 않는다. */
    image: string;
    accent: string;
    glyph: string;
    /** 이벤트가. 비어 있으면 그 기간은 팔지 않는다. */
    prices: Partial<Record<TermId, number>>;
    features: string[];
    /** 내려받아 체험할 수 있으면 여기에 적는다. */
    trial?: { limits: string[]; download: string; size?: string };
    /** 묶음 상품인가 — 올인원 하나뿐이지만 규칙으로 둔다. */
    bundle?: boolean;
    status: 'on' | 'off';
};

export const PRODUCTS: Product[] = [
    {
        id: 'naver',
        name: 'Better Life Naver',
        tagline: '네이버 블로그 자동화',
        summary: '키워드만 넣으면 글·이미지 구성까지 만들어 예약 발행합니다.',
        licensePlatform: 'LEADERNAM',
        image: '/images/feature-auto-publish.png',
        accent: '#34d399',
        glyph: '✎',
        prices: { monthly: 29000, yearly: 300000, lifetime: 1500000 },
        features: ['AI 글 생성 · 이미지 구성', '예약 발행과 발행 한도 관리', '댓글 크롤링과 응답', '이메일 고객 지원'],
        trial: { limits: ['30일 동안 · 하루 3편까지', 'LEWORD·Orbit 은 따로 구매하셔야 합니다'], download: '/download' },
        status: 'on',
    },
    {
        id: 'orbit',
        name: 'Leadernam Orbit',
        tagline: '워드프레스 · 티스토리 · 블로그스팟',
        summary: '세 블로그에 글을 쓰고 관리합니다. 외부 유입용 글과 카드뉴스까지 만듭니다.',
        licensePlatform: 'ORBIT',
        image: '/images/orbit/leadernam-orbit-download-fast.jpg',
        accent: '#818cf8',
        glyph: '◎',
        prices: { monthly: 39000, yearly: 400000, lifetime: 2000000 },
        features: ['워드프레스 · 티스토리 · 블로그스팟 발행', '발행한 글 관리', '외부 유입용 글 만들기 · 홍보', '카드뉴스 만들기'],
        trial: { limits: ['30일 동안 · 하루 3편까지'], download: '/download' },
        status: 'on',
    },
    {
        id: 'leword',
        name: 'LEWORD',
        tagline: '키워드마스터',
        summary: '검색결과를 직접 열어 보고 지금 들어갈 자리가 있는 키워드만 남깁니다.',
        licensePlatform: 'LEWORD',
        image: '/images/leword/hero-banner-fast.jpg',
        accent: '#f0b53f',
        glyph: '◆',
        prices: { monthly: 9900, yearly: 150000, lifetime: 750000 },
        features: ['황금키워드 보드 · 하루 갱신', '키워드 분석 · 검색량 문서수 실측', '지식인 황금질문', '유튜브 급상승 글감'],
        // 설치가 없다 — 로그인만 하면 브라우저에서 바로 열린다.
        status: 'on',
    },
    {
        id: 'all',
        name: '올인원',
        tagline: '전 제품을 하나로',
        summary: '기간 안에 새 제품이 나오면 그것도 그대로 쓰실 수 있습니다.',
        licensePlatform: 'ALL',
        image: '/images/leword/hero-banner.png',
        accent: '#ffd88a',
        glyph: '★',
        prices: { monthly: 50000, yearly: 400000, lifetime: 1650000 },
        features: ['Better Life Naver 이용', 'Leadernam Orbit 이용', 'LEWORD 이용', '앞으로 나올 제품 포함', '1:1 우선 지원'],
        bundle: true,
        status: 'on',
    },
];

/** 10월 1일부터의 정가. 규칙이 하나라 곱셈으로 둔다 — 제품마다 적으면 어긋난다. */
export const NORMAL_PRICE_MULTIPLIER = 2;

export const normalPriceOf = (eventPrice: number) => eventPrice * NORMAL_PRICE_MULTIPLIER;

/** 팔고 있는 제품만. status 하나로 상점에서 뺀다. */
export const sellableProducts = () => PRODUCTS.filter((product) => product.status === 'on');

/** 묶음이 아닌 것들 — 개별 합계를 낼 때 쓴다. */
export const singleProducts = () => sellableProducts().filter((product) => !product.bundle);

/** 이 기간에 개별로 다 사면 얼마인가. 올인원과 비교해 보여 주는 값이다. */
export function individualTotal(term: TermId): number {
    return singleProducts().reduce((sum, product) => sum + (product.prices[term] || 0), 0);
}

/** 월 얼마 꼴인가. 단순 나눗셈이다 — 영구제는 나눌 기간이 없어 null. */
export function perMonth(price: number, term: TermId): number | null {
    const months = TERMS.find((item) => item.id === term)?.months;
    return months ? Math.round(price / months) : null;
}

export const won = (value: number) => value.toLocaleString('ko-KR');
