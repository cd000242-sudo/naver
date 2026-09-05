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
 * 자동 인상은 없다(사장님 2026-09-06 "너무 인상해버리면 몰매맞아") — 10월 1일
 * "두 배 자동 전환"을 끄고, 인상 안내는 시점·폭 없이 "인상 예정"이라고만 한다.
 * 올인원은 이날 1년 40만→50만·영구 165만→200만으로 즉시 조정됐다.
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
        image: '/images/orbit/leadernam-orbit-download-card.webp',
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
        image: '/images/leword/hero-banner-card.webp',
        accent: '#f0b53f',
        glyph: '◆',
        prices: { monthly: 9900, yearly: 150000, lifetime: 750000 },
        features: ['황금키워드 보드 · 하루 갱신', '키워드 분석 · 검색량 문서수 실측', '지식인 황금질문', '유튜브 급상승 글감'],
        // 설치가 없다 — 로그인만 하면 브라우저에서 바로 열린다.
        status: 'on',
    },
    {
        id: 'all',
        name: 'All in one',
        tagline: '전 제품을 하나로',
        summary: '기간 안에 새 제품이 나오면 그것도 그대로 쓰실 수 있습니다.',
        licensePlatform: 'ALL',
        image: '/images/leword/hero-banner.png',
        accent: '#ffd88a',
        glyph: '★',
        prices: { monthly: 50000, yearly: 500000, lifetime: 2000000 },
        features: ['Better Life Naver 이용', 'Leadernam Orbit 이용', 'LEWORD 이용', '앞으로 나올 제품 포함', '1:1 우선 지원'],
        bundle: true,
        status: 'on',
    },
];

/**
 * 자동 인상 배수. 1 = 10월 1일이 지나도 값이 저절로 바뀌지 않는다
 * (사장님 2026-09-06 — 2배 자동 전환 폐기, 인상은 나중에 손으로 정한다).
 * 1보다 크게 돌리면 취소선(정상가)과 전환 청구가 되살아난다.
 */
export const NORMAL_PRICE_MULTIPLIER = 1;

export const normalPriceOf = (eventPrice: number) => eventPrice * NORMAL_PRICE_MULTIPLIER;

/** 어드민 [상점 제품] 탭이 저장하는 덮어쓰기 모양. */
export type StoreProductOverride = {
    name?: string; tagline?: string; summary?: string; licensePlatform?: string;
    status?: 'on' | 'off'; order?: number;
    prices?: Partial<Record<TermId, number>>;
};

/**
 * 어드민 저장값을 카탈로그 위에 얹는다.
 *
 * 여기 네 제품은 씨앗이고, 어드민이 이름·값·순서·판매여부를 바꾸면 그쪽이
 * 이긴다. 어드민이 새로 만든 제품(씨앗에 없는 id)도 카드가 된다 — 그림이
 * 없으니 기호와 색만 기본값으로 받는다. 저장값이 없으면 씨앗 그대로다.
 */
export function applyStoreOverrides(
    overrides?: Record<string, StoreProductOverride> | null,
): Product[] {
    if (!overrides || Object.keys(overrides).length === 0) return PRODUCTS;
    const merged: Product[] = PRODUCTS.map((product) => {
        const patch = overrides[product.id];
        if (!patch) return product;
        return {
            ...product,
            ...(patch.name ? { name: patch.name } : {}),
            ...(patch.tagline ? { tagline: patch.tagline } : {}),
            ...(patch.summary ? { summary: patch.summary } : {}),
            ...(patch.licensePlatform ? { licensePlatform: patch.licensePlatform } : {}),
            ...(patch.status ? { status: patch.status } : {}),
            ...(patch.prices ? { prices: patch.prices } : {}),
            order: patch.order,
        } as Product & { order?: number };
    });
    for (const [id, patch] of Object.entries(overrides)) {
        if (PRODUCTS.some((product) => product.id === id)) continue;
        if (!patch.name || !patch.prices || Object.keys(patch.prices).length === 0) continue;
        merged.push({
            id,
            name: patch.name,
            tagline: patch.tagline || '',
            summary: patch.summary || '',
            licensePlatform: patch.licensePlatform || 'LEWORD',
            image: '',
            accent: '#f0b53f',
            glyph: '✦',
            prices: patch.prices,
            features: [],
            status: patch.status || 'off',
        });
    }
    return merged.sort((left, right) => {
        const a = (left as Product & { order?: number }).order;
        const b = (right as Product & { order?: number }).order;
        return (a ?? PRODUCTS.findIndex((item) => item.id === left.id)) - (b ?? PRODUCTS.findIndex((item) => item.id === right.id));
    });
}

/** 팔고 있는 제품만. status 하나로 상점에서 뺀다. */
export const sellableProducts = (list: Product[] = PRODUCTS) => list.filter((product) => product.status === 'on');

/** 묶음이 아닌 것들 — 개별 합계를 낼 때 쓴다. */
export const singleProducts = (list: Product[] = PRODUCTS) => sellableProducts(list).filter((product) => !product.bundle);

/** 이 기간에 개별로 다 사면 얼마인가. 올인원과 비교해 보여 주는 값이다. */
export function individualTotal(term: TermId, list: Product[] = PRODUCTS): number {
    return singleProducts(list).reduce((sum, product) => sum + (product.prices[term] || 0), 0);
}

/** 월 얼마 꼴인가. 단순 나눗셈이다 — 영구제는 나눌 기간이 없어 null. */
export function perMonth(price: number, term: TermId): number | null {
    const months = TERMS.find((item) => item.id === term)?.months;
    return months ? Math.round(price / months) : null;
}

/**
 * 하루 얼마 꼴인가 — 사장님 지시(2026-08-21): "금액 전부 하루 가격으로 보여주면
 * 싸 보이니까." 단순 나눗셈(월=30일·년=365일)이고 실제 청구액은 항상 병기한다.
 * 영구제는 나눌 기간이 없어 null.
 */
export function perDay(price: number, term: TermId): number | null {
    const days = term === 'monthly' ? 30 : term === 'yearly' ? 365 : null;
    return days ? Math.round(price / days) : null;
}

export const won = (value: number) => value.toLocaleString('ko-KR');
